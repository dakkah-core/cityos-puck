import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(
  new URL("../../.github/scripts/run-recorded-check.sh", import.meta.url)
);

// This isolated fake pnpm tests only evidence/exit-code propagation. It is not
// an application test or a substitute for the real workflow commands.
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "cityos-check-evidence-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync(
      "git",
      [
        "-c", "user.name=Evidence test",
        "-c", "user.email=evidence@example.invalid",
        "commit", "--allow-empty", "-qm", "fixture",
      ],
      { cwd: root }
    );
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "pnpm"),
      '#!/bin/sh\nprintf "fixture stdout\\n"\nprintf "fixture stderr\\n" >&2\nexit "${FIXTURE_EXIT:-0}"\n',
      { mode: 0o755 }
    );
    run({
      root,
      execute(check, status) {
        return spawnSync("bash", [script, check], {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH}`,
            FIXTURE_EXIT: String(status),
          },
        });
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const check of ["install", "test", "lint", "format", "build"]) {
  for (const status of [0, 7]) {
    test(`${check} preserves exit ${status} with SHA-bound output`, () => {
      fixture(({ root, execute }) => {
        const result = execute(check, status);
        assert.equal(result.status, status, result.stderr);
        const report = JSON.parse(
          readFileSync(join(root, ".build", "cityos-ci", `${check}.json`))
        );
        const log = readFileSync(
          join(root, ".build", "cityos-ci", `${check}.log`)
        );
        const sha = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: root, encoding: "utf8",
        }).trim();
        assert.equal(report.sourceSha, sha);
        assert.equal(report.commandExitCode, status);
        assert.equal(report.loggingExitCode, 0);
        assert.equal(report.check, check);
        assert.equal(
          report.logSha256,
          createHash("sha256").update(log).digest("hex")
        );
        assert.match(log.toString(), /fixture stdout/);
        assert.match(log.toString(), /fixture stderr/);
        assert.match(result.stdout, /CITYOS_CHECK_RESULT/);
      });
    });
  }
}

test("unrecognized commands cannot execute through the evidence helper", () => {
  fixture(({ execute }) => {
    const result = execute("publish", 0);
    assert.equal(result.status, 64);
    assert.doesNotMatch(result.stdout, /fixture stdout/);
  });
});
