import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { repositoryRoot } from "../toolchains/toolchain.mjs";
import { qualifiedPackArguments } from "./qualification.mjs";

test("native qualification packing never executes prepare or rebuilds the package", () => {
  const root = mkdtempSync(join(tmpdir(), "puck-pack-without-rebuild-"));
  const archive = join(root, "candidate.tgz");
  const content = "export const alreadyBuilt = 42;\n";
  writeFileSync(join(root, "index.js"), content);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "qualification-pack-fixture",
      version: "1.0.0",
      files: ["index.js"],
      scripts: { prepare: "node -e \"throw new Error('Rebuild forbidden')\"" },
    }),
  );
  const result = spawnSync(
    process.execPath,
    [
      join(repositoryRoot, "scripts/toolchains/run-pinned-pnpm.mjs"),
      ...qualifiedPackArguments(root, archive),
    ],
    { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(existsSync(archive));
  assert.equal(readFileSync(join(root, "index.js"), "utf8"), content);
});
