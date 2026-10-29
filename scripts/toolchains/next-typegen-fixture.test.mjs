import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireNextOutputLocks } from './next-output-lock.mjs';
import { assertNextProductionMembership, createNextTypecheckOverlay } from './next-typecheck-overlay.mjs';

test('real Next typegen exposes invalid routes to the selected compiler in a disposable app', async () => {
  const app = mkdtempSync(join(tmpdir(), 'puck-next-typegen-'));
  const require = createRequire(import.meta.url);
  const nextManifest = require.resolve('next/package.json');
  const next = require.resolve('next/dist/bin/next');
  const compilerManifest = require.resolve('typescript/package.json');
  const pkg = JSON.parse(readFileSync(compilerManifest, 'utf8'));
  const compiler = resolve(dirname(compilerManifest), typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.tsc);
  const run = (entry, args) => spawnSync(process.execPath, [entry, ...args], { cwd: app, encoding: 'utf8', windowsHide: true, env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' }, timeout: 60000 });
  try {
    symlinkSync(resolve('node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    mkdirSync(join(app, 'app'));
    writeFileSync(join(app, 'package.json'), '{"private":true}');
    writeFileSync(join(app, 'next.config.js'), 'module.exports = { experimental: { useTypeScriptCli: true } };');
    writeFileSync(join(app, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', target: 'es2022' } }));
    writeFileSync(join(app, 'tsconfig.json'), JSON.stringify({ extends: './tsconfig.base.json', include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules'] }));
    writeFileSync(join(app, 'app', 'page.tsx'), 'export default 123;');
    const release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true });
    try {
      const generated = run(next, ['typegen']);
      assert.equal(generated.status, 0, generated.stdout + generated.stderr);
      const shown = run(compiler, ['--showConfig', '-p', 'tsconfig.json']);
      assert.equal(shown.status, 0, shown.stdout + shown.stderr);
      const overlay = createNextTypecheckOverlay({ appDir: app, project: join(app, 'tsconfig.json'), effective: JSON.parse(shown.stdout) });
      writeFileSync(join(app, '.next', 'tsconfig.check.json'), JSON.stringify(overlay));
      const files = run(compiler, ['-p', '.next/tsconfig.check.json', '--listFilesOnly']);
      assert.equal(files.status, 0, files.stdout + files.stderr);
      assertNextProductionMembership({ appDir: app, files: files.stdout.trim().split(/\r?\n/u) });
      const invalid = run(compiler, ['-p', '.next/tsconfig.check.json']);
      assert.notEqual(invalid.status, 0);
      assert.match(invalid.stdout, /TS2344/);
      writeFileSync(join(app, 'app', 'page.tsx'), 'export default function Page() { return null; }');
      const valid = run(compiler, ['-p', '.next/tsconfig.check.json']);
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);
    } finally { release(); }
  } finally { rmSync(app, { recursive: true, force: true }); }
});
