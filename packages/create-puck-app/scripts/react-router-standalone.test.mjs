import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyRecipes } from './copy-recipes.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packageRoot = join(repository, 'packages/create-puck-app');
const require = createRequire(join(packageRoot, 'package.json'));
const handlebars = require('handlebars');
const recipes = ['react-router', 'react-router-ai'];
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  return result.stdout;
};

test('React Router recipes survive template generation, packing and fresh typegen in temporary apps', { timeout: 300000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'puck-router-standalone-'));
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
    for (const recipe of recipes) {
      // Start with authored templates only, independent of generated files in the checkout.
      cpSync(join(packageRoot, 'templates', recipe), join(templatePath, recipe), { recursive: true, filter: path => lstatSync(path).isDirectory() || path.endsWith('.hbs') });
      cpSync(join(repository, 'recipes', recipe), join(source, recipe), {
        recursive: true,
        filter: path => !path.split(/[\\/]/u).some(part => ['node_modules', '.react-router', 'build', '.turbo'].includes(part)),
      });
      mkdirSync(join(source, recipe, '.react-router/types'), { recursive: true });
      writeFileSync(join(source, recipe, '.react-router/types/stale.ts'), 'stale generated output');
    }
    assert.equal(existsSync(join(templatePath, 'next')), false);
    assert.equal(existsSync(join(templatePath, 'react-router/vite.config.ts')), false);
    copyRecipes({ recipePath: source, templatePath });
    writeFileSync(join(workspace, 'package.json'), '{"private":true}\n');
    cpSync(join(repository, 'pnpm-workspace.yaml'), join(workspace, 'pnpm-workspace.yaml'));
    const destination = join(temp, 'archives');
    mkdirSync(destination);
    run(process.execPath, [join(repository, 'scripts/toolchains/run-pinned-pnpm.mjs'), 'pack', '--ignore-scripts', '--pack-destination', destination], packedSource);
    const archives = readdirSync(destination).filter(name => name.endsWith('.tgz'));
    assert.equal(archives.length, 1);
    const extracted = join(temp, 'extracted');
    mkdirSync(extracted);
    run('tar', ['-xzf', join(destination, archives[0]), '-C', extracted], temp);
    const packed = join(extracted, 'package');
    symlinkSync(join(packageRoot, 'node_modules'), join(packed, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const { loadBootstrapCatalog } = await import(pathToFileURL(join(packed, 'bootstrap-catalog.js')).href);
    const { materializeManifest } = await import(pathToFileURL(join(packed, 'manifest-catalog.js')).href);
    const { prepareBootstrapIntegration, verifyIntegrationPatch } = await import(pathToFileURL(join(packed, 'bootstrap-integration.js')).href);
    const catalog = loadBootstrapCatalog();
    const context = { appName: 'fixture', puckVersion: `npm:${catalog.core.name}@${catalog.core.version}`, puckSourceVersion: catalog.core.version, packageManager: catalog.toolchain.packageManager, nodeEngine: catalog.toolchain.nodeEngine, nodeVersion: catalog.nodeVersion };
    const diagnosticFailures = [];
    for (const recipe of recipes) {
      const template = join(packed, 'templates', recipe);
      assert.equal(existsSync(join(template, '.react-router')), false, recipe);
      assert.equal(existsSync(join(template, 'build')), false, recipe);
      assert.ok(existsSync(join(template, 'gitignore')), `${recipe}: ${readdirSync(template).join(', ')}`);
      const app = join(temp, `app-${recipe}`);
      cpSync(template, app, { recursive: true });
      const render = file => handlebars.compile(readFileSync(join(app, `${file}.hbs`), 'utf8'))(context);
      const manifest = materializeManifest(JSON.parse(render('package.json')), catalog.workspace);
      assert.equal(manifest.scripts.typecheck, 'react-router typegen && tsc --noEmit');
      assert.ok(Object.values({ ...manifest.dependencies, ...manifest.devDependencies }).every(value => !/^(catalog|workspace):/u.test(value)));
      const integration = prepareBootstrapIntegration(manifest, catalog.workspace, catalog.core, catalog.pluginAiContract);
      if (recipe.endsWith('-ai')) {
        assert.ok(integration);
        verifyIntegrationPatch(readFileSync(catalog.patches[integration.selector]), catalog.pluginAiContract);
        assert.ok(existsSync(join(packed, 'plugin-ai-peer.cjs')));
      } else assert.equal(integration, undefined);
      writeFileSync(join(app, 'package.json'), JSON.stringify(manifest));
      writeFileSync(join(app, 'tsconfig.json'), render('tsconfig.json'));
      symlinkSync(join(repository, 'recipes', recipe, 'node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      const recipeRequire = createRequire(join(repository, 'recipes', recipe, 'package.json'));
      const devManifest = recipeRequire.resolve('@react-router/dev/package.json');
      const dev = JSON.parse(readFileSync(devManifest, 'utf8'));
      const cli = join(dirname(devManifest), dev.bin['react-router']);
      run(process.execPath, [cli, 'typegen'], app);
      const generated = join(app, '.react-router/types');
      assert.ok(existsSync(generated), `${recipe} produces framework types`);
      assert.ok(readdirSync(generated).length > 0, recipe);
      rmSync(join(app, '.react-router'), { recursive: true });
      run(process.execPath, [cli, 'typegen'], app);
      assert.ok(existsSync(generated), `${recipe} regenerates removed types`);
      const compilerManifest = require.resolve('typescript/package.json', { paths: [repository] });
      const compiler = JSON.parse(readFileSync(compilerManifest, 'utf8'));
      const files = run(process.execPath, [join(dirname(compilerManifest), compiler.bin.tsc), '--listFilesOnly', '--noEmit'], app);
      assert.match(files.replaceAll('\\', '/'), /\.react-router\/types\/.*puck-splat/u, `${recipe} compiler includes generated route types`);
      const diagnostics = spawnSync(process.execPath, [join(dirname(compilerManifest), compiler.bin.tsc), '--noEmit'], {
        cwd: app, encoding: 'utf8', windowsHide: true, timeout: 120000,
      });
      if (diagnostics.error || diagnostics.status !== 0) {
        diagnosticFailures.push(`${recipe}: exit ${diagnostics.status}\n${diagnostics.stdout}\n${diagnostics.stderr}\n${diagnostics.error ?? ''}`);
      }
    }
    assert.deepEqual(diagnosticFailures, [], `Generated React Router app typechecks failed:\n${diagnosticFailures.join('\n')}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
