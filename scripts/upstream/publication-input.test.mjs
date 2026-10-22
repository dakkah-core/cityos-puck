import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePublicationInput } from "./publication-input.mjs";

test("publication uses only the qualified archive for the current owned package version", () => {
  const manifest = { name: "@cityos-core/puck", version: "0.23.0-cityos.3" };
  const artifact = {
    path: ".build/upstream/qualified/package.tgz",
    package: manifest.name,
    version: manifest.version,
    sha256: "a".repeat(64),
  };
  const evidence = {
    host: {
      repository: "dakkah-core/dakkah-cityos-cms",
      sourceSha: "b".repeat(40),
      sourceTree: "c".repeat(40),
      artifactSha256: artifact.sha256,
      passed: 4,
      failed: 0,
      skipped: 0,
      inputs: [{ path: "pnpm-lock.yaml", sha256: "d".repeat(64) }],
    },
    checks: [
      { name: "cms-host", exitCode: 0, passed: 4, failed: 0, skipped: 0 },
    ],
  };
  assert.doesNotThrow(() =>
    validatePublicationInput({ artifact, ...evidence }, manifest),
  );
  for (const replacement of [
    { path: "packages/core" },
    { package: "@upstream/puck" },
    { version: "0.23.0-cityos.2" },
  ]) {
    assert.throws(
      () =>
        validatePublicationInput(
          { artifact: { ...artifact, ...replacement }, ...evidence },
          manifest,
        ),
      /does not match/,
    );
  }
  for (const host of [
    undefined,
    { ...evidence.host, sourceSha: "main" },
    { ...evidence.host, artifactSha256: "e".repeat(64) },
    { ...evidence.host, skipped: 1 },
    { ...evidence.host, inputs: [] },
    { ...evidence.host, passed: 0 },
  ])
    assert.throws(
      () => validatePublicationInput({ artifact, ...evidence, host }, manifest),
      /CMS host evidence/u,
    );
});
