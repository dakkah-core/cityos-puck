import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validatePublicationInput(receipt, manifest) {
  if (
    receipt?.artifact?.path !== ".build/upstream/qualified/package.tgz" ||
    receipt.artifact.package !== manifest.name ||
    receipt.artifact.version !== manifest.version ||
    manifest.name !== "@cityos-core/puck" ||
    !/^\d+\.\d+\.\d+-cityos\.\d+$/u.test(manifest.version)
  ) {
    throw Error(
      "Qualified publication input does not match the owned package/version and fixed tarball path",
    );
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw Error("Usage: publication-input.mjs <qualified receipt>");
  const root = fileURLToPath(new URL("../../", import.meta.url));
  validatePublicationInput(
    JSON.parse(readFileSync(resolve(root, process.argv[2]), "utf8")),
    JSON.parse(
      readFileSync(resolve(root, "packages/core/package.json"), "utf8"),
    ),
  );
}
