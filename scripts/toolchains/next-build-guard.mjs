import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireNextOutputLocks, preflightNextNativeBinding } from './next-output-lock.mjs';

// Next's CLI silently ignores an extra positional argument on some versions.
// Keep the locked owner unambiguous and fail closed on unknown option forms.
export function assertBuildArguments(args) {
  const flags = new Set(['--analyze', '--experimental-analyze', '-d', '--debug', '--debug-prerender', '--no-mangling', '--profile', '--experimental-app-only', '--turbo', '--turbopack', '--webpack', '--experimental-debug-memory-usage', '--experimental-next-config-strip-types', '--experimental-cpu-prof', '-h', '--help']);
  const values = new Set(['--debug-build-paths', '--experimental-upload-trace']);
  const optional = new Set(['--experimental-build-mode', '--internal-trace']);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const equals = arg.indexOf('=');
    const name = equals < 0 ? arg : arg.slice(0, equals);
    if (flags.has(name) && equals < 0) continue;
    if (values.has(name) || optional.has(name)) {
      if (equals >= 0) { if (!arg.slice(equals + 1)) throw new Error(`Missing value for ${name}`); continue; }
      if (index + 1 < args.length && !args[index + 1].startsWith('-')) { index++; continue; }
      if (optional.has(name)) continue;
      throw new Error(`Missing value for ${name}`);
    }
    throw new Error(`Unsupported build argument or target directory: ${arg}`);
  }
}

// `entry` is explicit so this boundary can be exercised with a child fixture.
// The CLI below always resolves the app-owned Next executable.
export async function runGuardedBuildChild({ appDir, nextManifest, distDir, entry, args, env = process.env, stdio = 'inherit' }) {
  const release = await acquireNextOutputLocks({ appDir, nextManifest, distDir, lockingEnabled: true, production: false });
  try {
    return await new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, [entry, ...args], { cwd: appDir, env, stdio, windowsHide: true });
      const forward = signal => { if (child.exitCode === null && child.signalCode === null) child.kill(signal); };
      const interrupt = () => forward('SIGINT');
      const terminate = () => forward('SIGTERM');
      process.on('SIGINT', interrupt);
      process.on('SIGTERM', terminate);
      const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
      child.once('error', error => { cleanup(); reject(error); });
      child.once('close', (code, signal) => {
        cleanup();
        resolvePromise({ status: code ?? (signal === 'SIGINT' ? 130 : 143), signal });
      });
    });
  } finally { release(); }
}

export async function runNextBuild({ appDir, catalogPath, args = [] }) {
  assertBuildArguments(args);
  const app = realpathSync(resolve(appDir));
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  if (process.versions.node !== catalog.node) throw new Error(`Expected Node ${catalog.node}; received ${process.versions.node}`);
  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  if (!(manifest.dependencies?.next || manifest.devDependencies?.next)) throw new Error('Application has no direct Next dependency');
  const appRequire = createRequire(join(app, 'package.json'));
  const nextManifest = appRequire.resolve('next/package.json');
  preflightNextNativeBinding(nextManifest);
  const nextRequire = createRequire(nextManifest);
  // Next adjusts these before loading config; match the child process.
  const env = { ...process.env, NODE_ENV: args.includes('--debug-prerender') ? 'development' : 'production', NEXT_DISABLE_SWC_WASM: '1' };
  if (args.includes('--experimental-next-config-strip-types')) env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = 'true';
  const previous = { NODE_ENV: process.env.NODE_ENV, __NEXT_NODE_NATIVE_TS_LOADER_ENABLED: process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED };
  process.env.NODE_ENV = env.NODE_ENV;
  if (env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED) process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED;
  let config;
  try { config = await nextRequire('next/dist/server/config').default(nextRequire('next/constants').PHASE_PRODUCTION_BUILD, app); }
  finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (config.experimental?.lockDistDir !== true || config.experimental?.useWasmBinary) throw new Error('Next native output locking must be enabled');
  const entry = appRequire.resolve('next/dist/bin/next');
  // The argument preflight rejects a second positional target.
  return runGuardedBuildChild({ appDir: app, nextManifest, distDir: config.distDir, entry, args: ['build', app, ...args], env });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (!['--workspace', '--standalone'].includes(mode)) throw new Error('Usage: next-build-guard.mjs --workspace|--standalone [Next build options]');
  const here = dirname(fileURLToPath(import.meta.url));
  const app = realpathSync(process.cwd());
  const root = mode === '--workspace' ? resolve(here, '../..') : app;
  if (mode === '--workspace') {
    const ref = relative(root, app);
    if (!ref || isAbsolute(ref) || ref === '..' || ref.startsWith(`..${sep}`)) throw new Error('Expected a registered Puck workspace');
    const rootRequire = createRequire(join(root, 'package.json'));
    const workspace = rootRequire('yaml').parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'));
    const glob = rootRequire('glob');
    if (!Array.isArray(workspace.packages) || workspace.packages.some(pattern => typeof pattern !== 'string' || pattern.startsWith('!')) || !workspace.packages.some(pattern => glob.sync(`${pattern}/package.json`, { cwd: root, nodir: true }).some(path => resolve(root, path).toLowerCase() === join(app, 'package.json').toLowerCase()))) throw new Error('Expected a registered Puck workspace');
  }
  const result = await runNextBuild({ appDir: app, catalogPath: mode === '--workspace' ? join(root, 'config/toolchains/node-typescript.json') : join(here, 'node-typescript.json'), args: process.argv.slice(3) });
  process.exitCode = result.status;
}
