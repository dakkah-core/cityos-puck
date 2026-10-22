import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNodeVersion,
  loadToolchain,
  repositoryRoot,
} from "./toolchain.mjs";

export function cleanPackageDist(
  packageDirectory,
  repository = repositoryRoot,
) {
  const root = realpathSync(repository);
  const directory = realpathSync(packageDirectory);
  if (
    dirname(directory) !== join(root, "packages") ||
    lstatSync(packageDirectory).isSymbolicLink()
  ) {
    throw Error("Package cleanup requires an owned direct workspace package");
  }
  const manifest = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  );
  if (typeof manifest.name !== "string" || !manifest.name)
    throw Error("Package cleanup requires its source manifest");
  const target = resolve(directory, "dist");
  if (
    existsSync(target) &&
    (lstatSync(target).isSymbolicLink() || realpathSync(target) !== target)
  ) {
    throw Error("Refusing cleanup of a linked package output");
  }
  // Only this verified absolute child is removed; no shell expansion is used.
  rmSync(target, { recursive: true, force: true });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assertNodeVersion(loadToolchain());
  cleanPackageDist(process.cwd());
}
