/** Absolute, slash-separated paths in an adapter-defined captured namespace.
 * Node identities are globally scoped physical identities, including volume identity.
 */
export type ResolutionNamespaceEntryV2 = { name: string; kind: 'directory' | 'file' | 'symlink' };
export type ResolutionNamespaceNodeV2 =
  | { path: string; kind: 'directory'; identity: string; caseMode: 'sensitive' | 'insensitive-ascii'; entries: readonly ResolutionNamespaceEntryV2[] }
  | { path: string; kind: 'file'; identity: string; contentDigest: string }
  | { path: string; kind: 'symlink'; identity: string; target: string };
export type ResolutionNamespaceV2 = {
  schemaVersion: 'cityos.resolution-namespace.v2';
  roots: readonly string[];
  nodes: readonly ResolutionNamespaceNodeV2[];
  invocationDigest: string;
  nodeIdentity: string;
  compilerIdentity: string;
  nativeCompilerIdentity: string;
  excludedPaths: readonly string[];
};
export type ResolutionNamespaceQualificationV2 = {
  platform: string; mechanism: string; qualificationDigest: string; runtimeAllowlistDigest: string;
};
export type ResolutionNamespaceProofV2 = {
  schemaVersion: 'cityos.resolution-namespace-proof.v2';
  namespaceDigest: string; afterNamespaceDigest: string; invocationDigest: string;
  checkedMembershipDigest: string; success: boolean; uncapturedReads: number;
  qualification: ResolutionNamespaceQualificationV2;
};
export type ResolutionNamespaceLookupV2 =
  | { outcome: 'found'; path: string; kind: 'directory' | 'file' | 'symlink' }
  | { outcome: 'missing'; path: string; directory: string }
  | { outcome: 'outside' | 'not-directory' | 'unqualified-case' | 'symlink-loop'; path: string };
/** Checks structural consistency, not the truth or completeness of observations. */
export function validateResolutionNamespaceV2(manifest: ResolutionNamespaceV2): string[];
/** Returns canonical UTF-8 input for the adapter's SHA-256 implementation. */
export function canonicalResolutionNamespaceV2(manifest: ResolutionNamespaceV2): string;
/** Missing is established relative to a declared complete directory listing only. */
export function lookupResolutionNamespaceV2(manifest: ResolutionNamespaceV2, path: string): ResolutionNamespaceLookupV2;
/** Checks supplied assertions only; qualification and OS enforcement are external. */
export function validateResolutionNamespaceProofV2(manifest: ResolutionNamespaceV2, proof: ResolutionNamespaceProofV2, options: {
  sha256: (canonicalUtf8: string) => string;
  qualifications: readonly ResolutionNamespaceQualificationV2[];
  expectedMembershipDigest: string;
}): string[];
