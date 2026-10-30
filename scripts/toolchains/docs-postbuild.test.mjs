import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { acquireNextOutputLocks } from './next-output-lock.mjs';
import { resolveDocsPostbuildEntries, runDocsPostbuild, runPostbuildChild } from './docs-postbuild.mjs';

const require = createRequire(import.meta.url);
const nextManifest = require.resolve('next/package.json');
const native = createRequire(nextManifest)(process.platform === 'win32' ? '@next/swc-win32-x64-msvc' : '@next/swc-linux-x64-gnu');
const pause = () => new Promise(done => setTimeout(done, 25));

test('a child error does not release the caller before the child closes', async () => {
  const child = new EventEmitter();
  child.exitCode = null; child.signalCode = null;
  let settled = false;
  const pending = runPostbuildChild('fixture', [], { app: '.', env: {}, spawnChild: () => child })
    .finally(() => { settled = true; });
  child.emit('error', new Error('signal failed'));
  await Promise.resolve();
  assert.equal(settled, false);
  child.emit('close', null, 'SIGTERM');
  await assert.rejects(pending, /signal failed/u);
});

test('an interrupt remains a failure when a child exits successfully', async () => {
  for (const [signal, expected] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const child = new EventEmitter();
    child.exitCode = null; child.signalCode = null;
    let forwarded;
    child.kill = value => { forwarded = value; return true; };
    let settled = false;
    const pending = runPostbuildChild('fixture', [], { app: '.', env: {}, spawnChild: () => child })
      .finally(() => { settled = true; });
    process.emit(signal);
    assert.equal(forwarded, signal);
    await Promise.resolve();
    assert.equal(settled, false);
    child.emit('close', 0, null);
    assert.equal(await pending, expected);
  }
});

test('interrupted sitemap holds locks until close and never starts pagefind', async () => {
  const app = mkdtempSync(join(tmpdir(), 'puck-docs-postbuild-interrupt-'));
  const context = { app, nextManifest, config: { distDir: '.next', experimental: { lockDistDir: true } }, env: process.env };
  const child = new EventEmitter();
  child.exitCode = null; child.signalCode = null;
  child.kill = () => true;
  const started = [];
  let onStart;
  const ready = new Promise(resolvePromise => { onStart = resolvePromise; });
  const spawnChild = (_node, args) => { started.push(args[0]); onStart(); return child; };
  let pending;
  try {
    pending = runDocsPostbuild({ context, sitemap: 'sitemap', pagefind: 'pagefind', spawnChild });
    await ready;
    process.emit('SIGTERM');
    await assert.rejects(acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true, production: false }), /busy/i);
    assert.equal(native.lockfileTryAcquireSync(join(app, '.next', 'lock')), null);
    child.emit('close', 0, null);
    assert.equal(await pending, 143);
    assert.deepEqual(started, ['sitemap']);
    const release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true });
    release();
  } finally {
    child.emit('close', 0, null);
    if (pending) await pending.catch(() => {});
    rmSync(app, { recursive: true, force: true });
  }
});
async function waitFor(path) {
  const deadline = Date.now() + 15000;
  while (!existsSync(path) && Date.now() < deadline) await pause();
  assert(existsSync(path), `child did not create ${path}`);
}

test('both postbuild children run under the native locks with the effective output directory', { timeout: 30000 }, async () => {
  const app = mkdtempSync(join(tmpdir(), 'puck-docs-postbuild-'));
  const context = { app, nextManifest, config: { distDir: 'custom-output', experimental: { lockDistDir: true } }, env: process.env };
  const sitemap = join(app, 'sitemap.cjs');
  const pagefind = join(app, 'pagefind.cjs');
  const child = name => `const fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(join(app, name + '-ready'))}, JSON.stringify({ args: process.argv.slice(2), distDir: process.env.PUCK_DOCS_NEXT_DIST_DIR }));\nconst timer = setInterval(() => { if (fs.existsSync(${JSON.stringify(join(app, name + '-stop'))})) { clearInterval(timer); } }, 25);\n`;
  writeFileSync(sitemap, child('sitemap'));
  writeFileSync(pagefind, child('pagefind'));
  let pending;
  try {
    pending = runDocsPostbuild({ context, sitemap, pagefind });
    for (const name of ['sitemap', 'pagefind']) {
      await waitFor(join(app, name + '-ready'));
      await assert.rejects(acquireNextOutputLocks({ appDir: app, nextManifest, distDir: 'custom-output', lockingEnabled: true, production: false }), /busy/i);
      assert.equal(native.lockfileTryAcquireSync(join(app, 'custom-output', 'lock')), null);
      const observed = JSON.parse(readFileSync(join(app, name + '-ready'), 'utf8'));
      assert.equal(observed.distDir, 'custom-output');
      assert.deepEqual(observed.args, name === 'sitemap' ? [] : ['--site', join('custom-output', 'server', 'app'), '--output-path', 'public/_pagefind']);
      writeFileSync(join(app, name + '-stop'), 'stop');
    }
    assert.equal(await pending, 0);
    const release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: 'custom-output', lockingEnabled: true });
    release();
  } finally {
    writeFileSync(join(app, 'sitemap-stop'), 'stop');
    writeFileSync(join(app, 'pagefind-stop'), 'stop');
    if (pending) await pending.catch(() => {});
    rmSync(app, { recursive: true, force: true });
  }
});

test('busy and failed postbuild do not run later children and release locks', async () => {
  const app = mkdtempSync(join(tmpdir(), 'puck-docs-postbuild-failure-'));
  const context = { app, nextManifest, config: { distDir: '.next', experimental: { lockDistDir: true } }, env: process.env };
  const sitemap = join(app, 'sitemap.cjs'), pagefind = join(app, 'pagefind.cjs'), marker = join(app, 'pagefind-ran');
  writeFileSync(sitemap, 'process.exit(9);');
  writeFileSync(pagefind, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.exit(7);`);
  try {
    const release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true });
    try { await assert.rejects(runDocsPostbuild({ context, sitemap, pagefind }), /busy/i); }
    finally { release(); }
    assert.equal(await runDocsPostbuild({ context, sitemap, pagefind }), 9);
    assert.equal(existsSync(marker), false);
    writeFileSync(sitemap, 'process.exit(0);');
    assert.equal(await runDocsPostbuild({ context, sitemap, pagefind }), 7);
    assert.equal(existsSync(marker), true);
    const after = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true });
    after();
  } finally { rmSync(app, { recursive: true, force: true }); }
});

test('docs lifecycle delegates directly and sitemap reads the guarded output directory', () => {
  const app = resolve('apps/docs');
  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts.postbuild, 'node ../../scripts/toolchains/docs-postbuild.mjs');
  const entries = resolveDocsPostbuildEntries(app);
  assert(existsSync(entries.sitemap));
  assert(existsSync(entries.pagefind));
  const path = require.resolve('../../apps/docs/next-sitemap.config.js');
  const previous = process.env.PUCK_DOCS_NEXT_DIST_DIR;
  try {
    process.env.PUCK_DOCS_NEXT_DIST_DIR = 'custom-output';
    delete require.cache[path];
    assert.equal(require(path).sourceDir, 'custom-output');
  } finally {
    if (previous === undefined) delete process.env.PUCK_DOCS_NEXT_DIST_DIR; else process.env.PUCK_DOCS_NEXT_DIST_DIR = previous;
    delete require.cache[path];
  }
});
