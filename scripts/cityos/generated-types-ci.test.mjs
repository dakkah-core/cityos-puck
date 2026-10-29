import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const requiredTests = [
  "packages/create-puck-app/pinned-pnpm.test.mjs",
  "scripts/cityos/generated-types-ci.test.mjs",
  "scripts/toolchains/generated-types-policy/generated-types-policy.test.mjs",
  "scripts/toolchains/generated-types-policy/generated-type-check-evidence.test.mjs",
  "scripts/toolchains/generated-types-policy/resolution-namespace-v2.test.mjs",
  "scripts/toolchains/verify-generated-types-policy.test.mjs",
  "scripts/toolchains/next-generated-types.test.mjs",
  "scripts/toolchains/next-effective-config.test.mjs",
  "scripts/toolchains/next-build-guard.test.mjs",
  "scripts/toolchains/next-source-fingerprint.test.mjs",
  "scripts/toolchains/next-output-lock.test.mjs",
  "scripts/toolchains/next-project-config.test.mjs",
  "scripts/toolchains/next-typecheck-cache.test.mjs",
  "scripts/toolchains/next-typecheck-overlay.test.mjs",
  "scripts/toolchains/next-typegen-fixture.test.mjs",
  "scripts/toolchains/react-router-typecheck-cache.test.mjs",
  "packages/create-puck-app/scripts/copy-recipes.test.mjs",
  "packages/create-puck-app/scripts/clean-pack.test.mjs",
  "packages/create-puck-app/scripts/next-standalone.test.mjs",
  "packages/create-puck-app/scripts/react-router-standalone.test.mjs",
];

test("recorded generated-type check runs all protection suites serially", () => {
  const helper = read(".github/scripts/run-recorded-check.sh");
  const cases = helper.match(/^\s*generated-types\) command=\(([^\n]*)\) ;;\s*$/gmu);
  assert.equal(cases?.length, 1, "one maintained generated-types command is required");
  const args = cases[0].match(/command=\(([^\n]*)\)/u)[1].trim().split(/\s+/u);
  assert.deepEqual(args.slice(0, 3), ["node", "--test", "--test-concurrency=1"]);
  for (const path of requiredTests) {
    assert.ok(existsSync(new URL(path, root)), `missing test: ${path}`);
    assert.ok(args.slice(3).includes(path), `recorded check omits ${path}`);
  }
  assert.ok(args.slice(3).every((arg) => arg.endsWith(".test.mjs")), "test filters or other options must not narrow the suite");
});

test("CI runs the recorded generated-type check after installing dependencies", () => {
  const workflow = parse(read(".github/workflows/ci.yml"));
  const job = workflow.jobs["build-and-test"];
  assert.ok(job);
  assert.equal(job.if, undefined);
  assert.equal(job["continue-on-error"], undefined);
  const install = job.steps.findIndex((step) => step.run === "bash .github/scripts/run-recorded-check.sh install");
  const checks = job.steps.filter((step) => step.run === "bash .github/scripts/run-recorded-check.sh generated-types");
  assert.ok(install >= 0);
  assert.equal(checks.length, 1);
  assert.ok(job.steps.indexOf(checks[0]) > install);
  assert.equal(checks[0].if, undefined);
  assert.equal(checks[0]["continue-on-error"], undefined);
});
