import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

const workflow = parse(
  readFileSync(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  ),
);

for (const [name, job] of Object.entries(workflow.jobs)) {
  test(`${name} verifies native pnpm before any manager-dependent check`, () => {
    const setup = job.steps.findIndex((step) => step.uses === "pnpm/setup@v3");
    assert.ok(
      setup >= 0,
      "Provision the native executable, not a bootstrap shim",
    );
    assert.equal(job.steps[setup].with.install, false);
    assert.equal(job.steps[setup].with["node-version-file"], false);
    assert.equal(job.steps[setup].with.version, undefined);
    const binding = job.steps.findIndex((step) =>
      step.run?.includes('export PUCK_PNPM_EXECUTABLE="$PNPM_BIN_DEST/pnpm"'),
    );
    assert.ok(binding > setup);
    assert.equal(
      job.steps[binding].env.PNPM_BIN_DEST,
      "${{ steps.pnpm.outputs.bin-dest }}",
    );
    assert.match(job.steps[binding].run, /run-pinned-pnpm\.mjs --version/u);
    assert.match(job.steps[binding].run, /GITHUB_ENV/u);
    const consumer = job.steps.findIndex((step) =>
      /bash \.github\/scripts\/run-recorded-check\.sh|node scripts\/cityos\/registration-source-suite/u.test(
        step.run ?? "",
      ),
    );
    assert.ok(consumer > binding);
    const install = job.steps.findIndex((step) =>
      /run-pinned-pnpm\.mjs install --frozen-lockfile|run-recorded-check\.sh install/u.test(
        step.run ?? "",
      ),
    );
    assert.ok(install > binding && install <= consumer);
  });
}
