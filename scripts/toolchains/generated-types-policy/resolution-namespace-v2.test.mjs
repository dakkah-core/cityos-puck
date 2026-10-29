import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalResolutionNamespaceV2, lookupResolutionNamespaceV2, validateResolutionNamespaceProofV2, validateResolutionNamespaceV2 } from './resolution-namespace-v2.mjs';

const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const fixture = () => ({
  schemaVersion: 'cityos.resolution-namespace.v2', roots: ['/workspace'], excludedPaths: ['/private'],
  invocationDigest: hash('invocation'), nodeIdentity: hash('node'), compilerIdentity: hash('launcher'), nativeCompilerIdentity: hash('native'),
  nodes: [
    { path: '/workspace', kind: 'directory', identity: 'root', caseMode: 'sensitive', entries: [{ name: 'link', kind: 'symlink' }, { name: 'src', kind: 'directory' }] },
    { path: '/workspace/link', kind: 'symlink', identity: 'link', target: '/workspace/src' },
    { path: '/workspace/src', kind: 'directory', identity: 'src', caseMode: 'sensitive', entries: [{ name: 'index.ts', kind: 'file' }] },
    { path: '/workspace/src/index.ts', kind: 'file', identity: 'index', contentDigest: hash('source') },
  ],
});
const qualification = () => ({ platform: 'fixture-only', mechanism: 'declared-observer', qualificationDigest: hash('qualification'), runtimeAllowlistDigest: hash('runtime') });
function receipt(manifest) {
  const namespaceDigest = hash(canonicalResolutionNamespaceV2(manifest));
  return { schemaVersion: 'cityos.resolution-namespace-proof.v2', namespaceDigest, afterNamespaceDigest: namespaceDigest,
    invocationDigest: manifest.invocationDigest, checkedMembershipDigest: hash('membership'), success: true,
    qualification: qualification(), uncapturedReads: 0 };
}
const options = () => ({ sha256: hash, qualifications: [qualification()], expectedMembershipDigest: hash('membership') });

test('canonical identity binds file bytes, directory membership, invocation and native compiler', () => {
  const manifest = fixture();
  assert.deepEqual(validateResolutionNamespaceV2(manifest), []);
  const canonical = canonicalResolutionNamespaceV2(manifest);
  assert.equal(canonicalResolutionNamespaceV2(structuredClone(manifest)), canonical);
  for (const mutate of [
    value => { value.nodes[3].contentDigest = hash('changed'); },
    value => { value.nodes[0].identity = 'different-root'; },
    value => { value.invocationDigest = hash('different-invocation'); },
    value => { value.nativeCompilerIdentity = hash('different-native'); },
    value => { value.nodes[1].target = '/workspace/src/index.ts'; },
    value => { value.nodes[2].entries.push({ name: 'new.ts', kind: 'file' }); value.nodes.push({ path: '/workspace/src/new.ts', kind: 'file', identity: 'new', contentDigest: hash('new') }); },
  ]) {
    const changed = fixture(); mutate(changed);
    assert.notEqual(hash(canonicalResolutionNamespaceV2(changed)), hash(canonical));
  }
});

test('complete directory listings reject omissions, additions, duplicates and ambiguous names', () => {
  for (const mutate of [
    value => { value.nodes[2].entries = []; },
    value => { value.nodes.pop(); },
    value => { value.nodes[2].entries.push({ name: 'missing.ts', kind: 'file' }); },
    value => { value.nodes.push(structuredClone(value.nodes[3])); },
    value => { value.nodes[2].entries.reverse(); value.nodes[2].entries.push({ name: 'index.ts', kind: 'file' }); },
    value => { value.nodes[2].caseMode = 'insensitive-ascii'; value.nodes[2].entries.push({ name: 'INDEX.ts', kind: 'file' }); },
    value => { value.nodes[2].caseMode = 'insensitive-ascii'; value.nodes[2].entries[0].name = 'é.ts'; },
    value => { value.excludedPaths = ['/workspace/src']; },
    value => { value.roots = ['/workspace', '/workspace/src']; },
    value => { value.nodes[2].entries = new Array(1); },
    value => { value.nodes[2].entries.extra = true; },
    value => { value.nodes[3].identity = 'src'; },
  ]) {
    const changed = fixture(); mutate(changed);
    assert.notEqual(validateResolutionNamespaceV2(changed).length, 0);
    assert.throws(() => canonicalResolutionNamespaceV2(changed));
  }
});

test('lookup handles absent candidates, links, loops, outside paths and case rules', () => {
  const manifest = fixture();
  assert.deepEqual(lookupResolutionNamespaceV2(manifest, '/workspace/link/index.ts'), { outcome: 'found', path: '/workspace/src/index.ts', kind: 'file' });
  assert.deepEqual(lookupResolutionNamespaceV2(manifest, '/workspace/link/absent.ts'), { outcome: 'missing', path: '/workspace/src/absent.ts', directory: '/workspace/src' });
  assert.deepEqual(lookupResolutionNamespaceV2(manifest, '/workspace/src/index.ts/child'), { outcome: 'not-directory', path: '/workspace/src/index.ts' });
  assert.deepEqual(lookupResolutionNamespaceV2(manifest, '/outside/file'), { outcome: 'outside', path: '/outside/file' });
  const loop = fixture(); loop.nodes[1].target = '/workspace/link';
  assert.equal(lookupResolutionNamespaceV2(loop, '/workspace/link/a').outcome, 'symlink-loop');
  const dangling = fixture(); dangling.nodes[1].target = '/workspace/src/not-there';
  assert.equal(lookupResolutionNamespaceV2(dangling, '/workspace/link').outcome, 'missing');
  const escape = fixture(); escape.nodes[1].target = '/outside';
  assert.notEqual(validateResolutionNamespaceV2(escape).length, 0);
  const insensitive = fixture(); insensitive.nodes[2].caseMode = 'insensitive-ascii';
  assert.equal(lookupResolutionNamespaceV2(insensitive, '/workspace/src/INDEX.TS').outcome, 'found');
  assert.equal(lookupResolutionNamespaceV2(insensitive, '/workspace/src/é.ts').outcome, 'unqualified-case');
  assert.throws(() => lookupResolutionNamespaceV2(manifest, '/workspace/../outside'));
});

test('proof validates binding and authorized qualifications but cannot establish their truth', () => {
  const manifest = fixture();
  const good = receipt(manifest);
  assert.deepEqual(validateResolutionNamespaceProofV2(manifest, good, options()), []);
  for (const mutate of [
    value => { value.namespaceDigest = hash('other'); },
    value => { value.afterNamespaceDigest = hash('other'); },
    value => { value.invocationDigest = hash('other'); },
    value => { value.checkedMembershipDigest = hash('other'); },
    value => { value.success = false; },
    value => { value.uncapturedReads = 1; },
    value => { value.qualification.runtimeAllowlistDigest = hash('other'); },
    value => { delete value.qualification; },
    value => { value.extra = true; },
  ]) {
    const changed = structuredClone(good); mutate(changed);
    assert.notEqual(validateResolutionNamespaceProofV2(manifest, changed, options()).length, 0);
  }
  assert.notEqual(validateResolutionNamespaceProofV2(manifest, good, { ...options(), qualifications: [] }).length, 0);
  const forged = [];
  forged.some = () => true;
  assert.ok(validateResolutionNamespaceProofV2(manifest, good, { ...options(), qualifications: forged }).some(message => /qualification/i.test(message)));
  assert.ok(validateResolutionNamespaceProofV2(manifest, good, { ...options(), qualifications: new Array(1) }).some(message => /qualification/i.test(message)));
  assert.notEqual(validateResolutionNamespaceProofV2(manifest, good, { ...options(), sha256: () => 'bad' }).length, 0);
  assert.notEqual(validateResolutionNamespaceProofV2(manifest, good, { ...options(), expectedMembershipDigest: hash('other') }).length, 0);
  const changed = fixture(); changed.nodes[3].contentDigest = hash('different');
  assert.notEqual(validateResolutionNamespaceProofV2(changed, good, options()).length, 0);
});
