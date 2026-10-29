import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeneratedTypePath, planGeneratedTypePreparation, requiredFrameworkOutputs, validateGeneratedTypeEvidence } from './generated-types-policy.mjs';

const owners = [
  { path: 'apps/web', framework: 'next', distDir: '.next' },
  { path: 'apps/watch', framework: 'expo', typedRoutes: true },
  { path: 'recipes/router', framework: 'react-router' },
];

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
