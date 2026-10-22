import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNodeVersion, repositoryRoot } from "./toolchain.mjs";

const baselineSha256 =
  "866ab731a6d8cbd21a42480788ec04b994d33eef3173217b755e9ba45d8bb911";
const before = "} = LayoutPropsSchema.safeParse(themeConfig);";
const after = "} = LayoutPropsSchema.safeParse({ ...themeConfig, children });";
export const patchPath =
  "patches/nextra-theme-docs@4.6.1.layout-children.patch";

// The transform is the authored input; the package patch is generated from the
// hash-bound upstream emitter output. Keep children in actual schema validation.
export function themeLayoutPatch(installed) {
  const source = installed.includes(after)
    ? installed.replace(after, before)
    : installed;
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    baselineSha256,
    "Unexpected upstream Nextra theme layout; review its source before regenerating",
  );
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.includes(before));
  assert.ok(index >= 3);
  assert.equal(lines.filter((line) => line.includes(before)).length, 1);
  const start = index - 3;
  const hunk = lines
    .slice(start, index + 4)
    .flatMap((line, offset) =>
      offset === 3
        ? ["-" + line, "+" + line.replace(before, after)]
        : [" " + line],
    );
  return (
    "diff --git a/dist/layout.js b/dist/layout.js\n--- a/dist/layout.js\n+++ b/dist/layout.js\n" +
    `@@ -${start + 1},7 +${start + 1},7 @@\n` +
    hunk.join("\n") +
    "\n"
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assertNodeVersion();
  assert.ok(["--write", "--check"].includes(process.argv[2]));
  const manifest = findPackageJSON(
    "nextra-theme-docs",
    new URL("../../apps/docs/package.json", import.meta.url),
  );
  const installed = readFileSync(
    resolve(dirname(manifest), "dist/layout.js"),
    "utf8",
  );
  const patch = themeLayoutPatch(installed);
  const path = resolve(repositoryRoot, patchPath);
  if (process.argv[2] === "--write") writeFileSync(path, patch);
  else
    assert.equal(
      readFileSync(path, "utf8"),
      patch,
      "Regenerate the theme layout patch",
    );
}
