'use strict';

// Filesystem observation only. The caller obtains membership from the actual
// compiler and submits the resulting digest to the shared evidence policy.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const digest = value => createHash('sha256').update(value).digest('hex');
const identity = value => {
  const normalized = path.resolve(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

// Ancestor metadata may change module resolution without appearing in tsc's
// source listing. Observe presence as well as bytes by rebuilding this list
// for each fence. This is bounded evidence, not a complete lookup trace.
function collectCompilerResolutionMetadata(projectRoot, files) {
  const visited = new Set(), metadata = new Set();
  for (const file of files) {
    const logical = path.resolve(projectRoot, file);
    for (const start of [logical, fs.realpathSync(logical)]) {
      let directory = path.dirname(start);
      while (!visited.has(identity(directory))) {
        visited.add(identity(directory));
        for (const name of ['package.json', 'tsconfig.json']) {
          const candidate = path.join(directory, name);
          try {
            if (fs.statSync(candidate).isFile()) metadata.add(candidate);
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
    }
  }
  return [...metadata].sort();
}

function sameStat(first, second) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => first[key] === second[key]);
}

/** Capture exact compiler-reported membership and file bytes, including files
 * outside the app. Paths and physical targets both participate in identity.
 * This brackets reads, but cannot detect a change restored between observations.
 */
function captureCompilerInputs(projectRoot, files) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) throw new Error('Compiler input project root must be absolute');
  if (!Array.isArray(files) || files.length === 0) throw new Error('Compiler input membership must be nonempty');
  const seen = new Set();
  const entries = files.map(file => {
    if (typeof file !== 'string' || !file || file.includes('\0')) throw new Error('Invalid compiler input path');
    const logical = path.resolve(projectRoot, file);
    const key = identity(logical);
    if (seen.has(key)) throw new Error(`Duplicate compiler input path: ${logical}`);
    seen.add(key);
    const physical = fs.realpathSync(logical);
    const before = fs.statSync(physical, { bigint: true });
    if (!before.isFile()) throw new Error(`Compiler input is not a regular file: ${logical}`);
    const bytes = fs.readFileSync(physical);
    const after = fs.statSync(physical, { bigint: true });
    if (!sameStat(before, after) || identity(fs.realpathSync(logical)) !== identity(physical)) throw new Error(`Compiler input changed during observation: ${logical}`);
    return { path: key, physicalPath: identity(physical), sha256: digest(bytes) };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { schemaVersion: 'cityos.expo-compiler-inputs.v1', entries, sha256: digest(JSON.stringify(entries)) };
}

module.exports = { captureCompilerInputs, collectCompilerResolutionMetadata };
