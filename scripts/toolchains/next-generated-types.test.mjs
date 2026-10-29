import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyNextToolchain } from '../../packages/create-puck-app/scripts/copy-next-toolchain.mjs';
import { acquireNextOutputLocks } from './next-output-lock.mjs';
import { GENERATED_TYPES_POLICY_FILES } from './verify-generated-types-policy.mjs';

test('generated standalone adapter performs real typegen, compiler checking and fail-closed preflights', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-guarded-next-'));
  const templates = join(root, 'templates');
  const app = join(templates, 'next');
  const require = createRequire(import.meta.url);
  const nextManifest = require.resolve('next/package.json');
  const write = (name, value) => { const file = join(app, name); mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, value); };
  const run = () => spawnSync(process.execPath, [join(app, '.cityos/next-typecheck/next-generated-types.mjs'), '--standalone'], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  try {
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: templates });
    symlinkSync(resolve('node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    write('package.json', JSON.stringify({ private: true, dependencies: { next: 'fixture' } }));
    write('package-lock.json', '{}');
    write('next.config.js', 'module.exports = { experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };');
    write('tsconfig.base.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', target: 'es2022' } }));
    write('tsconfig.json', JSON.stringify({ extends: './tsconfig.base.json', include: ['next-env.d.ts', 'app/**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'], exclude: ['node_modules'] }));
    write('tsconfig.build.json', JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', '.next/dev/types'] }));
    write('app/page.tsx', 'export default 123;');
    // A config import may change a route before Next resolves its distDir.
    write('config-helper.js', 'require("node:fs").writeFileSync(require("node:path").join(__dirname, "app/page.tsx"), "export default function Page() { return null; }"); module.exports = { experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };');
    write('next.config.js', 'module.exports = require("./config-helper.js");');
    const configMutation = run();
    assert.notEqual(configMutation.status, 0);
    assert.match(configMutation.stderr, /inputs changed during config loading/i);
    assert.equal(existsSync(join(app, '.next/types/validator.ts')), false);
    rmSync(join(app, 'config-helper.js'));
    // The child loads config again; a changed route must be rejected before
    // the compiler can consume a validator generated from a different input.
    write('next.config.js', 'if (process.argv.includes("typegen")) require("node:fs").writeFileSync(require("node:path").join(__dirname, "app/page.tsx"), "export default function Page() { return null; }"); module.exports = { experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };');
    write('app/page.tsx', 'export default 123;');
    const generationMutation = run();
    assert.notEqual(generationMutation.status, 0);
    assert.match(generationMutation.stderr, /inputs changed during generation/i);
    // These authored directories have output-like names but are TypeScript
    // inputs. A typegen-time mutation must invalidate the check for each one.
    for (const directory of ['out', 'dist']) {
      write(`src/${directory}/value.ts`, 'export const value: number = 1;');
      write('app/page.tsx', `import { value } from "../src/${directory}/value"; export default function Page() { return value; }`);
      write('next.config.js', `if (process.argv.includes("typegen")) require("node:fs").writeFileSync(require("node:path").join(__dirname, "src/${directory}/value.ts"), "export const value: number = 2;"); module.exports = { experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };`);
      const authoredMutation = run();
      assert.notEqual(authoredMutation.status, 0, directory);
      assert.match(authoredMutation.stderr, /inputs changed during generation/i, directory);
    }
    write('next.config.js', 'module.exports = { experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };');
    write('app/page.tsx', 'export default 123;');
    const bad = run();
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /TS2344/);
    assert(existsSync(join(app, '.next/types/validator.ts')));
    write('app/page.tsx', 'export default function Page() { return null; }');
    write('.next/dev/types/stale.ts', 'const stale: number = "invalid";');
    write('.next/types/app/old.ts', 'const stale: number = "invalid";');
    const good = run();
    assert.equal(good.status, 0, good.stdout + good.stderr);
    // Next generates module augmentation for configured cache profiles. The
    // compiler must reject unknown names and accept the configured custom one.
    write('next.config.js', 'module.exports = { cacheLife: { editorial: { stale: 30, revalidate: 60, expire: 120 } }, experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };');
    write('app/page.tsx', 'import { cacheLife } from "next/cache"; cacheLife("editorial-typo"); export default function Page() { return null; }');
    const invalidCacheProfile = run();
    assert.notEqual(invalidCacheProfile.status, 0, invalidCacheProfile.stdout + invalidCacheProfile.stderr);
    assert.match(invalidCacheProfile.stderr, /TS2769/);
    write('app/page.tsx', 'import { cacheLife } from "next/cache"; cacheLife("editorial"); export default function Page() { return null; }');
    const validCacheProfile = run();
    assert.equal(validCacheProfile.status, 0, validCacheProfile.stdout + validCacheProfile.stderr);
    // Both config imports and TypeScript sources may live outside the app.
    const externalConfig = join(templates, 'shared-config.cjs');
    const externalSource = join(templates, 'shared-source.ts');
    const sharedConfig = 'module.exports = { experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };';
    writeFileSync(externalConfig, sharedConfig);
    writeFileSync(externalSource, 'export const value: number = 1;');
    write('next.config.js', 'module.exports = require("../shared-config.cjs");');
    write('app/page.tsx', 'import { value } from "../../shared-source"; export default function Page() { return value; }');
    const externalGood = run();
    assert.equal(externalGood.status, 0, externalGood.stdout + externalGood.stderr);
    // A module can mutate itself while the parent config is executing.
    writeFileSync(externalConfig, 'require("node:fs").appendFileSync(__filename, "\\n// changed"); ' + sharedConfig);
    const configExternalMutation = run();
    assert.notEqual(configExternalMutation.status, 0);
    assert.match(configExternalMutation.stderr, /External Next input changed/i);
    writeFileSync(externalConfig, sharedConfig);
    // The separate typegen process must not change an imported workspace source.
    write('next.config.js', 'if (process.argv.includes("typegen")) require("node:fs").writeFileSync(require("node:path").join(__dirname, "../shared-source.ts"), "export const value: number = 2;"); module.exports = require("../shared-config.cjs");');
    const sourceMutation = run();
    assert.notEqual(sourceMutation.status, 0);
    assert.match(sourceMutation.stderr, /External Next input changed/i);
    writeFileSync(externalSource, 'export const value: number = 1;');
    // A child-only external config import must not evade the parent snapshot.
    writeFileSync(join(templates, 'child-only.cjs'), sharedConfig);
    write('next.config.js', 'module.exports = require(process.argv.includes("typegen") ? "../child-only.cjs" : "../shared-config.cjs");');
    const newImport = run();
    assert.notEqual(newImport.status, 0);
    assert.match(newImport.stderr, /Untracked external Next config import/i);
    write('next.config.js', 'module.exports = { experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };');
    write('app/page.tsx', 'export default function Page() { return null; }');
    const release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true });
    try {
      const busy = run();
      assert.notEqual(busy.status, 0);
      assert.match(busy.stderr, /busy/i);
    } finally { release(); }
    const raw = '{"compilerOptions": {}}';
    write('tsconfig.build.json', raw);
    const unsafe = run();
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /would rewrite config/i);
    assert.equal(readFileSync(join(app, 'tsconfig.build.json'), 'utf8'), raw);
    const catalog = join(app, '.cityos/next-typecheck/node-typescript.json');
    const altered = JSON.parse(readFileSync(catalog, 'utf8'));
    altered.typescript = '0.0.0';
    writeFileSync(catalog, JSON.stringify(altered));
    const wrongCompiler = run();
    assert.notEqual(wrongCompiler.status, 0);
    assert.match(wrongCompiler.stderr, /Expected TypeScript/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing installed type dependencies fail before Next generation or an installer', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-guarded-missing-'));
  const app = join(root, 'next');
  const require = createRequire(import.meta.url);
  const link = (source, target) => symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: root });
    mkdirSync(join(app, 'node_modules'), { recursive: true });
    link(resolve('node_modules/next'), join(app, 'node_modules/next'));
    link(resolve('node_modules/typescript'), join(app, 'node_modules/typescript'));
    writeFileSync(join(app, 'package.json'), JSON.stringify({ dependencies: { next: 'fixture' } }));
    writeFileSync(join(app, 'package-lock.json'), '{}');
    const result = spawnSync(process.execPath, [join(app, '.cityos/next-typecheck/next-generated-types.mjs'), '--standalone'], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /@types\/react/);
    assert.equal(existsSync(join(app, '.next')), false);
    assert.equal(existsSync(join(app, 'next-env.d.ts')), false);
    assert.equal(existsSync(join(app, 'node_modules/@types')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('workspace entrypoint discovers membership and runs a real isolated host', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-workspace-next-'));
  const app = join(root, 'apps/example');
  const write = (path, value) => { const file = join(root, path); mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, value); };
  try {
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: join(root, 'copy') });
    mkdirSync(join(root, 'scripts'), { recursive: true });
    cpSync(join(root, 'copy/next/.cityos/next-typecheck'), join(root, 'scripts/toolchains'), { recursive: true });
    mkdirSync(join(root, 'config/toolchains'), { recursive: true });
    copyFileSync(resolve('config/toolchains/node-typescript.json'), join(root, 'config/toolchains/node-typescript.json'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    write('package.json', '{"private":true}');
    write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n');
    write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
    write('apps/example/package.json', JSON.stringify({ private: true, dependencies: { next: 'fixture' } }));
    write('packages/shared/options.mjs', 'export default { experimental: { useTypeScriptCli: true }, typescript: { tsconfigPath: "tsconfig.build.json" } };');
    write('packages/shared/config.mjs', 'export { default } from "./options.mjs";');
    write('packages/shared/value.ts', 'export const value: number = 1;');
    write('apps/example/next.config.mjs', 'export { default } from "../../packages/shared/config.mjs";');
    write('apps/example/tsconfig.base.json', JSON.stringify({ compilerOptions: { noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', target: 'es2022' } }));
    write('apps/example/tsconfig.json', JSON.stringify({ extends: './tsconfig.base.json', include: ['next-env.d.ts', 'app/**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules'] }));
    write('apps/example/tsconfig.build.json', JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', '.next/dev/types'] }));
    write('apps/example/app/page.tsx', 'import { value } from "../../../packages/shared/value"; export default function Page() { return value; }');
    const run = () => spawnSync(process.execPath, [join(root, 'scripts/toolchains/next-generated-types.mjs'), '--workspace'], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    const result = run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert(existsSync(join(app, '.next/types/validator.ts')));
    write('apps/example/next.config.mjs', 'import fs from "node:fs"; if (process.argv.includes("typegen")) fs.writeFileSync(new URL("../../packages/shared/options.mjs", import.meta.url), "export default {};"); export { default } from "../../packages/shared/config.mjs";');
    const changedConfig = run();
    assert.notEqual(changedConfig.status, 0);
    assert.match(changedConfig.stderr, /External Next input changed/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('both template toolchains copy the unchanged policy and leave React Router untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-guarded-copy-'));
  try {
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: root });
    for (const recipe of ['next', 'next-ai']) for (const file of [...GENERATED_TYPES_POLICY_FILES, 'projection.json']) {
      assert.deepEqual(readFileSync(join(root, recipe, '.cityos/next-typecheck/generated-types-policy', file)), readFileSync(resolve('scripts/toolchains/generated-types-policy', file)));
    }
    assert(!existsSync(join(root, 'react-router')));
    assert(!existsSync(join(root, 'react-router-ai')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('four Next hosts and both standalone manifests invoke the guarded entrypoint', () => {
  for (const path of ['apps/docs', 'apps/demo', 'recipes/next', 'recipes/next-ai']) {
    const manifest = JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8'));
    assert.equal(manifest.scripts.typecheck, 'node ../../scripts/toolchains/next-generated-types.mjs --workspace', path);
    assert.equal(manifest.scripts.build, 'node ../../scripts/toolchains/next-build-guard.mjs --workspace', path);
  }
  for (const recipe of ['next', 'next-ai']) {
    const manifest = JSON.parse(readFileSync(resolve('packages/create-puck-app/templates', recipe, 'package.json.hbs'), 'utf8'));
    assert.equal(manifest.scripts.typecheck, 'node .cityos/next-typecheck/next-generated-types.mjs --standalone');
    assert.equal(manifest.scripts.build, 'node .cityos/next-typecheck/next-build-guard.mjs --standalone');
  }
  for (const recipe of ['react-router', 'react-router-ai']) {
    assert.match(JSON.parse(readFileSync(resolve('recipes', recipe, 'package.json'), 'utf8')).scripts.typecheck, /^react-router typegen && /);
    assert.match(JSON.parse(readFileSync(resolve('packages/create-puck-app/templates', recipe, 'package.json.hbs'), 'utf8')).scripts.typecheck, /^react-router typegen && /);
  }
});

test('the pinned manager includes both adapters in the publish-layout package fixture', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-guarded-pack-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'puck-pack-fixture', version: '1.0.0', files: ['templates'] }));
    const templates = join(root, 'templates');
    mkdirSync(templates);
    // scripts/publish.sh invokes removeGitignore before publish.
    copyFileSync(resolve('packages/create-puck-app/templates/.gitignore'), join(templates, 'gitignore'));
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: templates });
    const packed = spawnSync(process.execPath, [resolve('scripts/toolchains/run-pinned-pnpm.mjs'), 'pack', '--dir', root, '--dry-run', '--json'], { cwd: resolve('.'), env: process.env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(packed.status, 0, packed.stdout + packed.stderr);
    for (const recipe of ['next', 'next-ai']) for (const file of ['next-generated-types.mjs', 'next-build-guard.mjs', 'next-output-lock.mjs', 'generated-types-policy/projection.json', ...GENERATED_TYPES_POLICY_FILES.map(name => `generated-types-policy/${name}`)]) {
      assert(packed.stdout.includes(`templates/${recipe}/.cityos/next-typecheck/${file}`), packed.stdout);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
