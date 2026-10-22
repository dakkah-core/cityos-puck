import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCompleteJestResults,
  assertRequiredChecks,
  assertHostResult,
  nodeTestCount,
} from "./qualification.mjs";

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
