import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { checkNextDiagnosticMembership, digestNextConfigInputs, fingerprintNextSource } from './next-generated-types.mjs';

test('Next config input digest distinguishes different byte boundaries', () => {
  assert.notEqual(digestNextConfigInputs([Buffer.from('ab'), Buffer.from('c')]), digestNextConfigInputs([Buffer.from('a'), Buffer.from('bc')]));
});

test('diagnostics must check the same compiler membership and unchanged bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-membership-'));
  const a = join(root, 'a.ts'), b = join(root, 'b.ts');
  const listing = files => ({ status: 0, stdout: files.join('\n') + '\n', stderr: '' });
  try {
    writeFileSync(a, 'a'); writeFileSync(b, 'b');
    const check = (diagnostic, after = [a]) => {
      let calls = 0;
      return checkNextDiagnosticMembership({ list: () => listing(++calls === 1 ? [a] : after), check: diagnostic, validate() {} });
    };
    assert.doesNotThrow(() => check(() => listing([a])));
    assert.throws(() => check(() => listing([a, b])), /diagnostic compiler membership differs/i);
    assert.throws(() => check(() => listing([a]), [a, b]), /membership changed/i);
    assert.throws(() => check(() => { writeFileSync(a, 'changed'); return listing([a]); }), /inputs changed/i);
    assert.throws(() => check(() => ({ status: 0, stdout: 'unexpected\n', stderr: '' })), /membership/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('diagnostics reject changed, added, and removed resolution metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-resolution-metadata-'));
  try {
    const member = join(root, 'node_modules', 'fixture', 'index.d.ts');
    const manifest = join(dirname(member), 'package.json');
    mkdirSync(dirname(member), { recursive: true });
    writeFileSync(member, 'export {};');
    const listing = () => ({ status: 0, stdout: `${member}\n`, stderr: '' });
    const run = check => checkNextDiagnosticMembership({ list: listing, check, validate() {} });
    writeFileSync(manifest, '{"name":"before"}');
    assert.throws(() => run(() => { writeFileSync(manifest, '{"name":"after"}'); return listing(); }), /resolution metadata changed/i);
    assert.throws(() => run(() => { unlinkSync(manifest); return listing(); }), /resolution metadata changed/i);
    assert.throws(() => run(() => { writeFileSync(manifest, '{"name":"new"}'); return listing(); }), /resolution metadata changed/i);
    const checked = run(listing);
    writeFileSync(manifest, '{"name":"later"}');
    assert.throws(() => checked.verifyResolutionCurrentness(), /resolution metadata changed/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('diagnostics reject retargeted compiler inputs even when bytes match', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-retarget-'));
  try {
    const first = join(root, 'first'), second = join(root, 'second'), link = join(root, 'dependency');
    for (const directory of [first, second]) {
      mkdirSync(directory); writeFileSync(join(directory, 'index.d.ts'), 'export {};');
      writeFileSync(join(directory, 'package.json'), '{"name":"fixture"}');
    }
    symlinkSync(first, link, process.platform === 'win32' ? 'junction' : 'dir');
    const member = join(link, 'index.d.ts');
    const listing = () => ({ status: 0, stdout: `${member}\n`, stderr: '' });
    assert.throws(() => checkNextDiagnosticMembership({ list: listing, validate() {}, check() {
      rmSync(link); symlinkSync(second, link, process.platform === 'win32' ? 'junction' : 'dir'); return listing();
    } }), /resolution metadata changed or compiler input retargeted/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('diagnostics retain the verified observer if later code replaces the module cache entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-observer-cache-'));
  const require = createRequire(import.meta.url);
  const modulePath = require.resolve('./generated-types-policy/compiler-input-evidence.cjs');
  const previous = require.cache[modulePath];
  try {
    const member = join(root, 'index.d.ts'), manifest = join(root, 'package.json');
    writeFileSync(member, 'export {};'); writeFileSync(manifest, '{"name":"before"}');
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true,
      exports: { collectCompilerResolutionMetadata: () => [], captureCompilerInputs: () => ({ sha256: 'unchanged' }) } };
    const listing = () => ({ status: 0, stdout: `${member}\n`, stderr: '' });
    assert.throws(() => checkNextDiagnosticMembership({ list: listing, validate() {}, check() {
      writeFileSync(manifest, '{"name":"after"}'); return listing();
    } }), /resolution metadata changed/i);
  } finally {
    if (previous === undefined) delete require.cache[modulePath]; else require.cache[modulePath] = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test('fingerprints authored output-named paths and excludes only owned Next output', () => {
  const app = mkdtempSync(join(tmpdir(), 'puck-next-source-'));
  const owner = { path: '.', framework: 'next', distDir: '.next' };
  const write = (path, content) => {
    const file = join(app, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  try {
    const authored = ['src/out/value.ts', 'src/dist/value.ts', 'out/value.ts', 'dist/value.ts', 'src/.build/value.ts', 'src/.turbo/value.ts', 'src/coverage/value.ts'];
    for (const path of authored) write(path, 'initial');
    write('.next/types/validator.ts', 'generated');
    write('next-env.d.ts', 'generated');
    write('node_modules/example/index.js', 'dependency');
    write('.git/config', 'metadata');
    let previous = fingerprintNextSource(app, owner);
    for (const path of authored) {
      write(path, 'changed');
      const current = fingerprintNextSource(app, owner);
      assert.notEqual(current, previous, `${path} must affect the source fingerprint`);
      previous = current;
    }
    for (const path of ['.next/types/validator.ts', 'next-env.d.ts', 'node_modules/example/index.js', '.git/config']) {
      write(path, 'changed');
      assert.equal(fingerprintNextSource(app, owner), previous, `${path} is not authored source`);
    }
    write('custom-next/types/validator.ts', 'generated');
    const customOwner = { ...owner, distDir: 'custom-next' };
    const customFingerprint = fingerprintNextSource(app, customOwner);
    write('custom-next/types/validator.ts', 'changed');
    assert.equal(fingerprintNextSource(app, customOwner), customFingerprint, 'effective Next distDir is excluded');
    write('.next/types/validator.ts', 'authored under this owner');
    assert.notEqual(fingerprintNextSource(app, customOwner), customFingerprint, 'an unowned .next tree is included');
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
});

test('distinguishes file bytes containing separators from additional files', () => {
  const app = mkdtempSync(join(tmpdir(), 'puck-next-source-framing-'));
  const owner = { path: '.', framework: 'next', distDir: '.next' };
  try {
    // With NUL-delimited records these two different trees both serialize as
    // a\0x\0b\0y\0, even though filenames cannot contain NUL bytes.
    writeFileSync(join(app, 'a'), Buffer.from('x\0b\0y'));
    const oneFile = fingerprintNextSource(app, owner);
    writeFileSync(join(app, 'a'), 'x');
    writeFileSync(join(app, 'b'), 'y');
    assert.notEqual(fingerprintNextSource(app, owner), oneFile);
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
});
