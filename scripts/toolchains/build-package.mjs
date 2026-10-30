import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPackageDist } from './clean-package-dist.mjs';
import { assertNodeVersion, loadToolchain, repositoryRoot } from './toolchain.mjs';

export function runPackageBuild({ cwd = process.cwd(), entries, clean = cleanPackageDist, run = spawnSync } = {}) {
  const packages = realpathSync(join(repositoryRoot, 'packages'));
  const owner = realpathSync(cwd);
  if (dirname(owner) !== packages) throw Error('Build must run from an owned package');
  if (!Array.isArray(entries) || !entries.length || entries.some(entry => typeof entry !== 'string' || !/^[a-zA-Z0-9_./-]+\.tsx?$/u.test(entry) || entry.split('/').some(part => !part || part === '.' || part === '..'))) throw Error('Invalid package build entry');
  for (const entry of entries) {
    const file = realpathSync(resolve(owner, entry));
    const ref = relative(owner, file);
    if (!ref || isAbsolute(ref) || ref === '..' || ref.startsWith(`..${sep}`)) throw Error('Package build entry leaves its owner');
  }
  const manifestPath = createRequire(join(owner, 'package.json')).resolve('tsup/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.bin?.tsup !== 'string') throw Error('Installed tsup executable is unavailable');
  const cli = resolve(dirname(manifestPath), manifest.bin.tsup);
  clean(owner);
  const result = run(process.execPath, [cli, ...entries], { cwd: owner, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertNodeVersion(loadToolchain());
  process.exitCode = runPackageBuild({ entries: process.argv.slice(2) });
}
