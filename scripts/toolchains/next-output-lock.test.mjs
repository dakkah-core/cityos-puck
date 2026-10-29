import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acquireNextOutputLocks } from './next-output-lock.mjs';

test('Next native locks block another process and release on completion', async t => {
  if (process.platform !== 'win32' || process.arch !== 'x64') return t.skip('Windows x64 native qualification is the fixture platform');
  const app = mkdtempSync(join(tmpdir(), 'cityos-next-lock-test-'));
  const nextManifest = resolve('node_modules/next/package.json');
  const moduleUrl = pathToFileURL(fileURLToPath(new URL('./next-output-lock.mjs', import.meta.url))).href;
  const runChild = () => spawnSync(process.execPath, ['--input-type=module', '--eval', `import {acquireNextOutputLocks} from ${JSON.stringify(moduleUrl)}; try { const release = await acquireNextOutputLocks({appDir:process.argv[1], nextManifest:process.argv[2], distDir:'.next', lockingEnabled:true}); release(); } catch(e) { console.error(e.message); process.exitCode=3; }`, app, nextManifest], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const runFrameworkChild = () => spawnSync(process.execPath, ['--eval', `const r=require('node:module').createRequire(process.argv[2]);const b=r('@next/swc-win32-x64-msvc');const p=require('node:path').join(process.argv[1],'.next','dev','lock');const l=b.lockfileTryAcquireSync(p);if(l==null)process.exit(3);b.lockfileUnlockSync(l);`, app, nextManifest], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  try {
    const release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true });
    const busy = runChild();
    assert.equal(busy.status, 3);
    assert.match(busy.stderr, /busy/i);
    assert.equal(runFrameworkChild().status, 3);
    release();
    assert.equal(runChild().status, 0);
    await assert.rejects(acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '../escape', lockingEnabled: true }), /path|escape/i);
    await assert.rejects(acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: false }), /locking/i);
  } finally { rmSync(app, { recursive: true, force: true }); }
});
