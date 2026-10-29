import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyRecipes } from '../../packages/create-puck-app/scripts/copy-recipes.mjs';

const hosts = ['apps/docs', 'apps/demo', 'recipes/next', 'recipes/next-ai'];

test('Next host projects retain development and production source scope', () => {
  for (const host of hosts) {
    const read = name => readFileSync(resolve(host, name), 'utf8');
    const source = JSON.parse(read('tsconfig.json'));
    const build = JSON.parse(read('tsconfig.build.json'));
    assert.equal(build.extends, './tsconfig.json', host);
    assert.deepEqual(build.exclude, [...source.exclude, '.next/dev/types'], host);
    assert(source.include.includes('next-env.d.ts'), host);
    assert(source.include.includes('.next/types/**/*.ts'), host);
    assert(source.include.includes('.next/dev/types/**/*.ts'), host);
  }
});

test('standalone recipe copying carries the selected production config', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-templates-'));
  const source = join(root, 'recipes'), target = join(root, 'templates');
  try {
    for (const recipe of ['next', 'next-ai']) {
      mkdirSync(join(source, recipe), { recursive: true });
      mkdirSync(join(target, recipe), { recursive: true });
      for (const file of ['package.json', 'next.config.js', 'tsconfig.json', 'tsconfig.build.json']) copyFileSync(resolve('recipes', recipe, file), join(source, recipe, file));
    }
    copyRecipes({ recipePath: source, templatePath: target });
    for (const recipe of ['next', 'next-ai']) for (const file of ['next.config.js', 'tsconfig.json', 'tsconfig.build.json']) {
      assert.deepEqual(readFileSync(join(target, recipe, file)), readFileSync(resolve('recipes', recipe, file)), `${recipe}/${file}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('installed Next selects dev and production configs and its writer leaves both unchanged', { timeout: 90000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-phases-'));
  const require = createRequire(import.meta.url);
  const nextManifest = require.resolve('next/package.json');
  const compilerManifest = require.resolve('typescript/package.json');
  const compilerPackage = JSON.parse(readFileSync(compilerManifest, 'utf8'));
  const compiler = resolve(dirname(compilerManifest), typeof compilerPackage.bin === 'string' ? compilerPackage.bin : compilerPackage.bin.tsc);
  const nextRequire = createRequire(nextManifest);
  const script = `const fs=require('node:fs'); const {createRequire}=require('node:module'); const path=require('node:path'); const r=createRequire(process.argv[1]); const constants=r('next/constants'); const load=r('next/dist/server/config').default; const writer=r('next/dist/lib/typescript/writeConfigurationDefaults').writeConfigurationDefaults; (async()=>{const report=[]; for (const phase of [constants.PHASE_DEVELOPMENT_SERVER, constants.PHASE_PRODUCTION_BUILD]) { const config=await load(phase,process.cwd()); const selected=config.typescript.tsconfigPath; const file=path.join(process.cwd(),selected); const original=fs.readFileSync(file); await writer(process.argv[2],file,false,true,config.distDir,false,false); if(!fs.readFileSync(file).equals(original)) throw Error('Writer modified '+selected); report.push({phase,selected,distDir:config.distDir,cli:config.experimental.useTypeScriptCli}); } fs.writeFileSync('phase-result.json',JSON.stringify(report)); })().catch(e=>{console.error(e);process.exitCode=1});`;
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    for (const recipe of ['next', 'next-ai']) {
      mkdirSync(join(recipes, recipe), { recursive: true });
      for (const file of ['package.json', 'next.config.js', 'tsconfig.json', 'tsconfig.build.json']) copyFileSync(resolve('recipes', recipe, file), join(recipes, recipe, file));
      cpSync(resolve('recipes', recipe, 'tsconfig'), join(recipes, recipe, 'tsconfig'), { recursive: true });
      mkdirSync(join(templates, recipe), { recursive: true });
    }
    copyRecipes({ recipePath: recipes, templatePath: templates });
    const targets = [...hosts.map((host, index) => ({ name: host, source: resolve(host), target: join(root, `host-${index}`) })), ...['next', 'next-ai'].map(recipe => ({ name: `standalone/${recipe}`, source: join(templates, recipe), target: join(root, `standalone-${recipe}`) }))];
    for (const { name, source, target } of targets) {
      mkdirSync(target, { recursive: true });
      const config = name === 'apps/docs' ? 'next.config.mjs' : 'next.config.js';
      for (const file of [config, 'tsconfig.json', 'tsconfig.build.json']) copyFileSync(join(source, file), join(target, file));
      cpSync(join(source, 'tsconfig'), join(target, 'tsconfig'), { recursive: true });
      writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'phase-fixture', version: '0.0.0', private: true }));
      symlinkSync(resolve('node_modules'), join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      for (const path of ['app', '.next/types', '.next/dev/types']) mkdirSync(join(target, path), { recursive: true });
      writeFileSync(join(target, 'app/page.tsx'), 'export default function Page() { return null; }');
      writeFileSync(join(target, 'next-env.d.ts'), 'export {};');
      writeFileSync(join(target, '.next/types/validator.ts'), 'export const production: number = 1;');
      writeFileSync(join(target, '.next/dev/types/validator.ts'), 'export const development: number = 1;');
      const loaded = spawnSync(process.execPath, ['--eval', script, nextManifest, compilerPackage.version], { cwd: target, encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_DISABLE_SWC_WASM: '1' } });
      assert.equal(loaded.status, 0, `${name}: ${loaded.stdout}${loaded.stderr}`);
      const [dev, production] = JSON.parse(readFileSync(join(target, 'phase-result.json'), 'utf8'));
      assert.equal(dev.phase, nextRequire('next/constants').PHASE_DEVELOPMENT_SERVER, name);
      assert.equal(production.phase, nextRequire('next/constants').PHASE_PRODUCTION_BUILD, name);
      assert.equal(dev.selected, 'tsconfig.json', name);
      assert.equal(production.selected, 'tsconfig.build.json', name);
      assert.equal(dev.distDir.replaceAll('\\', '/'), '.next/dev', name);
      assert.equal(production.distDir, '.next', name);
      assert.equal(dev.cli, true, name);
      assert.equal(production.cli, true, name);
      for (const phase of [dev, production]) {
        const list = spawnSync(process.execPath, [compiler, '-p', phase.selected, '--listFilesOnly'], { cwd: target, encoding: 'utf8', windowsHide: true, timeout: 30000 });
        assert.equal(list.status, 0, `${name}: ${list.stdout}${list.stderr}`);
        const normalized = list.stdout.replaceAll('\\', '/');
        assert.match(normalized, /\.next\/types\/validator\.ts/, name);
        if (phase === dev) assert.match(normalized, /\.next\/dev\/types\/validator\.ts/, name);
        else assert.doesNotMatch(normalized, /\.next\/dev\/types\/validator\.ts/, name);
        assert.match(normalized, /app\/page\.tsx/, name);
      }
      if (name === 'standalone/next') {
        const beforeDev = readFileSync(join(target, 'tsconfig.json'));
        const beforeBuild = readFileSync(join(target, 'tsconfig.build.json'));
        const generated = spawnSync(process.execPath, [nextRequire.resolve('next/dist/bin/next'), 'typegen'], { cwd: target, encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, NODE_ENV: 'production', CI: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_DISABLE_SWC_WASM: '1' } });
        assert.equal(generated.status, 0, `${name}: ${generated.stdout}${generated.stderr}`);
        assert.deepEqual(readFileSync(join(target, 'tsconfig.json')), beforeDev);
        assert.deepEqual(readFileSync(join(target, 'tsconfig.build.json')), beforeBuild);
        assert.match(readFileSync(join(target, 'next-env.d.ts'), 'utf8').replaceAll('\\', '/'), /\.\/\.next\/types\/routes\.d\.ts/);
        assert.match(readFileSync(join(target, '.next/types/validator.ts'), 'utf8'), /app\/page/);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('selected compiler includes production validators and excludes stale dev roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-config-'));
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('typescript/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const compiler = resolve(dirname(manifestPath), typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.tsc);
  const write = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
  try {
    write('tsconfig.json', JSON.stringify({ compilerOptions: { noEmit: true, strict: true, paths: { '@/*': ['./src/*'] } }, include: ['next-env.d.ts', 'src/**/*.ts', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'], exclude: ['node_modules'] }));
    write('tsconfig.build.json', readFileSync(resolve('recipes/next/tsconfig.build.json')));
    write('src/index.ts', 'export const x: number = 1;');
    write('next-env.d.ts', 'export {};');
    write('.next/types/validator.ts', 'export {};');
    write('.next/dev/types/stale.ts', 'const x: number = "wrong";');
    const check = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.build.json', '--listFilesOnly'], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(check.status, 0, check.stdout + check.stderr);
    assert.match(check.stdout, /validator\.ts/);
    assert.match(check.stdout, /src[\\/]index\.ts/);
    assert.doesNotMatch(check.stdout, /stale\.ts/);
    const show = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.build.json', '--showConfig'], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(show.status, 0, show.stdout + show.stderr);
    assert.deepEqual(JSON.parse(show.stdout).compilerOptions.paths, { '@/*': ['./src/*'] });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
