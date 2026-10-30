import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { runPackageBuild } from './build-package.mjs';

test('package prepare and build use the same non-installing entrypoint', () => {
  for (const name of ['field-contentful', 'plugin-heading-analyzer', 'plugin-emotion-cache']) {
    const manifest = JSON.parse(readFileSync(new URL(`../../packages/${name}/package.json`, import.meta.url), 'utf8'));
    assert.match(manifest.scripts.build, /^node \.\.\/\.\.\/scripts\/toolchains\/build-package\.mjs index\.tsx?$/u, name);
    assert.equal(manifest.scripts.prepare, manifest.scripts.build, name);
    assert.doesNotMatch(manifest.scripts.prepare, /run-pinned-pnpm/u);
  }
});

test('package prepare runs directly in an install-like environment without nested pnpm', t => {
  const root = mkdtempSync(join(tmpdir(), 'puck-prepare-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ['scripts/toolchains/build-package.mjs', 'scripts/toolchains/clean-package-dist.mjs', 'scripts/toolchains/toolchain.mjs',
    'packages/create-puck-app/toolchain.cjs', 'config/toolchains/node-typescript.json']) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(file), target);
  }
  const nested = join(root, 'nested-pnpm');
  writeFileSync(join(root, 'scripts/toolchains/run-pinned-pnpm.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(nested)}, 'called'); process.exitCode = 73;`);
  for (const name of ['field-contentful', 'plugin-heading-analyzer', 'plugin-emotion-cache']) {
    const source = resolve(`packages/${name}/package.json`), packageDir = join(root, 'packages', name);
    mkdirSync(join(packageDir, 'node_modules/tsup'), { recursive: true });
    copyFileSync(source, join(packageDir, 'package.json'));
    const manifest = JSON.parse(readFileSync(source, 'utf8'));
    assert.match(manifest.scripts.prepare, /^node \.\.\/\.\.\/scripts\/toolchains\/build-package\.mjs index\.tsx?$/u);
    const entry = manifest.scripts.prepare.split(' ').at(-1);
    writeFileSync(join(packageDir, entry), 'export {};');
    writeFileSync(join(packageDir, 'node_modules/tsup/package.json'), JSON.stringify({ name: 'tsup', bin: { tsup: 'cli.cjs' } }));
    const marker = join(packageDir, 'compiler-invocation.json');
    writeFileSync(join(packageDir, 'node_modules/tsup/cli.cjs'), `require('node:fs').writeFileSync(process.env.PUCK_TEST_MARKER, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), node: process.execPath })); process.exitCode = Number(process.env.PUCK_TEST_EXIT);`);
    const invoke = code => spawnSync(process.execPath, [resolve(packageDir, '../../scripts/toolchains/build-package.mjs'), entry], {
      cwd: packageDir, encoding: 'utf8', windowsHide: true, env: { ...process.env, npm_lifecycle_event: 'prepare', npm_command: 'install', pnpm_config_verify_deps_before_run: 'false', PUCK_TEST_MARKER: marker, PUCK_TEST_EXIT: String(code) },
    });
    const success = invoke(0);
    assert.equal(success.status, 0, success.stderr);
    const observed = JSON.parse(readFileSync(marker, 'utf8'));
    assert.deepEqual(observed.argv, [entry]);
    assert.equal(observed.cwd.toLowerCase(), packageDir.toLowerCase());
    assert.equal(observed.node.toLowerCase(), process.execPath.toLowerCase());
    assert.equal(invoke(7).status, 7);
    assert.equal(existsSync(nested), false);
  }
});

test('package build validates inputs before cleanup and invokes installed tsup directly', () => {
  const cwd = resolve('packages/field-contentful');
  let cleaned = false, observed;
  assert.throws(() => runPackageBuild({ cwd, entries: ['../outside.ts'], clean: () => { cleaned = true; } }), /Invalid package build entry/u);
  assert.equal(cleaned, false);
  const status = runPackageBuild({ cwd, entries: ['index.ts'], clean: () => { cleaned = true; },
    run: (executable, args) => { observed = { executable, args }; return { status: 7 }; } });
  assert.equal(status, 7);
  assert.equal(cleaned, true);
  assert.equal(observed.executable, process.execPath);
  assert.match(observed.args[0], /tsup[\\/].*cli-default\.js$/u);
  assert.deepEqual(observed.args.slice(1), ['index.ts']);
});
