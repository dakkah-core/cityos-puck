import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(
  new URL("../../.github/scripts/run-recorded-check.sh", import.meta.url),
);
// Windows' ambient bash can be the WSL launcher, which cannot execute a native
// C:\ path or the fixture's native Git/Node PATH. Use the shell owned by the
// same installed Git as the fixture; POSIX keeps its normal Bash executable.
const bash =
  process.platform === "win32"
    ? join(
        dirname(
          dirname(
            dirname(
              execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(),
            ),
          ),
        ),
        "bin",
        "bash.exe",
      )
    : "bash";
if (process.platform === "win32" && !existsSync(bash))
  throw new Error(
    "Recorded-check Windows fixtures require the installed Git Bash executable",
  );

// This isolated fake Node command tests only evidence/exit-code propagation. It is not
// an application test or a substitute for the real workflow commands.
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "cityos-check-evidence-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Evidence test",
        "-c",
        "user.email=evidence@example.invalid",
        "commit",
        "--allow-empty",
        "-qm",
        "fixture",
      ],
      { cwd: root },
    );
    const bin = join(root, "bin");
    mkdirSync(bin);
    const selectors = join(root, "scripts", "toolchains");
    mkdirSync(selectors, { recursive: true });
    // Selection is covered by toolchain behavior tests; this fixture isolates logging.
    writeFileSync(
      join(selectors, "select-workspace-node.sh"),
      "# fixture selection boundary\n",
    );
    writeFileSync(
      join(bin, "node"),
      '#!/bin/sh\n[ \"$1\" = scripts/toolchains/run-pinned-pnpm.mjs ] || exit 65\nprintf "fixture stdout\\n"\nprintf "fixture stderr\\n" >&2\nexit "${FIXTURE_EXIT:-0}"\n',
      { mode: 0o755 },
    );
    run({
      root,
      execute(check, status) {
        return spawnSync(bash, [script.replaceAll("\\", "/"), check], {
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

for (const check of [
  "install",
  "compatibility",
  "test",
  "lint",
  "format",
  "build",
]) {
  for (const status of [0, 7]) {
    test(`${check} preserves exit ${status} with SHA-bound output`, () => {
      fixture(({ root, execute }) => {
        const result = execute(check, status);
        assert.equal(result.status, status, result.stderr);
        const report = JSON.parse(
          readFileSync(join(root, ".build", "cityos-ci", `${check}.json`)),
        );
        const log = readFileSync(
          join(root, ".build", "cityos-ci", `${check}.log`),
        );
        const sha = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: root,
          encoding: "utf8",
        }).trim();
        assert.equal(report.sourceSha, sha);
        assert.equal(report.commandExitCode, status);
        assert.equal(report.loggingExitCode, 0);
        assert.equal(report.check, check);
        assert.equal(
          report.logSha256,
          createHash("sha256").update(log).digest("hex"),
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
