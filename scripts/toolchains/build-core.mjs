import { copyFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNodeVersion,
  loadToolchain,
  repositoryRoot,
} from "./toolchain.mjs";
import { runPackageBuild } from "./build-package.mjs";

export function runCoreBuild({
  cwd = process.cwd(),
  clean,
  run = spawnSync,
} = {}) {
  const core = realpathSync(join(repositoryRoot, "packages/core"));
  if (realpathSync(cwd) !== core)
    throw Error("Core build must run from the owning package");
  return runPackageBuild({
    cwd: core,
    entries: [
      "bundle/index.ts",
      "bundle/rsc.tsx",
      "bundle/no-external.ts",
      "bundle/internal.ts",
      "cityos.ts",
    ],
    clean,
    run: (executable, args, options) => {
      for (const file of ["README.md", "CHANGELOG.md"])
        copyFileSync(join(repositoryRoot, file), join(core, file));
      return run(executable, args, options);
    },
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assertNodeVersion(loadToolchain());
  process.exitCode = runCoreBuild();
}
