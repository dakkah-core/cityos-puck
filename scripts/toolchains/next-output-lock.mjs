import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

function inside(root, candidate) {
  const ref = relative(root, candidate);
  if (!ref || isAbsolute(ref) || ref === '..' || ref.startsWith(`..${sep}`)) throw new Error('Next output lock path escapes app');
}

function prepareDirectory(app, ref) {
  if (typeof ref !== 'string' || !ref || isAbsolute(ref) || ref.includes('\\') || ref.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid Next output lock path');
  let current = app;
  for (const part of ref.split('/')) {
    current = join(current, part);
    inside(app, current);
    if (!existsSync(current)) mkdirSync(current);
    if (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory() || realpathSync(current) !== current) throw new Error('Next output lock directory is redirected');
  }
  return current;
}

export function preflightNextNativeBinding(nextManifest) {
  for (const name of ['NEXT_TEST_WASM', 'NEXT_TEST_NATIVE_DIR', 'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL', '__INTERNAL_CUSTOM_TURBOPACK_BINDINGS']) if (process.env[name]) throw new Error(`Unsupported Next native binding override: ${name}`);
  const manifest = JSON.parse(readFileSync(nextManifest, 'utf8'));
  const native = process.platform === 'win32' && process.arch === 'x64' ? '@next/swc-win32-x64-msvc'
    : process.platform === 'linux' && process.arch === 'x64' && process.report.getReport().header.glibcVersionRuntime ? '@next/swc-linux-x64-gnu' : null;
  if (!native) throw new Error('Next native output locks are unsupported on this platform');
  const requireNext = createRequire(resolve(nextManifest));
  // Next tries a locally built binary before its published platform package.
  const triple = process.platform === 'win32' ? 'win32-x64-msvc' : 'linux-x64-gnu';
  try {
    requireNext.resolve(`@next/swc/native/next-swc.${triple}.node`);
    throw new Error('Unsupported local Next SWC binary takes precedence over the verified package');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
  }
  const nativeManifest = JSON.parse(readFileSync(requireNext.resolve(`${native}/package.json`), 'utf8'));
  if (nativeManifest.version !== manifest.version) throw new Error('Next native lock version mismatch');
  const bindings = requireNext(native);
  if (typeof bindings.lockfileTryAcquireSync !== 'function' || typeof bindings.lockfileUnlockSync !== 'function') throw new Error('Next native lock API is unavailable');
  return bindings;
}

export async function acquireNextOutputLocks({ appDir, nextManifest, distDir, lockingEnabled, production = true }) {
  if (lockingEnabled !== true) throw new Error('Next output locking is not enabled');
  const bindings = preflightNextNativeBinding(nextManifest);
  const app = realpathSync(resolve(appDir));
  const prod = prepareDirectory(app, distDir);
  const dev = prepareDirectory(app, `${distDir}/dev`);
  const owned = [];
  try {
    // Dev first; a build child acquires its own production lock when requested.
    for (const directory of production ? [dev, prod] : [dev]) {
      const path = join(directory, 'lock');
      if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Next output lock path is redirected');
      const lock = bindings.lockfileTryAcquireSync(path);
      if (lock == null) throw new Error(`Next app is busy: ${path}`);
      owned.push(lock);
    }
  } catch (error) {
    for (const lock of owned.reverse()) bindings.lockfileUnlockSync(lock);
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const lock of owned.reverse()) bindings.lockfileUnlockSync(lock);
  };
}
