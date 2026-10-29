import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { GENERATED_TYPES_POLICY_FILES, verifyGeneratedTypesPolicy } from './verify-generated-types-policy.mjs';
import { copyNextToolchain } from '../../packages/create-puck-app/scripts/copy-next-toolchain.mjs';
import { copyRecipes } from '../../packages/create-puck-app/scripts/copy-recipes.mjs';

const projection = join(dirname(fileURLToPath(import.meta.url)), 'generated-types-policy');
const repository = join(dirname(fileURLToPath(import.meta.url)), '../..');
const expected = [
  'generated-types-policy.mjs', 'generated-types-policy.d.mts', 'generated-types-policy.test.mjs',
  'generated-type-check-evidence.mjs', 'generated-type-check-evidence.d.mts', 'generated-type-check-evidence.test.mjs',
  'resolution-namespace-v2.mjs', 'resolution-namespace-v2.d.mts', 'resolution-namespace-v2.test.mjs',
];

test('a Windows-style checkout preserves byte-hashed projection inputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-projection-checkout-'));
  const checkout = mkdtempSync(join(tmpdir(), 'puck-projection-target-'));
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.autocrlf=true', ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('init', '--quiet');
    cpSync(join(repository, '.gitattributes'), join(root, '.gitattributes'));
    const relative = 'scripts/toolchains/generated-types-policy';
    cpSync(projection, join(root, relative), { recursive: true });
    git('add', '--', '.gitattributes', ...[...expected, 'projection.json'].map(name => `${relative}/${name}`));
    git('checkout-index', '--all', `--prefix=${checkout.replaceAll('\\', '/')}/`);
    verifyGeneratedTypesPolicy(join(checkout, relative));
    for (const file of [...expected, 'projection.json']) assert.deepEqual(readFileSync(join(checkout, relative, file)), readFileSync(join(projection, file)), file);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(checkout, { recursive: true, force: true }); }
});

test('both standalone Next recipes preserve projection bytes on a Windows-style checkout', () => {
  for (const recipe of ['next', 'next-ai']) {
    const root = mkdtempSync(join(tmpdir(), 'puck-standalone-projection-'));
    const checkout = mkdtempSync(join(tmpdir(), 'puck-standalone-checkout-'));
    const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.autocrlf=true', ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      git('init', '--quiet');
      cpSync(join(repository, 'recipes', recipe, '.gitattributes'), join(root, '.gitattributes'));
      const relative = '.cityos/next-typecheck/generated-types-policy';
      cpSync(projection, join(root, relative), { recursive: true });
      git('add', '--', '.gitattributes', ...[...expected, 'projection.json'].map(name => `${relative}/${name}`));
      git('checkout-index', '--all', `--prefix=${checkout.replaceAll('\\', '/')}/`);
      verifyGeneratedTypesPolicy(join(checkout, relative));
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(checkout, { recursive: true, force: true }); }
  }
});

test('verifies the projection independently and rejects a modified output', () => {
  verifyGeneratedTypesPolicy();
  const root = mkdtempSync(join(tmpdir(), 'puck-projection-test-'));
  try {
    cpSync(join(dirname(fileURLToPath(import.meta.url)), 'generated-types-policy'), root, { recursive: true });
    writeFileSync(join(root, 'generated-types-policy.mjs'), 'modified');
    assert.throws(() => verifyGeneratedTypesPolicy(root), /stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('v2 verifies every projected file and rejects an incomplete or modified manifest', () => {
  assert.deepEqual(GENERATED_TYPES_POLICY_FILES, expected);
  const root = mkdtempSync(join(tmpdir(), 'puck-v2-projection-'));
  try {
    cpSync(projection, root, { recursive: true });
    verifyGeneratedTypesPolicy(root);
    const manifestPath = join(root, 'projection.json');
    const bytes = readFileSync(manifestPath);
    const manifest = JSON.parse(bytes);
    assert.equal(manifest.schemaVersion, 'cityos.generated-types-policy-projection.v2');
    assert.deepEqual(manifest.files.map(entry => entry.path), expected);
    for (const name of expected) {
      const file = join(root, name), original = readFileSync(file);
      writeFileSync(file, 'modified');
      assert.throws(() => verifyGeneratedTypesPolicy(root), /stale/);
      writeFileSync(file, original);
    }
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, files: manifest.files.slice(0, -1) }));
    assert.throws(() => verifyGeneratedTypesPolicy(root), /manifest/);
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, files: [...manifest.files.slice(0, -1), manifest.files[0]] }));
    assert.throws(() => verifyGeneratedTypesPolicy(root), /stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('both Next templates carry the complete usable v2 projection and pass the recipe allowlist', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-v2-template-'));
  try {
    const templates = join(root, 'templates'), recipes = join(root, 'recipes');
    mkdirSync(recipes);
    for (const name of ['next', 'next-ai']) {
      mkdirSync(join(recipes, name));
      writeFileSync(join(recipes, name, 'package.json'), JSON.stringify({ dependencies: { next: 'fixture' } }));
    }
    copyNextToolchain({ repositoryRoot: repository, templatePath: templates });
    copyRecipes({ recipePath: recipes, templatePath: templates });
    for (const name of ['next', 'next-ai']) {
      const target = join(templates, name, '.cityos/next-typecheck/generated-types-policy');
      verifyGeneratedTypesPolicy(target);
      for (const file of [...expected, 'projection.json']) assert.deepEqual(readFileSync(join(target, file)), readFileSync(join(projection, file)));
      const module = await import(pathToFileURL(join(target, 'generated-type-check-evidence.mjs')).href);
      assert.equal(typeof module.planGeneratedTypeCheckEvidenceV2, 'function');
      assert.equal(typeof module.validateGeneratedTypeCheckEvidenceV2, 'function');
      const namespace = await import(pathToFileURL(join(target, 'resolution-namespace-v2.mjs')).href);
      assert.equal(typeof namespace.validateResolutionNamespaceV2, 'function');
      assert.equal(typeof namespace.canonicalResolutionNamespaceV2, 'function');
      assert.equal(typeof namespace.lookupResolutionNamespaceV2, 'function');
      assert.equal(typeof namespace.validateResolutionNamespaceProofV2, 'function');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
