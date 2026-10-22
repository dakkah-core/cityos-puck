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
  const host = receipt.host;
  const check = receipt.checks?.find((entry) => entry.name === "cms-host");
  if (
    !host ||
    host.repository !== "dakkah-core/dakkah-cityos-cms" ||
    !/^[a-f0-9]{40}$/u.test(host.sourceSha ?? "") ||
    !/^[a-f0-9]{40}$/u.test(host.sourceTree ?? "") ||
    host.artifactSha256 !== receipt.artifact.sha256 ||
    !Number.isSafeInteger(host.passed) ||
    host.passed < 1 ||
    host.failed !== 0 ||
    host.skipped !== 0 ||
    !check ||
    check.exitCode !== 0 ||
    check.passed !== host.passed ||
    check.failed !== 0 ||
    check.skipped !== 0 ||
    !Array.isArray(host.inputs) ||
    !host.inputs.some((entry) => entry.path === "pnpm-lock.yaml") ||
    host.inputs.some((entry) => !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? ""))
  )
    throw Error(
      "Publication requires successful CMS host evidence bound to the exact candidate and pinned consumer source",
    );
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
