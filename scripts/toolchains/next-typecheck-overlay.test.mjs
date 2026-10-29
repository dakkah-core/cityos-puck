import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertNextProductionMembership, createNextTypecheckOverlay } from './next-typecheck-overlay.mjs';

test('compiler overlay resolves a nested project file list relative to that project', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-nested-project-'));
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('typescript/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const compiler = resolve(dirname(manifestPath), typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.tsc);
  const write = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
  try {
    write('config/tsconfig.json', JSON.stringify({ compilerOptions: { noEmit: true }, include: ['../src/**/*.ts', '../next-env.d.ts', '../.next/types/**/*.ts'] }));
    write('src/index.ts', 'export const source = 1;');
    write('next-env.d.ts', 'export {};');
    write('.next/types/routes.d.ts', 'export {};');
    write('.next/types/root-params.d.ts', 'export {};');
    write('.next/types/validator.ts', 'export {};');
    const project = join(root, 'config/tsconfig.json');
    const show = spawnSync(process.execPath, [compiler, '--showConfig', '-p', project], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(show.status, 0, show.stdout + show.stderr);
    const overlay = createNextTypecheckOverlay({ appDir: root, project, effective: JSON.parse(show.stdout) });
    assert(overlay.files.includes(join(root, 'src/index.ts')));
    assert(overlay.files.includes(join(root, '.next/types/validator.ts')));
    const referenced = createNextTypecheckOverlay({ appDir: root, project, effective: { ...JSON.parse(show.stdout), references: [{ path: '../shared' }] } });
    assert.equal(referenced.references[0].path, join(root, 'shared'));
    write('overlay/tsconfig.json', JSON.stringify(overlay));
    const check = spawnSync(process.execPath, [compiler, '-p', join(root, 'overlay/tsconfig.json')], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(check.status, 0, check.stdout + check.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('compiler overlay checks fresh validator while excluding stale dev and webpack roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-overlay-'));
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('typescript/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const compiler = resolve(dirname(manifestPath), typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.tsc);
  const run = (...args) => spawnSync(process.execPath, [compiler, ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  const write = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
  try {
    write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, include: ['src/**/*.ts', 'next-env.d.ts', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'] }));
    write('src/index.ts', 'export const source: number = 1;');
    write('next-env.d.ts', 'export {};');
    write('.next/types/routes.d.ts', 'export {};');
    write('.next/types/root-params.d.ts', 'export {};');
    write('.next/types/validator.ts', 'export const route: number = 1;');
    write('.next/types/app/old.ts', 'const old: number = "stale";');
    write('.next/dev/types/old.ts', 'const dev: number = "stale";');
    const show = run('--showConfig', '-p', 'tsconfig.json');
    assert.equal(show.status, 0, show.stdout + show.stderr);
    const effective = JSON.parse(show.stdout);
    const overlay = createNextTypecheckOverlay({ appDir: root, project: join(root, 'tsconfig.json'), effective });
    assert(overlay.files.some(file => file.endsWith('validator.ts')));
    assert(!overlay.files.some(file => file.endsWith('old.ts')));
    write('overlay/tsconfig.json', JSON.stringify(overlay));
    const good = run('-p', 'overlay/tsconfig.json', '--listFilesOnly');
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.match(good.stdout, /validator\.ts/);
    assert.doesNotMatch(good.stdout, /old\.ts/);
    assertNextProductionMembership({ appDir: root, files: good.stdout.trim().split(/\r?\n/u) });
    assert.equal(run('-p', 'overlay/tsconfig.json').status, 0);
    write('src/index.ts', 'import "../.next/dev/types/old"; export const source: number = 1;');
    const imported = run('-p', 'overlay/tsconfig.json', '--listFilesOnly');
    assert.equal(imported.status, 0, imported.stdout + imported.stderr);
    assert.throws(() => assertNextProductionMembership({ appDir: root, files: imported.stdout.trim().split(/\r?\n/u) }), /Stale Next output/);
    write('src/index.ts', 'export const source: number = 1;');
    write('.next/types/validator.ts', 'export const route: number = "invalid";');
    const bad = run('-p', 'overlay/tsconfig.json');
    assert.notEqual(bad.status, 0);
    assert.match(bad.stdout, /TS2322/);
    assert.throws(() => createNextTypecheckOverlay({ appDir: root, project: join(root, 'tsconfig.json'), effective: { ...effective, files: effective.files.filter(file => !file.endsWith('validator.ts')) } }), /validator/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
