import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { preservedFormattingPlan } from "../toolchains/project-format-preservation.mjs";

test("formatting preserves every captured input while maintained application source stays in scope", () => {
  const source = JSON.parse(
    readFileSync(
      new URL(
        "../toolchains/nextra-stable-docs/acceptance-inputs/preservation.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const plan = preservedFormattingPlan();
  for (const entry of [
    ...source.routes,
    ...source.examples,
    ...source.publicBoundarySources,
  ])
    assert.ok(
      plan.includes(
        "/" + entry.path.replaceAll("[", "\\[").replaceAll("]", "\\]"),
      ),
      entry.path,
    );
  for (const path of [
    "apps/demo/app/page.tsx",
    "packages/core/components/Puck/index.tsx",
    "recipes/",
  ])
    assert.ok(
      !plan.split("\n").includes(path) &&
        !plan.split("\n").includes("/" + path),
    );
  assert.equal(
    readFileSync(
      new URL("../../.prettierignore", import.meta.url),
      "utf8",
    ).replaceAll("\r\n", "\n"),
    plan,
  );
});
