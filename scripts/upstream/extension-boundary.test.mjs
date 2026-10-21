import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("CityOS implementation imports public Puck types and no private core runtime or styles", () => {
  const directory = join(root, "extensions/cityos");
  for (const file of readdirSync(directory).filter((name) =>
    /\.tsx?$/u.test(name),
  )) {
    const source = readFileSync(join(directory, file), "utf8");
    assert.doesNotMatch(
      source,
      /(?:from|import)\s*\(?\s*["'][^"']*(?:packages\/core|\/store|\/components\/|\/lib\/|\/types\/)/u,
      file,
    );
    assert.doesNotMatch(
      source,
      /import\s+(?!type\b)[^;]+from\s*["']@cityos-core\/puck["']/u,
      file,
    );
  }
  for (const file of ["cityos-registration", "cityos-string-list"]) {
    const source = readFileSync(join(root, `packages/core/${file}.ts`), "utf8");
    assert.match(
      source,
      new RegExp(`export \\* from "\\.\\./\\.\\./extensions/cityos/${file}"`),
    );
    assert.ok(source.split("\n").length < 5);
  }
});
