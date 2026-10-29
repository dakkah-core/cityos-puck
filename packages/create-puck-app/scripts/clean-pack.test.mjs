import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
// These reviewed projection files will be tracked with the generated policy.
// Include their exact working-tree paths while the migration is unstaged; do not
// sweep unrelated untracked files into the clean-checkout fixture.
const pendingProjectionFiles = [
  'scripts/toolchains/generated-types-policy/generated-type-check-evidence.mjs',
  'scripts/toolchains/generated-types-policy/generated-type-check-evidence.d.mts',
  'scripts/toolchains/generated-types-policy/generated-type-check-evidence.test.mjs',
  'scripts/toolchains/generated-types-policy/resolution-namespace-v2.mjs',
  'scripts/toolchains/generated-types-policy/resolution-namespace-v2.d.mts',
  'scripts/toolchains/generated-types-policy/resolution-namespace-v2.test.mjs',
];
const pendingRecipeAttributes = ['recipes/next/.gitattributes', 'recipes/next-ai/.gitattributes'];
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  return result.stdout;
};

function checkoutIndexedFiles(source, workspace, files) {
  mkdirSync(workspace, { recursive: true });
  const prefix = workspace.replaceAll('\\', '/') + '/';
  const result = spawnSync('git', ['checkout-index', '--prefix=' + prefix, '-z', '--stdin'], {
    cwd: source, input: files.join('\0') + '\0', encoding: 'utf8', windowsHide: true, timeout: 120000,
  });
  assert.equal(result.status, 0, `git checkout-index failed\n${result.stderr}\n${result.error ?? ''}`);
}

test('index checkout uses staged bytes instead of later working-tree edits', () => {
  const source = mkdtempSync(join(tmpdir(), 'puck-pack-index-source-'));
  const workspace = mkdtempSync(join(tmpdir(), 'puck-pack-index-target-'));
  try {
    run('git', ['init', '--quiet'], source);
    writeFileSync(join(source, 'value.txt'), 'staged bytes\n');
    run('git', ['add', '--', 'value.txt'], source);
    writeFileSync(join(source, 'value.txt'), 'unstaged bytes\n');
    checkoutIndexedFiles(source, workspace, ['value.txt']);
    assert.equal(readFileSync(join(workspace, 'value.txt'), 'utf8').replaceAll('\r\n', '\n'), 'staged bytes\n');
  } finally { rmSync(source, { recursive: true, force: true }); rmSync(workspace, { recursive: true, force: true }); }
});

function createCheckout(workspace, omittedPrefix = null, includePending = true) {
  const paths = ['.gitattributes', 'package.json', 'pnpm-workspace.yaml', 'config/toolchains', 'config/dependencies/plugin-ai.json', 'patches', 'scripts/toolchains', 'packages/core/package.json', 'packages/create-puck-app', 'recipes'];
  const files = new Set(run('git', ['ls-files', '-z', '--', ...paths], repository).split('\0').filter(Boolean));
  for (const file of includePending ? [...pendingProjectionFiles, ...pendingRecipeAttributes] : []) {
    assert.ok(existsSync(join(repository, file)), `missing required projected checkout input: ${file}; regenerate the policy projection first`);
    files.add(file);
  }
  const selected = [...files].filter(file => !omittedPrefix || (file !== omittedPrefix && !file.startsWith(`${omittedPrefix}/`)));
  if (!includePending) checkoutIndexedFiles(repository, workspace, selected);
  else for (const file of selected) {
    const target = join(workspace, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(repository, file), target);
  }
  for (const relative of ['node_modules', 'packages/create-puck-app/node_modules']) {
    symlinkSync(join(repository, relative), join(workspace, relative), process.platform === 'win32' ? 'junction' : 'dir');
  }
}

function verifyCompletePack(includePending) {
  const temp = mkdtempSync(join(tmpdir(), 'puck-clean-pack-'));
  try {
    const workspace = join(temp, 'workspace');
    createCheckout(workspace, null, includePending);
    const packageRoot = join(workspace, 'packages/create-puck-app');
    assert.equal(existsSync(join(packageRoot, 'templates/next/app/page.tsx')), false);
    const archives = join(temp, 'archives');
    mkdirSync(archives);
    run(process.execPath, [join(workspace, 'scripts/toolchains/run-pinned-pnpm.mjs'), 'pack', '--pack-destination', archives], packageRoot);
    const names = readdirSync(archives).filter(name => name.endsWith('.tgz'));
    assert.equal(names.length, 1);
    const extracted = join(temp, 'extracted');
    mkdirSync(extracted);
    run('tar', ['-xzf', join(archives, names[0]), '-C', extracted], temp);
    const packed = join(extracted, 'package');
    for (const file of ['dependency-catalog.yaml', 'node-typescript.json', 'plugin-ai-contract.json', 'templates/next/app/page.tsx', 'templates/next-ai/.cityos/next-typecheck/generated-types-policy/projection.json', 'templates/react-router/app/root.tsx', 'templates/react-router-ai/package.json.hbs']) {
      assert.ok(existsSync(join(packed, file)), `missing ${file}`);
    }
    for (const recipe of ['next', 'next-ai']) for (const file of pendingProjectionFiles) {
      const name = file.split('/').at(-1);
      const packaged = join(packed, 'templates', recipe, '.cityos/next-typecheck/generated-types-policy', name);
      assert.deepEqual(readFileSync(packaged), readFileSync(join(workspace, file)), `wrong projection bytes: ${recipe}/${name}`);
    }
    for (const recipe of ['next', 'next-ai']) {
      assert.deepEqual(readFileSync(join(packed, 'templates', recipe, '.gitattributes')), readFileSync(join(workspace, 'recipes', recipe, '.gitattributes')), `missing standalone checkout attributes: ${recipe}`);
    }
    assert.deepEqual(readFileSync(join(packed, 'templates/next/app/favicon.ico')), readFileSync(join(workspace, 'recipes/next/app/favicon.ico')));
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

test('ordinary pack prepares a complete payload from working-tree inputs', { timeout: 180000 }, () => verifyCompletePack(true));

test('ordinary pack prepares a complete payload from tracked checkout inputs', { timeout: 180000 }, t => {
  const pending = [...pendingProjectionFiles, ...pendingRecipeAttributes];
  const tracked = new Set(run('git', ['ls-files', '-z', '--', ...pending], repository).split('\0').filter(Boolean));
  const missing = pending.filter(file => !tracked.has(file));
  if (missing.length) return t.skip(`Required package sources are not tracked yet: ${missing.join(', ')}`);
  const attributes = spawnSync('git', ['diff', '--quiet', '--', '.gitattributes'], { cwd: repository, windowsHide: true });
  assert.equal(attributes.status, 0, 'Working-tree checkout attributes differ from the selected index');
  verifyCompletePack(false);
});

test('ordinary pack fails when required recipe or template inputs are absent', { timeout: 180000 }, () => {
  for (const [omitted, expected] of [
    ['recipes', '../../recipes'],
    ['packages/create-puck-app/templates', 'templates'],
  ]) {
    const temp = mkdtempSync(join(tmpdir(), 'puck-missing-pack-input-'));
    try {
      const workspace = join(temp, 'workspace');
      createCheckout(workspace, omitted);
      const archives = join(temp, 'archives');
      mkdirSync(archives);
      const result = spawnSync(process.execPath, [join(workspace, 'scripts/toolchains/run-pinned-pnpm.mjs'), 'pack', '--pack-destination', archives], {
        cwd: join(workspace, 'packages/create-puck-app'), encoding: 'utf8', windowsHide: true, timeout: 120000,
      });
      assert.equal(result.error, undefined, String(result.error));
      assert.notEqual(result.status, 0, `pack accepted missing ${omitted}`);
      assert.match(`${result.stdout}\n${result.stderr}`, /Missing required create-puck-app input directory/);
      assert.ok(`${result.stdout}\n${result.stderr}`.includes(expected));
      assert.equal(readdirSync(archives).filter(name => name.endsWith('.tgz')).length, 0);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
});
