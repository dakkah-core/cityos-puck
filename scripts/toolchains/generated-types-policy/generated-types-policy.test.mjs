import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalGeneratedTypeValue, classifyGeneratedTypePath, frameGeneratedTypeField, planGeneratedTypePreparation, requiredFrameworkOutputs, retainGeneratedTypePath, validateGeneratedTypeEvidence } from './generated-types-policy.mjs';

test('generated type field framing preserves boundaries and raw bytes', () => {
  const frame = (...fields) => Buffer.concat(fields.map(value => frameGeneratedTypeField(value)));
  assert.notDeepEqual(frame('a', Buffer.from('x\0b\0y')), frame('a', 'x', 'b', 'y'));
  assert.deepEqual(frame('é'), frame(Buffer.from([0xc3, 0xa9])));
  assert.notDeepEqual(frame(Buffer.from([0xff])), frame('�'));
  assert.throws(() => frameGeneratedTypeField({}), /Expected text or bytes/);
});

test('framework configuration observations are canonical and fail closed on unsupported values', () => {
  assert.equal(canonicalGeneratedTypeValue({ z: 1, a: [true, null] }), canonicalGeneratedTypeValue({ a: [true, null], z: 1 }));
  assert.notEqual(canonicalGeneratedTypeValue({}), canonicalGeneratedTypeValue({ value: undefined }));
  assert.notEqual(canonicalGeneratedTypeValue({ value: -0 }), canonicalGeneratedTypeValue({ value: 0 }));
  for (const value of [NaN, Infinity, () => {}, Symbol('test'), new Date()]) assert.throws(() => canonicalGeneratedTypeValue(value), /unsupported/i);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => canonicalGeneratedTypeValue(cyclic), /unsupported/i);
});

const owners = [
  { path: 'apps/web', framework: 'next', distDir: '.next' },
  { path: 'apps/watch', framework: 'expo', typedRoutes: true },
  { path: 'recipes/router', framework: 'react-router' },
];

test('transient ancestors remain traversable only to preserve registered descendants', () => {
  const trackedGenerated = ['apps/web/.next/evidence/kept.ts'];
  const retained = path => retainGeneratedTypePath({ path, owners, trackedGenerated });
  assert.equal(retained('apps/web/.next'), true);
  assert.equal(retained('apps/web/.next/evidence'), true);
  assert.equal(retained('apps/web/.next/evidence/kept.ts'), true);
  assert.equal(retained('apps/web/.next/types'), false);
  assert.equal(retained('apps/web/.next-other'), true);
  assert.equal(retainGeneratedTypePath({ path: 'apps/web/.next', owners, preserved: ['apps/web/.next/fixture.ts'] }), true);
});

test('classifies only outputs belonging to an observed framework owner', () => {
  const classify = path => classifyGeneratedTypePath({ path, owners });
  assert.equal(classify('apps/web/next-env.d.ts'), 'transient-framework-output');
  assert.equal(classify('apps/web/.next/types/validator.ts'), 'transient-framework-output');
  assert.equal(classify('apps/watch/.expo/types/router.d.ts'), 'transient-framework-output');
  assert.equal(classify('apps/watch/expo-env.d.ts'), 'transient-framework-output');
  assert.equal(classify('recipes/router/.react-router/types/routes.ts'), 'transient-framework-output');
  assert.equal(classify('packages/example/next-env.d.ts'), 'authored-source');
  assert.equal(classify('apps/web/src/env.d.ts'), 'authored-source');
  assert.equal(classify('packages/example/tests/fixtures/retired-next/next-env.d.ts'), 'authored-source');
  assert.equal(classifyGeneratedTypePath({ path: 'apps/web/next-env.d.ts', owners, preserved: ['apps/web/next-env.d.ts'] }), 'preserved-evidence');
  assert.equal(classifyGeneratedTypePath({ path: 'apps/web/generated/schema.ts', owners, trackedGenerated: ['apps/web/generated/schema.ts'] }), 'tracked-generated-artifact');
  assert.equal(classifyGeneratedTypePath({ path: 'next-env.d.ts', owners: [{ path: '.', framework: 'next' }] }), 'transient-framework-output');
  assert.equal(classifyGeneratedTypePath({ path: 'x/next-env.d.ts', owners: [{ path: '.', framework: 'expo' }, { path: 'x', framework: 'next' }] }), 'transient-framework-output');
  assert.ok(requiredFrameworkOutputs(owners[0]).includes('apps/web/.next/types/validator.ts'));
  assert.ok(!requiredFrameworkOutputs(owners[0]).includes('apps/web/.next/types/cache-life.d.ts'));
  assert.ok(requiredFrameworkOutputs({ ...owners[0], distDir: 'build/next', cacheLifeEnabled: true }).includes('apps/web/build/next/types/cache-life.d.ts'));
  assert.ok(!requiredFrameworkOutputs({ ...owners[0], cacheLifeEnabled: false }).includes('apps/web/.next/types/cache-life.d.ts'));
  assert.throws(() => requiredFrameworkOutputs({ ...owners[0], cacheLifeEnabled: 'yes' }), /cacheLifeEnabled/);
  assert.throws(() => requiredFrameworkOutputs({ ...owners[1], cacheLifeEnabled: true }), /cacheLifeEnabled/);
  assert.throws(() => classify('../apps/web/next-env.d.ts'), /path/i);
});

test('requires owner and evidence inputs and creates a stable, ordered plan', () => {
  const request = { owner: owners[0], projects: ['tsconfig.json'], toolchain: { node: 'v1', compiler: 'ts', generator: 'next' }, inputDigests: { routes: 'a'.repeat(64), config: 'b'.repeat(64), lock: 'c'.repeat(64) } };
  const plan = planGeneratedTypePreparation(request);
  assert.deepEqual(plan.steps, ['preflight', 'acquire-locks', 'generate', 'verify-outputs', 'typecheck', 'verify-inputs', 'release-locks']);
  assert.ok(plan.requiredOutputs.includes('apps/web/.next/types/validator.ts'));
  assert.deepEqual(plan, planGeneratedTypePreparation(request));
  assert.throws(() => planGeneratedTypePreparation({ ...request, owner: null }), /owner/i);
  assert.throws(() => planGeneratedTypePreparation({ ...request, inputDigests: {} }), /digest/i);
  assert.throws(() => planGeneratedTypePreparation({ ...request, owner: { path: 'apps/mobile', framework: 'expo' } }), /typedRoutes/i);
  assert.throws(() => planGeneratedTypePreparation({ ...request, owner: owners[2] }), /output/i);
  assert.throws(() => planGeneratedTypePreparation({ ...request, requiredOutputs: ['apps/web/next-env.d.ts'] }), /output/i);
  assert.deepEqual(planGeneratedTypePreparation({ ...request, owner: owners[2], requiredOutputs: ['recipes/router/.react-router/types/routes.ts'] }).requiredOutputs, ['recipes/router/.react-router/types/routes.ts']);
  assert.ok(planGeneratedTypePreparation({ ...request, owner: { path: '.', framework: 'next' } }).requiredOutputs.includes('.next/types/validator.ts'));
  const cacheOwner = { ...owners[0], cacheLifeEnabled: true };
  const cachePlan = planGeneratedTypePreparation({ ...request, owner: cacheOwner });
  assert.ok(cachePlan.requiredOutputs.includes('apps/web/.next/types/cache-life.d.ts'));
  assert.throws(() => planGeneratedTypePreparation({ ...request, owner: cacheOwner, requiredOutputs: plan.requiredOutputs }), /omitted/);
  const evidence = { success: true, toolchain: request.toolchain, inputDigests: request.inputDigests, finalInputDigests: request.inputDigests, projects: request.projects, outputs: Object.fromEntries(plan.requiredOutputs.map(path => [path, 'd'.repeat(64)])) };
  assert.deepEqual(validateGeneratedTypeEvidence(plan, evidence), []);
  assert.ok(validateGeneratedTypeEvidence(plan, { ...evidence, outputs: {} }).some(message => message.includes('output')));
  assert.ok(validateGeneratedTypeEvidence(plan, { ...evidence, finalInputDigests: { ...request.inputDigests, routes: 'e'.repeat(64) } }).some(message => message.includes('routes')));
  assert.ok(validateGeneratedTypeEvidence(plan, { ...evidence, success: false }).some(message => message.includes('failed')));
});
