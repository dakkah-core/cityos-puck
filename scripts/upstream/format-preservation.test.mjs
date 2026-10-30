import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getFileInfo } from "prettier";
import { fileURLToPath } from "node:url";
import { preservedFormattingPlan } from "../toolchains/project-format-preservation.mjs";

test("formatter excludes generated router types while checking authored routes", async () => {
  const ignorePath = fileURLToPath(
    new URL("../../.prettierignore", import.meta.url),
  );
  for (const recipe of ["react-router", "react-router-ai"]) {
    const info = (path) =>
      getFileInfo(
        fileURLToPath(
          new URL(`../../recipes/${recipe}/${path}`, import.meta.url),
        ),
        { ignorePath },
      );
    assert.equal((await info(".react-router/types/+routes.ts")).ignored, true);
    assert.equal((await info("app/routes/_index.tsx")).ignored, false);
  }
});

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
