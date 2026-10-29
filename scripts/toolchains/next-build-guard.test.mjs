import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertBuildArguments, runGuardedBuildChild } from './next-build-guard.mjs';
import { acquireNextOutputLocks } from './next-output-lock.mjs';
import { copyNextToolchain } from '../../packages/create-puck-app/scripts/copy-next-toolchain.mjs';

test('guard holds dev lock while child owns production lock, forwards args and releases on success and failure', async () => {
  const app = mkdtempSync(join(tmpdir(), 'puck-build-guard-'));
  const require = createRequire(import.meta.url);
  const nextManifest = require.resolve('next/package.json');
  const childFile = join(app, 'child.cjs');
  const ready = join(app, 'ready.json');
  const stop = join(app, 'stop');
  writeFileSync(childFile, `const {createRequire}=require('node:module'); const fs=require('node:fs'); const path=require('node:path'); const r=createRequire(process.argv[2]); const b=r(process.platform==='win32'?'@next/swc-win32-x64-msvc':'@next/swc-linux-x64-gnu'); const lock=b.lockfileTryAcquireSync(path.join(process.cwd(),'.next','lock')); if(lock==null)process.exit(20); fs.writeFileSync(process.argv[3],JSON.stringify(process.argv.slice(5))); const timer=setInterval(()=>{if(fs.existsSync(process.argv[4])){clearInterval(timer);b.lockfileUnlockSync(lock);process.exit(7)}},30);`);
  try {
    const pending = runGuardedBuildChild({ appDir: app, nextManifest, distDir: '.next', entry: childFile, args: [nextManifest, ready, stop, '--webpack', '--experimental-build-mode', 'compile', 'a b'], stdio: 'ignore' });
    const deadline = Date.now() + 15000;
    while (!existsSync(ready) && Date.now() < deadline) await new Promise(resolvePromise => setTimeout(resolvePromise, 30));
    assert(existsSync(ready), 'child did not acquire production lock');
    assert.deepEqual(JSON.parse(readFileSync(ready, 'utf8')), ['--webpack', '--experimental-build-mode', 'compile', 'a b']);
    await assert.rejects(acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true, production: false }), /busy/i);
    const native = require(process.platform === 'win32' ? '@next/swc-win32-x64-msvc' : '@next/swc-linux-x64-gnu');
    assert.equal(native.lockfileTryAcquireSync(join(app, '.next/lock')), null);
    writeFileSync(stop, 'stop');
    assert.equal((await pending).status, 7);
    const release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true });
    release();
    const missing = await runGuardedBuildChild({ appDir: app, nextManifest, distDir: '.next', entry: join(app, 'absent.cjs'), args: [], stdio: 'ignore' });
    assert.notEqual(missing.status, 0);
    const afterFailure = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: '.next', lockingEnabled: true });
    afterFailure();
  } finally { if (!existsSync(stop)) writeFileSync(stop, 'stop'); rmSync(app, { recursive: true, force: true }); }
});

test('missing native binding fails before Next config executes for build and typegen', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-build-no-native-'));
  const app = join(root, 'next');
  try {
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: root });
    mkdirSync(join(app, 'node_modules/next/dist/server'), { recursive: true });
    writeFileSync(join(app, 'node_modules/next/package.json'), '{"name":"next","version":"16.4.2"}');
    const marker = join(app, 'config-ran');
    writeFileSync(join(app, 'node_modules/next/dist/server/config.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); throw Error('config executed');`);
    writeFileSync(join(app, 'package.json'), '{"dependencies":{"next":"fixture"}}');
    writeFileSync(join(app, 'package-lock.json'), '{}');
    for (const entry of ['next-generated-types.mjs', 'next-build-guard.mjs']) {
      const result = spawnSync(process.execPath, [join(app, '.cityos/next-typecheck', entry), '--standalone'], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 30000 });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /@next\/swc-/);
      assert.equal(existsSync(marker), false);
      assert.equal(existsSync(join(app, '.next')), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('real Next CLI receives build flags and refuses an extra target directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-build-cli-'));
  const app = join(root, 'next');
  try {
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: root });
    symlinkSync(resolve('node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(join(app, 'package.json'), '{"dependencies":{"next":"fixture"}}');
    writeFileSync(join(app, 'next.config.js'), 'module.exports = { experimental: { useTypeScriptCli: true } };');
    const entry = join(app, '.cityos/next-typecheck/next-build-guard.mjs');
    const help = spawnSync(process.execPath, [entry, '--standalone', '--webpack', '--help'], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(help.status, 0, help.stdout + help.stderr);
    assert.match(help.stdout, /--webpack/);
    const extra = spawnSync(process.execPath, [entry, '--standalone', join(root, 'other')], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.notEqual(extra.status, 0);
    assert.match(extra.stderr, /Unsupported build argument or target directory/i);
    assert.equal(existsSync(join(root, 'other')), false);
    const release = await acquireNextOutputLocks({ appDir: app, nextManifest: createRequire(import.meta.url).resolve('next/package.json'), distDir: '.next', lockingEnabled: true, production: false });
    try {
      const busy = spawnSync(process.execPath, [entry, '--standalone', '--help'], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 30000 });
      assert.notEqual(busy.status, 0);
      assert.match(busy.stderr, /busy/i);
      assert.doesNotMatch(busy.stdout, /Usage: next build/);
    } finally { release(); }
    assert.doesNotThrow(() => assertBuildArguments(['--webpack', '--experimental-build-mode', 'compile', '--debug-build-paths=app/*', '--internal-trace', 'overview']));
    assert.throws(() => assertBuildArguments(['--unknown', 'other']), /Unsupported build argument/);
    assert.throws(() => assertBuildArguments(['--debug-build-paths']), /Missing value/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('real Next compile build runs through the standalone guard in a disposable app', { timeout: 120000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-build-real-'));
  const app = join(root, 'next');
  try {
    copyNextToolchain({ repositoryRoot: resolve('.'), templatePath: root });
    symlinkSync(resolve('node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    mkdirSync(join(app, 'app'));
    writeFileSync(join(app, 'package.json'), '{"private":true,"dependencies":{"next":"fixture","react":"fixture","react-dom":"fixture"}}');
    writeFileSync(join(app, 'next.config.js'), 'module.exports = { experimental: { useTypeScriptCli: true, cpus: 1 } };');
    writeFileSync(join(app, 'app/layout.js'), 'export default function Layout({children}) { return <html><body>{children}</body></html> }');
    writeFileSync(join(app, 'app/page.js'), 'export default function Page() { return <p>Build fixture</p> }');
    const entry = join(app, '.cityos/next-typecheck/next-build-guard.mjs');
    const build = spawnSync(process.execPath, [entry, '--standalone', '--webpack', '--experimental-build-mode', 'compile'], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 100000, env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' } });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    assert.match(build.stdout, /compiled successfully/i);
    assert(existsSync(join(app, '.next/server/app/page.js')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
