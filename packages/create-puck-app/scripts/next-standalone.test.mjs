import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyRecipes } from './copy-recipes.mjs';
import { copyNextToolchain } from './copy-next-toolchain.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packageRoot = join(repository, 'packages/create-puck-app');
const handlebars = createRequire(join(packageRoot, 'package.json'))('handlebars');
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120000, env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' } });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  return result.stdout;
};

test('packed Next recipes contain a working standalone typecheck toolchain', { timeout: 300000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'puck-next-standalone-'));
  try {
    const source = join(temp, 'recipes');
    const workspace = join(temp, 'workspace');
    const packedSource = join(workspace, 'packages/create-puck-app');
    mkdirSync(source, { recursive: true });
    mkdirSync(dirname(packedSource), { recursive: true });
    cpSync(packageRoot, packedSource, { recursive: true, filter: path => !path.split(/[\\/]/u).includes('node_modules') && relative(packageRoot, path).split(sep)[0] !== 'templates' });
    const templatePath = join(packedSource, 'templates');
    mkdirSync(templatePath, { recursive: true });
    for (const file of ['.gitignore', '.npmignore']) copyFileSync(join(packageRoot, 'templates', file), join(templatePath, file));
    for (const recipe of ['next', 'next-ai']) {
      // Start with authored templates only, independent of generated files in the checkout.
      cpSync(join(packageRoot, 'templates', recipe), join(templatePath, recipe), { recursive: true, filter: path => lstatSync(path).isDirectory() || path.endsWith('.hbs') });
      cpSync(join(repository, 'recipes', recipe), join(source, recipe), { recursive: true, filter: path => !path.split(/[\\/]/u).some(part => ['node_modules', '.next', '.turbo', 'next-env.d.ts'].includes(part)) });
      mkdirSync(join(source, recipe, '.next/types'), { recursive: true });
      writeFileSync(join(source, recipe, '.next/types/stale.ts'), 'stale');
    }
    assert.equal(existsSync(join(templatePath, 'react-router-ai')), false);
    assert.equal(existsSync(join(templatePath, 'next/next.config.js')), false);
    copyRecipes({ recipePath: source, templatePath });
    copyNextToolchain({ repositoryRoot: repository, templatePath: join(packedSource, 'templates') });
    writeFileSync(join(workspace, 'package.json'), '{"private":true}\n');
    cpSync(join(repository, 'pnpm-workspace.yaml'), join(workspace, 'pnpm-workspace.yaml'));
    const archives = join(temp, 'archives');
    mkdirSync(archives);
    run(process.execPath, [join(repository, 'scripts/toolchains/run-pinned-pnpm.mjs'), 'pack', '--ignore-scripts', '--pack-destination', archives], packedSource);
    const names = readdirSync(archives).filter(name => name.endsWith('.tgz'));
    assert.equal(names.length, 1);
    const extracted = join(temp, 'extracted');
    mkdirSync(extracted);
    run('tar', ['-xzf', join(archives, names[0]), '-C', extracted], temp);
    const packed = join(extracted, 'package');
    symlinkSync(join(packageRoot, 'node_modules'), join(packed, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const { loadBootstrapCatalog } = await import(pathToFileURL(join(packed, 'bootstrap-catalog.js')).href);
    const { materializeManifest } = await import(pathToFileURL(join(packed, 'manifest-catalog.js')).href);
    const catalog = loadBootstrapCatalog();
    const context = { appName: 'fixture', puckVersion: `npm:${catalog.core.name}@${catalog.core.version}`, puckSourceVersion: catalog.core.version, packageManager: catalog.toolchain.packageManager, nodeEngine: catalog.toolchain.nodeEngine, nodeVersion: catalog.nodeVersion };
    for (const recipe of ['next', 'next-ai']) {
      const template = join(packed, 'templates', recipe);
      assert.equal(existsSync(join(template, '.next')), false);
      assert.equal(existsSync(join(template, 'next-env.d.ts')), false);
      assert.ok(existsSync(join(template, 'gitignore')), recipe);
      assert.deepEqual(readFileSync(join(template, '.gitattributes')), readFileSync(join(repository, 'recipes', recipe, '.gitattributes')));
      const icon = recipe === 'next' ? 'app/favicon.ico' : 'public/favicon.ico';
      assert.deepEqual(readFileSync(join(template, icon)), readFileSync(join(repository, 'recipes', recipe, icon)));
      const app = join(temp, `app-${recipe}`);
      cpSync(template, app, { recursive: true });
      const manifest = materializeManifest(JSON.parse(handlebars.compile(readFileSync(join(app, 'package.json.hbs'), 'utf8'))(context)), catalog.workspace);
      assert.equal(manifest.scripts.typecheck, 'node .cityos/next-typecheck/next-generated-types.mjs --standalone');
      assert.equal(manifest.scripts.build, 'node .cityos/next-typecheck/next-build-guard.mjs --standalone');
      writeFileSync(join(app, 'package.json'), JSON.stringify(manifest));
      // The fixture uses already-installed dependencies; it does not install packages.
      symlinkSync(join(repository, 'recipes', recipe, 'node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      cpSync(join(repository, 'pnpm-lock.yaml'), join(app, 'pnpm-lock.yaml'));
      run(process.execPath, [join(app, '.cityos/next-typecheck/next-generated-types.mjs'), '--standalone'], app);
      assert.ok(existsSync(join(app, '.next/types/routes.d.ts')), recipe);
      // Help exercises the packaged build guard without starting a build.
      assert.match(run(process.execPath, [join(app, '.cityos/next-typecheck/next-build-guard.mjs'), '--standalone', '--help'], app), /Usage:/i);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
