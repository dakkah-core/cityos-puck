import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { test } from "node:test";
import { captureSourceIdentity } from "./integration.mjs";

test("tsup configuration intermediates cannot change the recorded source identity, while real edits do", () => {
  const root = mkdtempSync(join(tmpdir(), "cityos-puck-assembly-"));
  const git = (args) =>
    execFileSync("git", ["-C", root, ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git(["init", "--quiet"]);
    writeFileSync(
      join(root, ".gitignore"),
      readFileSync(new URL("../../.gitignore", import.meta.url)),
    );
    mkdirSync(join(root, "packages/core"), { recursive: true });
    writeFileSync(
      join(root, "packages/core/tsup.config.ts"),
      "export default {};\n",
    );
    git(["add", ".gitignore", "packages/core/tsup.config.ts"]);
    git([
      "-c",
      "user.name=CityOS fixture",
      "-c",
      "user.email=fixture@invalid.local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ]);
    const before = captureSourceIdentity(root);
    assert.equal(before.dirty, false);
    writeFileSync(
      join(root, "packages/core/tsup.config.bundled_fixture.mjs"),
      "generated build module\n",
    );
    assert.deepEqual(captureSourceIdentity(root), before);
    writeFileSync(
      join(root, "packages/core/tsup.config.ts"),
      "export default { changed: true };\n",
    );
    const after = captureSourceIdentity(root);
    assert.equal(after.dirty, true);
    assert.notEqual(after.sourceDigest, before.sourceDigest);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), "cityos-puck-assembly-")));
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
