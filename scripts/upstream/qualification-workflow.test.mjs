import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

test("cross-repository qualification pins the host, retains CI and publishes evidence only after success", () => {
  const workflow = parse(
    readFileSync(
      new URL("../../.github/workflows/qualify-cityos.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(workflow.on.workflow_dispatch.inputs.cms_commit.required, true);
  assert.equal(workflow.jobs.verify.uses, "./.github/workflows/ci.yml");
  const steps = workflow.jobs.qualify.steps;
  const checkout = steps.find((step) =>
    step.run?.includes("git init .build/cms-host"),
  );
  assert.equal(checkout.env.CMS_COMMIT, "${{ inputs.cms_commit }}");
  assert.match(checkout.run, /consumerRepository/u);
  assert.match(
    checkout.run,
    /fetch --no-tags --depth=1 origin "\$CMS_COMMIT"/u,
  );
  assert.match(checkout.run, /checkout --detach FETCH_HEAD/u);
  assert.doesNotMatch(checkout.run, /secrets\.|git clone.*main/u);
  const parity = steps.findIndex((step) =>
    step.run?.includes("project-generated-types-policy.mjs"),
  );
  assert.ok(parity > steps.indexOf(checkout));
  assert.equal(steps[parity].if, undefined);
  assert.notEqual(steps[parity]["continue-on-error"], true);
  assert.match(steps[parity].run, /cd \.build\/cms-host/u);
  assert.match(steps[parity].run, /source scripts\/toolchains\/select-workspace-node\.sh/u);
  assert.match(steps[parity].run, /project-generated-types-policy\.mjs "\$GITHUB_WORKSPACE" --check/u);
  const check = steps.findIndex((step) =>
    step.run?.includes("node scripts/upstream/qualification.mjs"),
  );
  assert.ok(check > parity);
  assert.match(steps[check].run, /--frozen-lockfile/u);
  assert.match(steps[check].run, /--cms-commit "\$CMS_COMMIT"/u);
  const upload = steps.findIndex(
    (step) => step.with?.name === "cityos-puck-qualified-${{ github.sha }}",
  );
  assert.ok(upload > check);
  assert.equal(steps[upload].if, undefined);
  assert.equal(steps[upload].with["if-no-files-found"], "error");
});
