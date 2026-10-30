import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNodeVersion, loadToolchain, repositoryRoot } from './toolchain.mjs';
import { runPackageBuild } from './build-package.mjs';

export function runCoreBuild({ cwd = process.cwd(), clean, run } = {}) {
  const core = realpathSync(join(repositoryRoot, 'packages/core'));
  if (realpathSync(cwd) !== core) throw Error('Core build must run from the owning package');
  return runPackageBuild({ cwd: core, entries: ['bundle/index.ts', 'bundle/rsc.tsx', 'bundle/no-external.ts', 'bundle/internal.ts', 'cityos.ts'], clean, run });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertNodeVersion(loadToolchain());
  process.exitCode = runCoreBuild();
}
