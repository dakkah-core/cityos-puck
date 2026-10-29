import type { FrameworkOwner } from './generated-types-policy.mjs';
import type { ResolutionNamespaceV2, ResolutionNamespaceProofV2, ResolutionNamespaceQualificationV2 } from './resolution-namespace-v2.mjs';

export type GeneratedTypeCheckDigestInputsV2 = {
  frameworkConfig: string; routeInputs: string; compilerConfig: string; configInputs: string;
  compilerMembership: string; compilerInputs: string; resolutionInputs: string; lock: string;
  nodeIdentity: string; compilerIdentity: string; generatorIdentity: string;
};
export type GeneratedTypeCheckSnapshotV2 = {
  projects: readonly string[]; inputDigests: Readonly<GeneratedTypeCheckDigestInputsV2>; outputs: Readonly<Record<string, string>>;
};
export type GeneratedTypeCheckPlanV2 = {
  readonly schemaVersion: 'cityos.generated-type-check-evidence.v2'; readonly owner: string;
  readonly framework: 'expo' | 'next'; readonly projects: readonly string[];
  readonly requiredOutputs: readonly string[]; readonly before: GeneratedTypeCheckSnapshotV2;
};
export type GeneratedTypeCheckEvidenceV2 = {
  schemaVersion: 'cityos.generated-type-check-evidence.v2'; success: boolean; checkedMembership: string;
  before: GeneratedTypeCheckSnapshotV2; after: GeneratedTypeCheckSnapshotV2;
};
/** Supplied independently of the reusable evidence by the validating caller.
 * The invocation digest must bind the actual selected projects, diagnostic
 * command, working directory, compiler options and relevant environment.
 * Qualification is an external assertion, not established by this API.
 */
export type GeneratedTypeCheckNamespaceEvidenceV2 = {
  namespace: ResolutionNamespaceV2; proof: ResolutionNamespaceProofV2;
  sha256: (canonicalUtf8: string) => string;
  qualifications: readonly ResolutionNamespaceQualificationV2[];
  expectedInvocationDigest: string;
};
export function planGeneratedTypeCheckEvidenceV2(input: {
  owner: FrameworkOwner & { framework: 'expo' | 'next' }; projects: string[]; requiredOutputs?: string[]; before: GeneratedTypeCheckSnapshotV2;
}): GeneratedTypeCheckPlanV2;
export function validateGeneratedTypeCheckEvidenceV2(plan: GeneratedTypeCheckPlanV2, evidence: GeneratedTypeCheckEvidenceV2, namespaceEvidence: GeneratedTypeCheckNamespaceEvidenceV2): string[];
