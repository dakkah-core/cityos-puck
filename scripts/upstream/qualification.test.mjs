import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  assertCompleteJestResults,
  assertRequiredChecks,
  assertHostResult,
  nodeTestCount,
  assertCmsPolicyParity,
  qualify,
} from "./qualification.mjs";

test("direct qualification checks policy using the pinned CMS toolchain and rejects drift", (t) => {
  const root = mkdtempSync(join(tmpdir(), "puck-cms-policy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cms = join(root, "cms"),
    puck = join(root, "puck space"),
    marker = join(root, "observed.json");
  mkdirSync(join(cms, "config/toolchains"), { recursive: true });
  mkdirSync(join(cms, "scripts/toolchains"), { recursive: true });
  mkdirSync(puck);
  writeFileSync(
    join(cms, "config/toolchains/node-typescript.json"),
    JSON.stringify({ node: process.versions.node }),
  );
  writeFileSync(
    join(cms, "scripts/toolchains/resolve-workspace-node.mjs"),
    'console.log(requirePath(process.execPath)); function requirePath(p) { return p.slice(0, Math.max(p.lastIndexOf("/"),p.lastIndexOf("\\\\"))); }',
  );
  const projector = join(
    cms,
    "scripts/toolchains/project-generated-types-policy.mjs",
  );
  writeFileSync(
    projector,
    `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));`,
  );
  assertCmsPolicyParity(cms, puck);
  assert.deepEqual(JSON.parse(readFileSync(marker, "utf8")), {
    args: [resolve(puck), "--check"],
    cwd: resolve(cms),
  });
  writeFileSync(projector, "process.exit(4);");
  assert.throws(() => assertCmsPolicyParity(cms, puck), /policy parity/i);
  rmSync(projector);
  assert.throws(() => assertCmsPolicyParity(cms, puck), /policy parity/i);
  writeFileSync(
    join(cms, "config/toolchains/node-typescript.json"),
    JSON.stringify({ node: "0.0.1" }),
  );
  assert.throws(() => assertCmsPolicyParity(cms, puck), /runtime/i);
});

test("direct qualification checks the pinned host before creating qualification output", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "puck-direct-qualification-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cms = join(root, "cms"),
    puck = join(root, "puck"),
    marker = join(root, "projector-ran");
  mkdirSync(join(cms, "scripts/toolchains"), { recursive: true });
  mkdirSync(join(cms, "config/toolchains"), { recursive: true });
  mkdirSync(join(puck, "config/upstream"), { recursive: true });
  const origin = "https://example.invalid/cms.git";
  writeFileSync(
    join(puck, "config/upstream/integration.json"),
    JSON.stringify({
      consumerRepository: origin,
      requiredChecks: [
        "cms-host",
        "core-tests",
        "packed-consumers",
        "source-boundary",
      ],
    }),
  );
  writeFileSync(
    join(cms, "config/toolchains/node-typescript.json"),
    JSON.stringify({ node: process.versions.node }),
  );
  writeFileSync(
    join(cms, "scripts/toolchains/resolve-workspace-node.mjs"),
    'console.log(process.execPath.slice(0, Math.max(process.execPath.lastIndexOf("/"),process.execPath.lastIndexOf("\\\\"))))',
  );
  const projector = join(
    cms,
    "scripts/toolchains/project-generated-types-policy.mjs",
  );
  writeFileSync(
    projector,
    `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)},'ran'); process.exit(4);`,
  );
  const git = (...args) =>
    execFileSync("git", ["-C", cms, ...args], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  git("init", "--quiet");
  git("remote", "add", "origin", origin);
  git(
    "add",
    "--",
    "config/toolchains/node-typescript.json",
    "scripts/toolchains/resolve-workspace-node.mjs",
    "scripts/toolchains/project-generated-types-policy.mjs",
  );
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    "fixture",
  );
  const commit = git("rev-parse", "HEAD");
  await assert.rejects(qualify(cms, "a".repeat(40), puck));
  assert.throws(() => readFileSync(marker));
  await assert.rejects(qualify(cms, commit, puck), /policy parity/i);
  assert.equal(readFileSync(marker, "utf8"), "ran");
  assert.throws(() => readFileSync(join(puck, ".build/upstream/qualified")));
});

test("qualification rejects failed, skipped, pending and incomplete Jest execution", () => {
  const result = {
    success: true,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: "actual suite",
        status: "passed",
        assertionResults: [{ fullName: "actual test", status: "passed" }],
      },
    ],
  };
  assert.equal(assertCompleteJestResults(result), 1);
  for (const change of [
    { success: false },
    { numPassedTests: 0 },
    { numTotalTests: 2 },
    { numFailedTests: 1 },
    { numPendingTests: 1 },
    { numTodoTests: 1 },
    { testResults: [] },
  ])
    assert.throws(() => assertCompleteJestResults({ ...result, ...change }));
  for (const status of ["pending", "failed", "todo", "skipped"])
    assert.throws(() =>
      assertCompleteJestResults({
        ...result,
        testResults: [
          { ...result.testResults[0], assertionResults: [{ status }] },
        ],
      }),
    );
});

test("Node summaries require actual nonzero passes and no skipped or cancelled checks", () => {
  for (const marker of ["#", "ℹ"]) {
    const log = [
      "tests 4",
      "pass 4",
      "fail 0",
      "cancelled 0",
      "skipped 0",
      "todo 0",
    ]
      .map((line) => `${marker} ${line}\n`)
      .join("");
    assert.equal(nodeTestCount(log), 4);
    for (const label of ["fail", "cancelled", "skipped", "todo"])
      assert.throws(() =>
        nodeTestCount(log.replace(`${label} 0`, `${label} 1`)),
      );
    assert.throws(() => nodeTestCount(log + log));
    assert.throws(() => nodeTestCount(log.replace("pass 4", "pass 0")));
  }
  assert.throws(() => nodeTestCount("command exited 0"));
});

test("qualification retains the actual CMS host gate and cannot replace it with local editor checks", () => {
  const required = [
    "cms-host",
    "core-tests",
    "packed-consumers",
    "source-boundary",
  ];
  assert.doesNotThrow(() => assertRequiredChecks(required));
  assert.throws(() =>
    assertRequiredChecks(required.filter((name) => name !== "cms-host")),
  );
  assert.throws(() =>
    assertRequiredChecks(
      required.map((name) => (name === "cms-host" ? "editor-host" : name)),
    ),
  );
});

test("host proof requires successful actual execution against identical tarball bytes", () => {
  const host = {
    success: true,
    exitCode: 0,
    passed: 4,
    failed: 0,
    skipped: 0,
    missingSuites: [],
    unchangedArtifact: true,
    artifact: { sha256: "a".repeat(64) },
  };
  assert.doesNotThrow(() => assertHostResult(host, "a".repeat(64)));
  for (const change of [
    { success: false },
    { exitCode: 1 },
    { passed: 0 },
    { failed: 1 },
    { skipped: 1 },
    { missingSuites: ["actual-host.test.tsx"] },
    { unchangedArtifact: false },
  ])
    assert.throws(() =>
      assertHostResult({ ...host, ...change }, "a".repeat(64)),
    );
  assert.throws(() => assertHostResult(host, "b".repeat(64)));
});
