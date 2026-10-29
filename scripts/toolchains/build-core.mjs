import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPackageDist } from './clean-package-dist.mjs';
import { assertNodeVersion, loadToolchain, repositoryRoot } from './toolchain.mjs';

export function runCoreBuild({ cwd = process.cwd(), clean = cleanPackageDist, run = spawnSync } = {}) {
  const core = realpathSync(join(repositoryRoot, 'packages/core'));
  if (realpathSync(cwd) !== core) throw Error('Core build must run from the owning package');
  const appRequire = createRequire(join(core, 'package.json'));
  const manifestPath = appRequire.resolve('tsup/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.bin?.tsup !== 'string') throw Error('Installed tsup executable is unavailable');
  const cli = resolve(dirname(manifestPath), manifest.bin.tsup);
  clean(core);
  const result = run(process.execPath, [cli, 'bundle/index.ts', 'bundle/rsc.tsx', 'bundle/no-external.ts', 'bundle/internal.ts', 'cityos.ts'], { cwd: core, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertNodeVersion(loadToolchain());
  process.exitCode = runCoreBuild();
}
