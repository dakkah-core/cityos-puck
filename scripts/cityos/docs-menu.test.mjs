import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { metaSchema } from "nextra/schemas";
import { repositoryRoot } from "../toolchains/toolchain.mjs";

test("every maintained docs menu entry satisfies the installed Nextra schema", async () => {
  const menus = globSync("apps/docs/content/**/_meta.js", { cwd: repositoryRoot });
  assert.ok(menus.length > 0);
  for (const path of menus) {
    const { default: menu } = await import(pathToFileURL(resolve(repositoryRoot, path)).href);
    for (const [key, value] of Object.entries(menu)) {
      const result = metaSchema.safeParse(value);
      assert.ok(result.success, `${path}#${key}: ${result.error?.message}`);
    }
  }
});
