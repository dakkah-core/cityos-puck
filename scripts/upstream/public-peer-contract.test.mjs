import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("the public editor declares the React DOM runtime it imports as a host peer", () => {
  const core = JSON.parse(
    readFileSync(join(root, "packages/core/package.json"), "utf8"),
  );
  const ignored = new Set([
    "dist",
    "node_modules",
    "__tests__",
    "__helpers__",
    "__test_support__",
  ]);
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return ignored.has(entry.name) ? [] : walk(path);
      return /\.tsx?$/u.test(path) && !/\.(?:test|spec)\.tsx?$/u.test(path)
        ? [path]
        : [];
    });
  const imports = walk(join(root, "packages/core")).filter((path) =>
    /from\s*["']react-dom(?:\/[^"']*)?["']/u.test(readFileSync(path, "utf8")),
  );
  assert.ok(
    imports.length > 0,
    "The client editor still uses the host React DOM runtime",
  );
  assert.equal(
    core.peerDependencies["react-dom"],
    "catalog:peers",
    "Consumers must not rely on an undeclared React DOM supplied by the build workspace",
  );
});
