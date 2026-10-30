import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { cleanPackageDist } from "../toolchains/clean-package-dist.mjs";

test("workspace package builds use portable guarded output cleanup", () => {
  for (const name of [
    "core",
    "field-contentful",
    "plugin-emotion-cache",
    "plugin-heading-analyzer",
  ]) {
    const manifest = JSON.parse(
      readFileSync(
        new URL(`../../packages/${name}/package.json`, import.meta.url),
      ),
    );
    if (name === "core") {
      assert.equal(
        manifest.scripts.build,
        "node ../../scripts/toolchains/build-core.mjs",
      );
    } else {
      assert.match(
        manifest.scripts.build,
        /^node \.\.\/\.\.\/scripts\/toolchains\/build-package\.mjs index\.tsx?$/u,
        name,
      );
    }
  }
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "puck-package-cleanup-"));
  t.after(() => {
    assert.equal(realpathSync(dirname(root)), realpathSync(tmpdir()));
    assert.ok(basename(root).startsWith("puck-package-cleanup-"));
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    rmSync(root, { recursive: true, force: true });
  });
  const directory = join(root, "packages/demo");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "fixture" }),
  );
  return { root, directory };
}

test("cleanup removes only the package output and tolerates an absent output", (t) => {
  const { root, directory } = fixture(t);
  mkdirSync(join(directory, "dist"));
  writeFileSync(join(directory, "dist/output.js"), "fixture");
  writeFileSync(join(directory, "source.ts"), "preserved");
  cleanPackageDist(directory, root);
  assert.equal(existsSync(join(directory, "dist")), false);
  assert.equal(readFileSync(join(directory, "source.ts"), "utf8"), "preserved");
  assert.doesNotThrow(() => cleanPackageDist(directory, root));
  assert.throws(() => cleanPackageDist(root, root), /owned direct workspace/);
});

test("linked output cannot redirect cleanup outside its package", (t) => {
  const { root, directory } = fixture(t);
  const outside = join(root, "other");
  mkdirSync(outside);
  writeFileSync(join(outside, "marker"), "preserved");
  symlinkSync(
    outside,
    join(directory, "dist"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(
    () => cleanPackageDist(directory, root),
    /linked package output/,
  );
  assert.equal(readFileSync(join(outside, "marker"), "utf8"), "preserved");
});
