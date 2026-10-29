import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyNextToolchain } from '../../packages/create-puck-app/scripts/copy-next-toolchain.mjs';

test('standalone Next checking rejects effective configuration drift in the typegen child', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-next-effective-config-'));
  const app = join(root, 'next');
  const write = (name, value) => {
    const path = join(app, name);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, value);
  };
  const run = (extraEnv = {}) => spawnSync(process.execPath, [join(app, '.cityos/next-typecheck/next-generated-types.mjs'), '--standalone'], {
    cwd: app, encoding: 'utf8', windowsHide: true, timeout: 90000,
    env: { ...process.env, NODE_ENV: 'production', CI: '1', NEXT_TELEMETRY_DISABLED: '1', ...extraEnv },
  });
  const profile = '{ stale: 30, revalidate: 60, expire: 120 }';
  const config = (parent, child) => `
const child = process.argv.includes('typegen');
module.exports = {
  ...(child ? (${child}) : (${parent})),
  experimental: { useTypeScriptCli: true },
  typescript: { tsconfigPath: 'tsconfig.build.json' }
};\n`;
  try {
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: root });
    symlinkSync(resolve('node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    write('package.json', JSON.stringify({ private: true, dependencies: { next: 'fixture' } }));
    write('package-lock.json', '{}');
    write('tsconfig.base.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', target: 'es2022' } }));
    write('tsconfig.json', JSON.stringify({ extends: './tsconfig.base.json', include: ['next-env.d.ts', 'app/**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'], exclude: ['node_modules'] }));
    write('tsconfig.build.json', JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', '.next/dev/types'] }));
    write('app/page.tsx', 'export default function Page() { return null; }');

    // Establish genuine production output first: stale output must not make a
    // later child using a different effective configuration acceptable.
    const stable = `{ distDir: '.next', cacheLife: { editorial: ${profile} } }`;
    const reordered = "{ cacheLife: { editorial: { expire: 120, revalidate: 60, stale: 30 } }, distDir: '.next' }";
    write('next.config.js', config(stable, reordered));
    const valid = run();
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);

    for (const [label, child] of [
      ['cache profile name', `{ distDir: '.next', cacheLife: { urgent: ${profile} } }`],
      ['cache profile value', "{ distDir: '.next', cacheLife: { editorial: { stale: 31, revalidate: 60, expire: 120 } } }"],
      ['output directory', `{ distDir: '.next-alternate', cacheLife: { editorial: ${profile} } }`],
    ]) {
      // Config source stays unchanged between preflight and typegen; only
      // the effective values differ. A missing-output error is not proof of
      // the required configuration comparison.
      write('next.config.js', config(stable, child));
      const drift = run();
      assert.notEqual(drift.status, 0, `${label}: ${drift.stdout}${drift.stderr}`);
      assert.match(drift.stdout + drift.stderr, /effective.*config|config.*(?:differ|changed|mismatch)/i, label);
      if (label === 'output directory') assert.equal(existsSync(join(app, '.next-alternate')), false);
    }

    // Next's route manifest actually invokes both functions and uses their
    // source paths. Source-identical config can return different values in
    // the typegen child, which must fail before those values are accepted.
    const routeConfig = (redirects, rewrites, prefix = '') => `${prefix}
module.exports = {
  experimental: { useTypeScriptCli: true },
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  redirects: ${redirects},
  rewrites: ${rewrites}
};\n`;
    const redirects = "async () => [{ source: '/redirect-fixture', destination: '/', permanent: false }]";
    const rewrites = "async () => ({ beforeFiles: [{ source: '/rewrite-fixture', destination: '/' }], afterFiles: [], fallback: [] })";
    write('next.config.js', routeConfig(redirects, rewrites));
    const routesValid = run();
    assert.equal(routesValid.status, 0, routesValid.stdout + routesValid.stderr);
    const types = readFileSync(join(app, '.next/types/routes.d.ts'), 'utf8');
    assert.match(types, /redirect-fixture/);
    assert.match(types, /rewrite-fixture/);

    for (const [kind, changedRedirects, changedRewrites] of [
      ['redirects', "async () => [{ source: process.argv.includes('typegen') ? '/different-redirect' : '/redirect-fixture', destination: '/', permanent: false }]", rewrites],
      ['rewrites', redirects, "async () => ({ beforeFiles: [{ source: process.argv.includes('typegen') ? '/different-rewrite' : '/rewrite-fixture', destination: '/' }], afterFiles: [], fallback: [] })"],
    ]) {
      write('next.config.js', routeConfig(changedRedirects, changedRewrites));
      const drift = run();
      assert.notEqual(drift.status, 0, drift.stdout + drift.stderr);
      assert.match(drift.stdout + drift.stderr, new RegExp(`effective next ${kind} routes differ`, 'i'));
    }

    // The config captures external state at module load, so calling its old
    // closures a second time cannot observe a later change. The preload runs
    // in the actual diagnostic tsc child, after generation and membership.
    const stateFile = join(root, 'external-state.json');
    const marker = join(root, 'diagnostic-started');
    const preload = join(root, 'change-during-tsc.cjs');
    writeFileSync(preload, `
const fs = require('node:fs');
const listOnly = process.argv.indexOf('--listFilesOnly');
if (process.argv.includes('--noEmit') && (listOnly < 0 || process.argv[listOnly + 1] === 'false')) {
  fs.writeFileSync(process.env.PUCK_TEST_STATE, process.env.PUCK_TEST_NEXT_STATE);
  fs.writeFileSync(process.env.PUCK_TEST_MARKER, 'diagnostic compiler child');
}
`);
    write('next.config.js', `
const state = JSON.parse(require('node:fs').readFileSync(process.env.PUCK_TEST_STATE, 'utf8'));
module.exports = {
  distDir: state.distDir,
  cacheLife: { editorial: { stale: state.stale, revalidate: 60, expire: 120 } },
  experimental: { useTypeScriptCli: true },
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  redirects: async () => [{ source: state.redirect, destination: '/', permanent: false }],
  rewrites: async () => ({ beforeFiles: [{ source: state.rewrite, destination: '/' }], afterFiles: [], fallback: [] })
};
`);
    const initial = { distDir: '.next', stale: 30, redirect: '/redirect-fixture', rewrite: '/rewrite-fixture' };
    for (const [label, changed, expected] of [
      ['output directory', { distDir: '.next-post-check' }, /effective next configuration changed during checking/i],
      ['cache profile', { stale: 31 }, /effective next configuration changed during checking/i],
      ['redirect', { redirect: '/changed-redirect' }, /effective next redirects routes changed during checking/i],
      ['rewrite', { rewrite: '/changed-rewrite' }, /effective next rewrites routes changed during checking/i],
    ]) {
      writeFileSync(stateFile, JSON.stringify(initial));
      rmSync(marker, { force: true });
      const drift = run({
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${JSON.stringify(preload)}`.trim(),
        PUCK_TEST_STATE: stateFile,
        PUCK_TEST_NEXT_STATE: JSON.stringify({ ...initial, ...changed }),
        PUCK_TEST_MARKER: marker,
      });
      assert.equal(existsSync(marker), true, `${label}: diagnostic child did not run: ${drift.stdout}${drift.stderr}`);
      assert.notEqual(drift.status, 0, `${label}: ${drift.stdout}${drift.stderr}`);
      assert.match(drift.stdout + drift.stderr, expected, label);
    }
    assert.equal(existsSync(join(app, '.next-post-check')), false);

    write('next.config.js', routeConfig('async () => ({ invalid: true })', rewrites));
    const invalid = run();
    assert.notEqual(invalid.status, 0, invalid.stdout + invalid.stderr);
    assert.match(invalid.stdout + invalid.stderr, /invalid next redirects result/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
