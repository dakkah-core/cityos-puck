// Versioned, opt-in evidence policy. Observations and hashing belong to adapters.
import { planGeneratedTypePreparation, requiredFrameworkOutputs } from './generated-types-policy.mjs';
import { validateResolutionNamespaceProofV2 } from './resolution-namespace-v2.mjs';

const schemaVersion = 'cityos.generated-type-check-evidence.v2';
const digestFields = Object.freeze([
  'frameworkConfig', 'routeInputs', 'compilerConfig', 'configInputs',
  'compilerMembership', 'compilerInputs', 'resolutionInputs', 'lock',
  'nodeIdentity', 'compilerIdentity', 'generatorIdentity',
]);
const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const denseArray = value => Array.isArray(value) && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index)))
    .every(descriptor => descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
const sameList = (left, right) => denseArray(left) && denseArray(right) && left.length === right.length
  && Array.prototype.every.call(left, (value, index) => value === right[index]);

function exactKeys(value, keys, label, diagnostics) {
  if (!record(value)) { diagnostics.push(`${label} must be a record`); return false; }
  const valid = Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
  if (!valid) diagnostics.push(`${label} fields differ`);
  return valid;
}

function inspectSnapshot(snapshot, projects, outputs, label) {
  const diagnostics = [];
  if (!exactKeys(snapshot, ['projects', 'inputDigests', 'outputs'], label, diagnostics)) return diagnostics;
  if (!sameList(snapshot.projects, projects)) diagnostics.push(`${label} project scope differs`);
  if (exactKeys(snapshot.inputDigests, digestFields, `${label} input digests`, diagnostics)) {
    for (const field of digestFields) if (!Object.hasOwn(snapshot.inputDigests, field) || !isDigest(snapshot.inputDigests[field])) diagnostics.push(`${label} invalid digest ${field}`);
  }
  if (exactKeys(snapshot.outputs, outputs, `${label} outputs`, diagnostics)) {
    for (const output of outputs) if (!Object.hasOwn(snapshot.outputs, output) || !isDigest(snapshot.outputs[output])) diagnostics.push(`${label} invalid output digest ${output}`);
  }
  return diagnostics;
}

/** Create an immutable plan from a separately observed pre-check snapshot. */
export function planGeneratedTypeCheckEvidenceV2({ owner, projects, requiredOutputs, before }) {
  if (!owner || !['expo', 'next'].includes(owner.framework)) throw new Error('V2 requires an Expo or Next owner');
  const defaults = requiredFrameworkOutputs(owner);
  const ambient = owner.path === '.' ? 'expo-env.d.ts' : `${owner.path}/expo-env.d.ts`;
  const minimum = owner.framework === 'expo' && owner.typedRoutes ? [...defaults, ambient] : defaults;
  const selected = requiredOutputs === undefined ? minimum : requiredOutputs;
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length) throw new Error('V2 required outputs must be a unique array');
  if (owner.framework === 'expo' && !owner.typedRoutes && selected.length) throw new Error('Disabled Expo cannot require generated outputs');
  if (minimum.some(output => !selected.includes(output))) throw new Error('Required framework output omitted');
  for (const field of digestFields) if (!isDigest(before?.inputDigests?.[field])) throw new Error(`Invalid input digest ${field}`);
  // Reuse the canonical owner, scope, output and portable-path validation.
  const legacyPlan = planGeneratedTypePreparation({ owner, projects, requiredOutputs: selected,
    toolchain: { node: before?.inputDigests?.nodeIdentity, compiler: before?.inputDigests?.compilerIdentity, generator: before?.inputDigests?.generatorIdentity },
    inputDigests: { routes: before?.inputDigests?.routeInputs, config: before?.inputDigests?.compilerConfig, lock: before?.inputDigests?.lock } });
  const diagnostics = inspectSnapshot(before, legacyPlan.projects, legacyPlan.requiredOutputs, 'before');
  if (diagnostics.length) throw new Error(diagnostics.join('; '));
  const snapshot = Object.freeze({ projects: Object.freeze([...before.projects]),
    inputDigests: Object.freeze(Object.fromEntries(digestFields.map(field => [field, before.inputDigests[field]]))),
    outputs: Object.freeze(Object.fromEntries(legacyPlan.requiredOutputs.map(output => [output, before.outputs[output]]))) });
  return Object.freeze({ schemaVersion, owner: legacyPlan.owner, framework: legacyPlan.framework,
    projects: Object.freeze([...legacyPlan.projects]), requiredOutputs: Object.freeze([...legacyPlan.requiredOutputs]), before: snapshot });
}

/**
 * Validate supplied observations and an independently supplied namespace receipt.
 * The caller must authorize the qualification, calculate the invocation digest
 * from the actual selected project and diagnostic command, and supply SHA-256.
 * This pure check does not establish the truth of the receipt or qualify an OS.
 */
export function validateGeneratedTypeCheckEvidenceV2(plan, evidence, namespaceEvidence) {
  const diagnostics = [];
  if (!record(plan) || plan.schemaVersion !== schemaVersion || !Array.isArray(plan.projects) || !Array.isArray(plan.requiredOutputs) || !record(plan.before)) return ['Invalid V2 evidence plan'];
  if (!exactKeys(evidence, ['schemaVersion', 'success', 'checkedMembership', 'before', 'after'], 'evidence', diagnostics)) return diagnostics;
  if (evidence.schemaVersion !== schemaVersion) diagnostics.push('Evidence schema version differs');
  if (evidence.success !== true) diagnostics.push('Typecheck failed');
  const snapshotDiagnostics = [
    ...inspectSnapshot(plan.before, plan.projects, plan.requiredOutputs, 'plan'),
    ...inspectSnapshot(evidence.before, plan.projects, plan.requiredOutputs, 'before'),
    ...inspectSnapshot(evidence.after, plan.projects, plan.requiredOutputs, 'after'),
  ];
  diagnostics.push(...snapshotDiagnostics);
  // Do not read fields from a malformed record after rejecting its descriptors.
  if (snapshotDiagnostics.length) return diagnostics;
  if (!isDigest(evidence.checkedMembership) || evidence.checkedMembership !== plan.before?.inputDigests?.compilerMembership) diagnostics.push('Checked compiler membership differs');
  for (const field of digestFields) {
    const expected = plan.before?.inputDigests?.[field];
    if (evidence.before?.inputDigests?.[field] !== expected || evidence.after?.inputDigests?.[field] !== expected) diagnostics.push(`Input digest ${field} differs`);
  }
  for (const output of plan.requiredOutputs) {
    const expected = plan.before?.outputs?.[output];
    if (evidence.before?.outputs?.[output] !== expected || evidence.after?.outputs?.[output] !== expected) diagnostics.push(`Output digest ${output} differs`);
  }
  if (!exactKeys(namespaceEvidence, ['namespace', 'proof', 'sha256', 'qualifications', 'expectedInvocationDigest'], 'namespace evidence', diagnostics)) return diagnostics;
  const { namespace, proof, sha256, qualifications, expectedInvocationDigest } = namespaceEvidence;
  if (!isDigest(expectedInvocationDigest) || proof?.invocationDigest !== expectedInvocationDigest || namespace?.invocationDigest !== expectedInvocationDigest) diagnostics.push('Diagnostic invocation differs');
  if (proof?.namespaceDigest !== plan.before?.inputDigests?.resolutionInputs) diagnostics.push('Resolution namespace digest differs from resolutionInputs');
  if (namespace?.nodeIdentity !== plan.before?.inputDigests?.nodeIdentity) diagnostics.push('Resolution namespace Node identity differs');
  if (namespace?.compilerIdentity !== plan.before?.inputDigests?.compilerIdentity) diagnostics.push('Resolution namespace compiler identity differs');
  try {
    diagnostics.push(...validateResolutionNamespaceProofV2(namespace, proof, { sha256, qualifications, expectedMembershipDigest: evidence.checkedMembership })
      .map(message => `Resolution namespace: ${message}`));
  } catch {
    diagnostics.push('Invalid resolution namespace or proof');
  }
  return diagnostics;
}
