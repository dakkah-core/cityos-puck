import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNextBuildContext } from './next-build-guard.mjs';
import { acquireNextOutputLocks } from './next-output-lock.mjs';

function binary(app, name) {
  const root = realpathSync(join(app, 'node_modules', name));
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[name];
  if (manifest.name !== name || typeof bin !== 'string') throw new Error(`Invalid ${name} binary`);
  return resolve(root, bin);
}

export function resolveDocsPostbuildEntries(app) {
  return {
    sitemap: binary(app, 'next-sitemap'),
    pagefind: binary(app, 'pagefind'),
  };
}

export function runPostbuildChild(entry, args, { app, env, spawnChild = spawn }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnChild(process.execPath, [entry, ...args], { cwd: app, env, stdio: 'inherit', windowsHide: true });
    let failure;
    const forward = signal => {
      try { if (child.exitCode === null && child.signalCode === null) child.kill(signal); }
      catch (error) { failure ??= error; }
    };
    const interrupt = () => forward('SIGINT');
    const terminate = () => forward('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { failure ??= error; });
    child.once('close', (code, signal) => {
      cleanup();
      if (failure) reject(failure);
      else resolvePromise(code ?? (signal === 'SIGINT' ? 130 : 143));
    });
  });
}

// Do not call a package script here: that would recurse through postbuild.
// Hold both Next locks until both readers and public-output writers finish.
export async function runDocsPostbuild({ context, sitemap, pagefind }) {
  const { app, nextManifest, config, env } = context;
  const release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir: config.distDir, lockingEnabled: config.experimental?.lockDistDir === true });
  try {
    const childContext = { app, env: { ...env, PUCK_DOCS_NEXT_DIST_DIR: config.distDir } };
    const status = await runPostbuildChild(sitemap, [], childContext);
    if (status !== 0) return status;
    return await runPostbuildChild(pagefind, ['--site', join(config.distDir, 'server', 'app'), '--output-path', 'public/_pagefind'], childContext);
  } finally { release(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const app = realpathSync(resolve(root, 'apps/docs'));
  if (realpathSync(process.cwd()) !== app) throw new Error('Docs postbuild must run from apps/docs');
  const context = await loadNextBuildContext({ appDir: app, catalogPath: join(root, 'config/toolchains/node-typescript.json') });
  process.exitCode = await runDocsPostbuild({ context, ...resolveDocsPostbuildEntries(app) });
}
