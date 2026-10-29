// Pure contract only: callers observe the filesystem, compute SHA-256, and
// establish whether an OS mechanism actually confines the compiler's reads.
const VERSION = 'cityos.resolution-namespace.v2';
const PROOF_VERSION = 'cityos.resolution-namespace-proof.v2';
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const denseArray = value => Array.isArray(value) && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i)))
    .every(descriptor => descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
const sortedUnique = values => denseArray(values) && values.every((value, i) => i === 0 || values[i - 1] < value);
const pathValid = value => typeof value === 'string' && value.startsWith('/') && value !== '/'
  && !value.includes('\\') && !/[\u0000-\u001f\u007f]/u.test(value)
  && value.slice(1).split('/').every(part => part && part !== '.' && part !== '..');
const inside = (path, root) => path === root || path.startsWith(`${root}/`);
const parent = path => path.slice(0, path.lastIndexOf('/'));
const base = path => path.slice(path.lastIndexOf('/') + 1);
const fold = (name, mode) => mode === 'insensitive-ascii' ? name.replace(/[A-Z]/gu, c => c.toLowerCase()) : name;

function exact(value, keys) {
  return record(value) && Reflect.ownKeys(value).length === keys.length
    && keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    });
}
function identity(value) { return typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value); }
function nameValid(value) { return typeof value === 'string' && pathValid(`/x/${value}`) && !value.includes('/'); }

/** Validate only the supplied representation; it is not a filesystem attestation. */
export function validateResolutionNamespaceV2(manifest) {
  const errors = [];
  if (!exact(manifest, ['schemaVersion', 'roots', 'nodes', 'invocationDigest', 'nodeIdentity', 'compilerIdentity', 'nativeCompilerIdentity', 'excludedPaths'])) return ['Invalid namespace fields'];
  if (manifest.schemaVersion !== VERSION) errors.push('Invalid namespace version');
  for (const key of ['invocationDigest', 'nodeIdentity', 'compilerIdentity', 'nativeCompilerIdentity']) if (!digest(manifest[key])) errors.push(`Invalid ${key}`);
  if (!denseArray(manifest.roots) || !manifest.roots.length || !manifest.roots.every(pathValid) || !sortedUnique(manifest.roots)) errors.push('Invalid or unordered roots');
  if (!denseArray(manifest.excludedPaths) || !manifest.excludedPaths.every(pathValid) || !sortedUnique(manifest.excludedPaths)) errors.push('Invalid or unordered excluded paths');
  if (!denseArray(manifest.nodes)) return [...errors, 'Invalid nodes'];
  if (errors.length) return errors;
  for (const root of manifest.roots) {
    if (manifest.roots.some(other => other !== root && inside(root, other))) errors.push(`Overlapping root ${root}`);
    if (manifest.excludedPaths.some(excluded => inside(excluded, root) || inside(root, excluded))) errors.push(`Excluded path overlaps root ${root}`);
  }
  const nodes = new Map();
  const identities = new Map();
  let previous = '';
  for (const node of manifest.nodes) {
    const keys = node?.kind === 'directory' ? ['path', 'kind', 'identity', 'caseMode', 'entries']
      : node?.kind === 'file' ? ['path', 'kind', 'identity', 'contentDigest']
        : node?.kind === 'symlink' ? ['path', 'kind', 'identity', 'target'] : [];
    if (!keys.length || !exact(node, keys) || !pathValid(node.path) || !identity(node.identity)) { errors.push('Invalid node'); continue; }
    if (previous && previous >= node.path) errors.push(`Duplicate or unordered node ${node.path}`);
    previous = node.path;
    if (nodes.has(node.path)) errors.push(`Duplicate node ${node.path}`);
    nodes.set(node.path, node);
    const sameIdentity = identities.get(node.identity);
    if (sameIdentity && (node.kind !== sameIdentity.kind || node.kind === 'directory'
      || (node.kind === 'file' && node.contentDigest !== sameIdentity.contentDigest)
      || (node.kind === 'symlink' && node.target !== sameIdentity.target))) errors.push(`Ambiguous physical identity ${node.path}`);
    else if (!sameIdentity) identities.set(node.identity, node);
    if (!manifest.roots.some(root => inside(node.path, root))) errors.push(`Node outside roots ${node.path}`);
    if (node.kind === 'file' && !digest(node.contentDigest)) errors.push(`Invalid file digest ${node.path}`);
    if (node.kind === 'symlink' && (!pathValid(node.target) || !manifest.roots.some(root => inside(node.target, root)))) errors.push(`Uncaptured symlink target ${node.path}`);
    if (node.kind === 'directory') {
      if (!['sensitive', 'insensitive-ascii'].includes(node.caseMode)) errors.push(`Unsupported case mode ${node.path}`);
      if (!denseArray(node.entries)) { errors.push(`Invalid directory entries ${node.path}`); continue; }
      const names = [];
      const folded = new Set();
      for (const entry of node.entries) {
        if (!exact(entry, ['name', 'kind']) || !nameValid(entry.name) || !['directory', 'file', 'symlink'].includes(entry.kind)) { errors.push(`Invalid entry ${node.path}`); continue; }
        names.push(entry.name);
        if (node.caseMode === 'insensitive-ascii' && /[^\x20-\x7e]/u.test(entry.name)) errors.push(`Unqualified case folding ${node.path}`);
        const key = fold(entry.name, node.caseMode);
        if (folded.has(key)) errors.push(`Ambiguous entry ${node.path}/${entry.name}`);
        folded.add(key);
      }
      if (!sortedUnique(names)) errors.push(`Duplicate or unordered entries ${node.path}`);
    }
  }
  if (errors.length) return errors;
  for (const root of manifest.roots) if (nodes.get(root)?.kind !== 'directory') errors.push(`Root is not a captured directory ${root}`);
  for (const node of nodes.values()) {
    if (!manifest.roots.includes(node.path)) {
      const dir = nodes.get(parent(node.path));
      if (dir?.kind !== 'directory' || !dir.entries?.some(entry => entry.name === base(node.path) && entry.kind === node.kind)) errors.push(`Unlisted node ${node.path}`);
    }
    if (node.kind === 'directory' && Array.isArray(node.entries)) for (const entry of node.entries) {
      if (nameValid(entry?.name) && nodes.get(`${node.path}/${entry.name}`)?.kind !== entry.kind) errors.push(`Uncaptured entry ${node.path}/${entry.name}`);
    }
  }
  return errors;
}

/** Stable bytes for caller-supplied UTF-8 SHA-256. Order is part of the contract. */
export function canonicalResolutionNamespaceV2(manifest) {
  const errors = validateResolutionNamespaceV2(manifest);
  if (errors.length) throw new Error(errors.join('; '));
  const nodes = manifest.nodes.map(node => node.kind === 'directory'
    ? { path: node.path, kind: node.kind, identity: node.identity, caseMode: node.caseMode, entries: node.entries.map(entry => ({ name: entry.name, kind: entry.kind })) }
    : node.kind === 'file' ? { path: node.path, kind: node.kind, identity: node.identity, contentDigest: node.contentDigest }
      : { path: node.path, kind: node.kind, identity: node.identity, target: node.target });
  return JSON.stringify({ schemaVersion: VERSION, roots: [...manifest.roots], nodes,
    invocationDigest: manifest.invocationDigest, nodeIdentity: manifest.nodeIdentity, compilerIdentity: manifest.compilerIdentity,
    nativeCompilerIdentity: manifest.nativeCompilerIdentity, excludedPaths: [...manifest.excludedPaths] });
}

/** Resolve only within the captured namespace. Missing is backed by a complete listing. */
export function lookupResolutionNamespaceV2(manifest, path) {
  const errors = validateResolutionNamespaceV2(manifest);
  if (errors.length) throw new Error(errors.join('; '));
  if (!pathValid(path)) throw new Error('Invalid lookup path');
  const nodes = new Map(manifest.nodes.map(node => [node.path, node]));
  let remaining = path;
  const visited = new Set();
  for (;;) {
    const root = manifest.roots.find(candidate => inside(remaining, candidate));
    if (!root) return { outcome: 'outside', path: remaining };
    let current = root;
    const parts = remaining === root ? [] : remaining.slice(root.length + 1).split('/');
    let followed = false;
    for (let i = 0; i < parts.length; i++) {
      const dir = nodes.get(current);
      if (dir.kind !== 'directory') return { outcome: 'not-directory', path: current };
      if (dir.caseMode === 'insensitive-ascii' && /[^\x20-\x7e]/u.test(parts[i])) return { outcome: 'unqualified-case', path: current };
      const entry = dir.entries.find(item => fold(item.name, dir.caseMode) === fold(parts[i], dir.caseMode));
      if (!entry) return { outcome: 'missing', path: `${current}/${parts[i]}`, directory: current };
      current += `/${entry.name}`;
      const node = nodes.get(current);
      if (node.kind === 'symlink') {
        if (visited.has(current)) return { outcome: 'symlink-loop', path: current };
        visited.add(current);
        remaining = node.target + (i + 1 < parts.length ? `/${parts.slice(i + 1).join('/')}` : '');
        followed = true;
        break;
      }
    }
    if (!followed) return { outcome: 'found', path: current, kind: nodes.get(current).kind };
  }
}

/**
 * Validate a receipt against caller-authorized qualification data. This only
 * checks assertions and digests; it cannot qualify the OS or observe the run.
 */
export function validateResolutionNamespaceProofV2(manifest, proof, { sha256, qualifications, expectedMembershipDigest } = {}) {
  const errors = validateResolutionNamespaceV2(manifest);
  if (errors.length) return errors;
  if (!exact(proof, ['schemaVersion', 'namespaceDigest', 'afterNamespaceDigest', 'invocationDigest', 'checkedMembershipDigest', 'success', 'qualification', 'uncapturedReads'])) return ['Invalid proof fields'];
  if (proof.schemaVersion !== PROOF_VERSION) errors.push('Invalid proof version');
  for (const key of ['namespaceDigest', 'afterNamespaceDigest', 'invocationDigest', 'checkedMembershipDigest']) if (!digest(proof[key])) errors.push(`Invalid proof ${key}`);
  if (proof.success !== true || proof.uncapturedReads !== 0) errors.push('Diagnostic failed or uncaptured reads reported');
  if (proof.invocationDigest !== manifest.invocationDigest) errors.push('Invocation differs');
  if (!digest(expectedMembershipDigest) || proof.checkedMembershipDigest !== expectedMembershipDigest) errors.push('Checked membership differs');
  if (typeof sha256 !== 'function') errors.push('Missing SHA-256 implementation');
  else {
    try {
      const actual = sha256(canonicalResolutionNamespaceV2(manifest));
      if (!digest(actual) || proof.namespaceDigest !== actual || proof.afterNamespaceDigest !== actual) errors.push('Namespace digest differs');
    } catch { errors.push('Namespace hashing failed'); }
  }
  const fields = ['platform', 'mechanism', 'qualificationDigest', 'runtimeAllowlistDigest'];
  const validQualification = item => exact(item, fields) && identity(item.platform) && identity(item.mechanism)
    && digest(item.qualificationDigest) && digest(item.runtimeAllowlistDigest);
  if (!validQualification(proof.qualification) || !denseArray(qualifications)
    || !Array.prototype.some.call(qualifications, item => validQualification(item) && fields.every(field => item[field] === proof.qualification[field]))) errors.push('No matching authorized platform qualification');
  return errors;
}
