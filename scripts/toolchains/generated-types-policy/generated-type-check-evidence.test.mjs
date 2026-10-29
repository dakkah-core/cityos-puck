import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { planGeneratedTypeCheckEvidenceV2, validateGeneratedTypeCheckEvidenceV2 } from './generated-type-check-evidence.mjs';
import { canonicalResolutionNamespaceV2 } from './resolution-namespace-v2.mjs';

const hash = character => character.repeat(64);
const inputs = () => Object.fromEntries(['frameworkConfig', 'routeInputs', 'compilerConfig', 'configInputs', 'compilerMembership', 'compilerInputs', 'resolutionInputs', 'lock', 'nodeIdentity', 'compilerIdentity', 'generatorIdentity'].map((key, index) => [key, hash('abcdef01234'[index])]));
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
// Synthetic qualification data exercises the contract; it qualifies no platform.
const qualification = () => ({ platform: 'fixture', mechanism: 'fixture', qualificationDigest: sha256('qualification'), runtimeAllowlistDigest: sha256('allowlist') });
const invocation = projects => sha256(JSON.stringify({ projects, command: 'fixture diagnostic' }));
const namespace = before => ({ schemaVersion: 'cityos.resolution-namespace.v2', roots: ['/workspace'],
  nodes: [{ path: '/workspace', kind: 'directory', identity: 'fixture-root', caseMode: 'sensitive', entries: [] }],
  invocationDigest: invocation(before.projects), nodeIdentity: before.inputDigests.nodeIdentity,
  compilerIdentity: before.inputDigests.compilerIdentity, nativeCompilerIdentity: sha256('native-compiler'), excludedPaths: [] });
const snapshot = (projects, outputs) => {
  const before = { projects, inputDigests: inputs(), outputs: Object.fromEntries(outputs.map(path => [path, hash('9')])) };
  before.inputDigests.resolutionInputs = sha256(canonicalResolutionNamespaceV2(namespace(before)));
  return before;
};
const expoOwner = { path: 'apps/watch', framework: 'expo', typedRoutes: true };
const expoOutputs = ['apps/watch/.expo/types/router.d.ts', 'apps/watch/expo-env.d.ts'];
const projects = ['apps/watch/tsconfig.json'];
const initial = () => snapshot(projects, expoOutputs);
const evidence = before => ({ schemaVersion: 'cityos.generated-type-check-evidence.v2', success: true, checkedMembership: before.inputDigests.compilerMembership, before: structuredClone(before), after: structuredClone(before) });
const namespaceEvidence = before => ({ namespace: namespace(before),
  proof: { schemaVersion: 'cityos.resolution-namespace-proof.v2', namespaceDigest: before.inputDigests.resolutionInputs,
    afterNamespaceDigest: before.inputDigests.resolutionInputs, invocationDigest: invocation(before.projects),
    checkedMembershipDigest: before.inputDigests.compilerMembership, success: true, qualification: qualification(), uncapturedReads: 0 },
  sha256, qualifications: [qualification()], expectedInvocationDigest: invocation(before.projects) });

test('v2 binds independent Expo observations and both generated outputs', () => {
  const before = initial();
  const plan = planGeneratedTypeCheckEvidenceV2({ owner: expoOwner, projects, before });
  assert.deepEqual(plan.requiredOutputs, expoOutputs);
  assert.deepEqual(validateGeneratedTypeCheckEvidenceV2(plan, evidence(before), namespaceEvidence(before)), []);
  for (const key of Object.keys(before.inputDigests)) {
    const changed = evidence(before);
    changed.after.inputDigests[key] = hash('9');
    assert.ok(validateGeneratedTypeCheckEvidenceV2(plan, changed, namespaceEvidence(before)).some(item => item.includes(key)), key);
  }
  for (const output of expoOutputs) {
    const changed = evidence(before);
    changed.after.outputs[output] = hash('f');
    assert.ok(validateGeneratedTypeCheckEvidenceV2(plan, changed, namespaceEvidence(before)).some(item => item.includes(output)));
  }
  const changed = evidence(before);
  changed.checkedMembership = hash('f');
  assert.ok(validateGeneratedTypeCheckEvidenceV2(plan, changed, namespaceEvidence(before)).some(item => item.toLowerCase().includes('membership')));
});

test('v2 rejects missing, malformed, extra and mismatched evidence', () => {
  const before = initial();
  const plan = planGeneratedTypeCheckEvidenceV2({ owner: expoOwner, projects, before });
  for (const bad of [null, {}, { ...evidence(before), schemaVersion: 'v1' }, { ...evidence(before), success: false }, { ...evidence(before), checkedMembership: undefined }]) {
    assert.notEqual(validateGeneratedTypeCheckEvidenceV2(plan, bad, namespaceEvidence(before)).length, 0);
  }
  for (const mutate of [
    value => { delete value.before.inputDigests.configInputs; },
    value => { value.after.inputDigests.lock = 'bad'; },
    value => { value.after.inputDigests.extra = hash('a'); },
    value => { delete value.after.outputs[expoOutputs[1]]; },
    value => { value.after.outputs['apps/watch/extra'] = hash('a'); },
    value => { value.after.projects = ['apps/watch/other.json']; },
  ]) {
    const bad = evidence(before); mutate(bad);
    assert.notEqual(validateGeneratedTypeCheckEvidenceV2(plan, bad, namespaceEvidence(before)).length, 0);
  }
  assert.throws(() => planGeneratedTypeCheckEvidenceV2({ owner: expoOwner, projects, before: { ...before, outputs: {} } }), /output/i);
  assert.throws(() => planGeneratedTypeCheckEvidenceV2({ owner: expoOwner, projects, before: { ...before, inputDigests: {} } }), /digest/i);
});

test('v2 rejects sparse scope and non-data or hidden evidence properties', () => {
  const before = initial();
  const plan = planGeneratedTypeCheckEvidenceV2({ owner: expoOwner, projects, before });
  const sparse = evidence(before);
  sparse.after.projects = new Array(projects.length);
  assert.ok(validateGeneratedTypeCheckEvidenceV2(plan, sparse, namespaceEvidence(before)).some(message => /project scope/.test(message)));

  const hidden = evidence(before);
  Object.defineProperty(hidden.after.inputDigests, 'hidden', { value: true });
  assert.notEqual(validateGeneratedTypeCheckEvidenceV2(plan, hidden, namespaceEvidence(before)).length, 0);

  const symbol = evidence(before);
  symbol.after.outputs[Symbol('extra')] = true;
  assert.notEqual(validateGeneratedTypeCheckEvidenceV2(plan, symbol, namespaceEvidence(before)).length, 0);

  const accessor = evidence(before);
  Object.defineProperty(accessor.after.inputDigests, 'lock', { enumerable: true, get() { throw new Error('accessor must not execute'); } });
  assert.doesNotThrow(() => validateGeneratedTypeCheckEvidenceV2(plan, accessor, namespaceEvidence(before)));
  assert.notEqual(validateGeneratedTypeCheckEvidenceV2(plan, accessor, namespaceEvidence(before)).length, 0);
});

test('v2 supports disabled Expo and Next using the canonical framework requirements', () => {
  const owner = { ...expoOwner, typedRoutes: false };
  const before = snapshot(projects, []);
  const plan = planGeneratedTypeCheckEvidenceV2({ owner, projects, before });
  assert.deepEqual(plan.requiredOutputs, []);
  assert.deepEqual(validateGeneratedTypeCheckEvidenceV2(plan, evidence(before), namespaceEvidence(before)), []);
  assert.throws(() => planGeneratedTypeCheckEvidenceV2({ owner, projects, requiredOutputs: expoOutputs, before: initial() }), /disabled/i);
  const next = { path: 'apps/web', framework: 'next', cacheLifeEnabled: true };
  const nextOutputs = ['apps/web/next-env.d.ts', 'apps/web/.next/types/routes.d.ts', 'apps/web/.next/types/root-params.d.ts', 'apps/web/.next/types/validator.ts', 'apps/web/.next/types/cache-life.d.ts'];
  const nextProjects = ['apps/web/tsconfig.json'];
  const nextBefore = snapshot(nextProjects, nextOutputs);
  const nextPlan = planGeneratedTypeCheckEvidenceV2({ owner: next, projects: nextProjects, before: nextBefore });
  assert.deepEqual(validateGeneratedTypeCheckEvidenceV2(nextPlan, evidence(nextBefore), namespaceEvidence(nextBefore)), []);
  assert.throws(() => planGeneratedTypeCheckEvidenceV2({ owner: next, projects: nextProjects, requiredOutputs: nextOutputs.slice(0, -1), before: nextBefore }), /omitted/i);
});

test('v2 reusable evidence requires independently supplied qualified namespace proof', () => {
  const before = initial();
  const plan = planGeneratedTypeCheckEvidenceV2({ owner: expoOwner, projects, before });
  const check = (data, supplied = evidence(before)) => validateGeneratedTypeCheckEvidenceV2(plan, supplied, data);
  assert.notEqual(check(undefined).length, 0);
  assert.notEqual(check({}).length, 0);
  for (const mutate of [
    value => { delete value.namespace; },
    value => { delete value.proof; },
    value => { value.qualifications = []; },
    value => { value.qualifications[0].mechanism = 'different'; },
    value => { value.expectedInvocationDigest = sha256('different-invocation'); },
    value => { value.proof.invocationDigest = sha256('different-invocation'); },
    value => { value.proof.namespaceDigest = sha256('different-namespace'); },
    value => { value.proof.afterNamespaceDigest = sha256('different-namespace'); },
    value => { value.proof.checkedMembershipDigest = sha256('different-membership'); },
    value => { value.proof.uncapturedReads = 1; },
    value => { value.namespace.nodeIdentity = sha256('different-node'); },
    value => { value.namespace.compilerIdentity = sha256('different-compiler'); },
    value => { value.namespace.nativeCompilerIdentity = sha256('different-native-compiler'); },
    value => { value.namespace.nodes[0].entries.push({ name: 'unrecorded', kind: 'file' }); },
    value => { value.sha256 = () => 'bad'; },
  ]) {
    const supplied = namespaceEvidence(before); mutate(supplied);
    assert.notEqual(check(supplied).length, 0);
  }
  const otherMembership = evidence(before);
  otherMembership.checkedMembership = sha256('different-membership');
  assert.notEqual(check(namespaceEvidence(before), otherMembership).length, 0);
  // A self-consistent different namespace cannot replace the plan's resolution digest.
  const differentNamespace = namespaceEvidence(before);
  differentNamespace.namespace.nativeCompilerIdentity = sha256('different-native');
  differentNamespace.proof.namespaceDigest = sha256(canonicalResolutionNamespaceV2(differentNamespace.namespace));
  differentNamespace.proof.afterNamespaceDigest = differentNamespace.proof.namespaceDigest;
  assert.ok(check(differentNamespace).some(message => /resolutionInputs/.test(message)));
  // Rehashing a namespace does not permit different Node or compiler identities.
  for (const field of ['nodeIdentity', 'compilerIdentity']) {
    const altered = namespaceEvidence(before);
    altered.namespace[field] = sha256(`other ${field}`);
    const newDigest = sha256(canonicalResolutionNamespaceV2(altered.namespace));
    altered.proof.namespaceDigest = newDigest;
    altered.proof.afterNamespaceDigest = newDigest;
    const alteredBefore = structuredClone(before);
    alteredBefore.inputDigests.resolutionInputs = newDigest;
    const alteredPlan = planGeneratedTypeCheckEvidenceV2({ owner: expoOwner, projects, before: alteredBefore });
    assert.ok(validateGeneratedTypeCheckEvidenceV2(alteredPlan, evidence(alteredBefore), altered).some(message => /identity differs/i.test(message)), field);
  }
  const otherInvocation = namespaceEvidence(before);
  otherInvocation.namespace.invocationDigest = sha256('another diagnostic');
  otherInvocation.proof.invocationDigest = otherInvocation.namespace.invocationDigest;
  otherInvocation.proof.namespaceDigest = sha256(canonicalResolutionNamespaceV2(otherInvocation.namespace));
  otherInvocation.proof.afterNamespaceDigest = otherInvocation.proof.namespaceDigest;
  assert.ok(check(otherInvocation).some(message => /invocation/i.test(message)));
  // An otherwise valid receipt must not authorize itself by carrying its own qualification.
  const selfAuthorized = namespaceEvidence(before);
  selfAuthorized.qualifications = [];
  assert.ok(check(selfAuthorized).some(message => /qualification/i.test(message)));
});
