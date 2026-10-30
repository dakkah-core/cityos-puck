import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { runCoreBuild } from "./build-core.mjs";

test("core build refreshes the packaged changelog before compiling", () => {
  const target = resolve("packages/core/CHANGELOG.md");
  const previous = existsSync(target) ? readFileSync(target) : null;
  try {
    writeFileSync(target, "stale release documentation");
    assert.equal(
      runCoreBuild({
        cwd: resolve("packages/core"),
        clean: () => {},
        run: () => {
          const digest = (path) =>
            createHash("sha256").update(readFileSync(path)).digest("hex");
          assert.equal(digest(target), digest(resolve("CHANGELOG.md")));
          return { status: 0 };
        },
      }),
      0,
    );
  } finally {
    if (previous) writeFileSync(target, previous);
    else unlinkSync(target);
  }
});

test("core prepare and build use the same non-installing build entrypoint", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../packages/core/package.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    manifest.scripts.build,
    "node ../../scripts/toolchains/build-core.mjs",
  );
  assert.match(
    manifest.scripts.prepare,
    /node \.\.\/\.\.\/scripts\/toolchains\/build-core\.mjs$/u,
  );
  assert.doesNotMatch(manifest.scripts.prepare, /run-pinned-pnpm/);
});

test("core build uses the installed tsup directly and propagates its failure", () => {
  const calls = [];
  const code = runCoreBuild({
    cwd: resolve("packages/core"),
    clean: (path) => calls.push(["clean", path]),
    run: (executable, args, options) => {
      calls.push(["run", executable, args, options.cwd]);
      return { status: 7 };
    },
  });
  assert.equal(code, 7);
  assert.equal(calls[0][0], "clean");
  assert.equal(calls[1][1], process.execPath);
  assert.match(calls[1][2][0], /tsup[\\/].*cli-default\.js$/u);
  assert.deepEqual(calls[1][2].slice(1), [
    "bundle/index.ts",
    "bundle/rsc.tsx",
    "bundle/no-external.ts",
    "bundle/internal.ts",
    "cityos.ts",
  ]);
});

test("core build rejects another package before cleanup and propagates spawn errors", () => {
  let cleaned = false;
  assert.throws(
    () =>
      runCoreBuild({
        cwd: resolve("."),
        clean: () => {
          cleaned = true;
        },
      }),
    /owning package/u,
  );
  assert.equal(cleaned, false);
  assert.throws(
    () =>
      runCoreBuild({
        cwd: resolve("packages/core"),
        clean: () => {},
        run: () => ({ error: new Error("compiler unavailable") }),
      }),
    /compiler unavailable/u,
  );
});
