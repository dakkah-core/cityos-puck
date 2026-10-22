import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertNodeVersion, repositoryRoot } from "../toolchains/toolchain.mjs";
import { readDefaultCatalog } from "../toolchains/catalog-version.mjs";
import { sha256, verifyIntegration, verifyReceipt } from "./integration.mjs";
import { validatePublicationInput } from "./publication-input.mjs";

export function assertCompleteJestResults(results) {
  assert.equal(results.success, true);
  assert.ok(results.numPassedTests > 0);
  assert.equal(results.numTotalTests, results.numPassedTests);
  for (const key of ["numFailedTests", "numPendingTests", "numTodoTests"])
    assert.equal(results[key], 0, key);
  assert.ok(results.testResults.length > 0);
  for (const suite of results.testResults) {
    assert.equal(suite.status, "passed", suite.name);
    for (const test of suite.assertionResults)
      assert.equal(test.status, "passed", test.fullName);
  }
  return results.numPassedTests;
}

export function nodeTestCount(log) {
  const count = (name) => {
    const matches = [
      ...log.matchAll(new RegExp(`^(?:ℹ|#) ${name} (\\d+)\\s*$`, "gmu")),
    ];
    assert.equal(
      matches.length,
      1,
      `Missing or ambiguous test summary: ${name}`,
    );
    return Number(matches[0][1]);
  };
  const passed = count("pass");
  assert.ok(passed > 0);
  assert.equal(count("tests"), passed);
  for (const key of ["fail", "cancelled", "skipped", "todo"])
    assert.equal(count(key), 0, key);
  return passed;
}

export function assertRequiredChecks(required) {
  assert.deepEqual([...required].sort(), [
    "cms-host",
    "core-tests",
    "packed-consumers",
    "source-boundary",
  ]);
}

export function assertHostResult(host, artifactHash) {
  assert.equal(host.success, true);
  assert.equal(host.exitCode, 0);
  assert.ok(host.passed > 0);
  assert.equal(host.failed, 0);
  assert.equal(host.skipped, 0);
  assert.deepEqual(host.missingSuites, []);
  assert.equal(host.unchangedArtifact, true);
  assert.equal(host.artifact.sha256, artifactHash);
}

export async function qualify(cmsRoot, cmsCommit, root = repositoryRoot) {
  assertNodeVersion();
  const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const manifest = json("config/upstream/integration.json");
  assertRequiredChecks(manifest.requiredChecks);
  assert.match(cmsCommit, /^[a-f0-9]{40}$/u, "Pin the exact CMS source commit");
  cmsRoot = resolve(cmsRoot);
  const gitHost = (args) =>
    execFileSync("git", ["-C", cmsRoot, ...args], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  assert.equal(gitHost(["rev-parse", "HEAD"]), cmsCommit);
  assert.equal(
    gitHost(["remote", "get-url", "origin"]),
    manifest.consumerRepository,
  );
  assert.equal(
    gitHost(["status", "--porcelain", "--untracked-files=all"]),
    "",
    "CMS qualification requires a clean pinned checkout",
  );
  const hostIdentity = {
    repository: "dakkah-core/dakkah-cityos-cms",
    repositoryUrl: manifest.consumerRepository,
    sourceSha: cmsCommit,
    sourceTree: gitHost(["rev-parse", "HEAD^{tree}"]),
    inputs: [
      "pnpm-lock.yaml",
      "package.json",
      "pnpm-workspace.yaml",
      "vitest.config.ts",
      "config/toolchains/node-typescript.json",
      "scripts/upstream/verify-puck-candidate.mjs",
      "scripts/upstream/puck-candidate-host.test.tsx",
    ].map((path) => ({
      path,
      sha256: sha256(readFileSync(join(cmsRoot, path))),
    })),
  };
  const source = verifyIntegration(root);
  assert.deepEqual(source.errors, []);
  assert.equal(source.dirty, false, "Commit the qualification source first");
  const qualified = join(root, ".build/upstream/qualified");
  assert.equal(
    existsSync(qualified),
    false,
    "Retain the existing qualification bundle",
  );
  const parent = join(root, ".build/upstream");
  mkdirSync(parent, { recursive: true });
  const output = mkdtempSync(join(parent, "qualification-"));
  const packageManifest = json("packages/core/package.json");
  const archive = join(output, "package.tgz");
  const runner = join(root, "scripts/toolchains/run-pinned-pnpm.mjs");
  const checks = [];
  const execute = (name, args, cwd = root, env = process.env) => {
    console.log(`Running ${name}`);
    const result = spawnSync(process.execPath, args, {
      cwd,
      env,
      encoding: "utf8",
      windowsHide: true,
      timeout: 900_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const log = (result.stdout ?? "") + (result.stderr ?? "");
    writeFileSync(join(output, `${name}.log`), log);
    if (result.error || result.signal || result.status !== 0)
      throw new Error(`${name} failed; see ${join(output, `${name}.log`)}`, {
        cause: result.error,
      });
    return log;
  };
  const record = (name, log, passed) => {
    checks.push({
      name,
      exitCode: 0,
      passed,
      failed: 0,
      skipped: 0,
      logPath: `.build/upstream/qualified/logs/${name}.log`,
      logSha256: sha256(Buffer.from(log)),
    });
    writeFileSync(join(output, `${name}.log`), log);
  };
  const tests = readdirSync(join(root, "scripts/upstream"))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => join(root, "scripts/upstream", name));
  const sourceLog = execute("source-boundary", [
    "--test",
    "--test-reporter=tap",
    ...tests,
  ]);
  record(
    "source-boundary",
    sourceLog + JSON.stringify(source) + "\n",
    nodeTestCount(sourceLog),
  );
  const registration = execute("registration", [
    "scripts/cityos/registration-source-suite.mjs",
  ]);
  record("registration", registration, nodeTestCount(registration));
  execute("build", [runner, "--filter", packageManifest.name, "build"]);
  // Pack the existing build once; publication later uses these identical bytes.
  execute(
    "pack",
    [runner, "--filter", packageManifest.name, "pack", "--out", archive],
    root,
    { ...process.env, npm_config_ignore_scripts: "true" },
  );
  const artifactHash = sha256(readFileSync(archive));
  const typecheck = execute(
    "typecheck",
    [join(root, "scripts/toolchains/typecheck.mjs"), "--noEmit"],
    join(root, "packages/core"),
  );
  const core = execute("core-tests", [
    runner,
    "--filter",
    packageManifest.name,
    "exec",
    "jest",
    "--runInBand",
    "--json",
    "--outputFile",
    join(output, "core.json"),
  ]);
  const results = JSON.parse(readFileSync(join(output, "core.json"), "utf8"));
  record("core-tests", typecheck + core, assertCompleteJestResults(results));
  const consumer = join(output, "consumer");
  mkdirSync(consumer);
  const catalog = readDefaultCatalog();
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "cityos-puck-qualification-consumer",
        private: true,
        packageManager: json("package.json").packageManager,
        dependencies: {
          [packageManifest.name]: `file:${archive.replaceAll("\\", "/")}`,
          react: JSON.parse(
            readFileSync(
              join(cmsRoot, "node_modules/react/package.json"),
              "utf8",
            ),
          ).version,
          "react-dom": JSON.parse(
            readFileSync(
              join(cmsRoot, "node_modules/react-dom/package.json"),
              "utf8",
            ),
          ).version,
        },
        devDependencies: {
          "@types/react": catalog["@types/react"],
          "@types/react-dom": catalog["@types/react-dom"],
          "happy-dom": catalog["happy-dom"],
        },
      },
      null,
      2,
    ) + "\n",
  );
  execute("consumer-install", [
    runner,
    "--dir",
    consumer,
    "--ignore-workspace",
    "install",
    "--ignore-scripts",
  ]);
  for (const name of [
    "esm.mjs",
    "commonjs.cjs",
    "server.mjs",
    "types.mts",
    "editor-host.mjs",
  ])
    copyFileSync(
      join(root, "scripts/upstream/consumers", name),
      join(consumer, name),
    );
  const args = [source.sourceSha, source.sourceDigest, packageManifest.version];
  let publicLog = "";
  for (const [name, flags] of [
    ["esm.mjs", []],
    ["commonjs.cjs", []],
    ["server.mjs", ["--conditions=react-server"]],
  ])
    publicLog += execute(
      name,
      [...flags, join(consumer, name), ...args],
      consumer,
    );
  publicLog += execute("public-types", [
    join(root, "scripts/toolchains/typecheck.mjs"),
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    join(consumer, "types.mts"),
  ]);
  record("packed-consumers", publicLog, 4);
  let editorLog = "";
  for (const mode of ["require", "import"])
    editorLog += execute(
      `editor-${mode}`,
      [join(consumer, "editor-host.mjs"), mode],
      consumer,
    );
  record("editor-host", editorLog, 2);
  // The authoritative host harness runs actual CMS/Studio suites against an
  // extracted copy of the same archive, with its exact installed candidate graph.
  const { verifyPuckCandidate } = await import(
    pathToFileURL(join(cmsRoot, "scripts/upstream/verify-puck-candidate.mjs"))
      .href
  );
  const host = await verifyPuckCandidate(archive, consumer);
  writeFileSync(
    join(output, "cms-host-receipt.json"),
    JSON.stringify(host, null, 2) + "\n",
  );
  assertHostResult(host, artifactHash);
  const hostLog = readFileSync(host.logPath, "utf8");
  assert.equal(sha256(Buffer.from(hostLog)), host.logSha256);
  record("cms-host", hostLog, host.passed);
  assert.equal(gitHost(["rev-parse", "HEAD"]), cmsCommit);
  assert.equal(
    gitHost(["status", "--porcelain", "--untracked-files=all"]),
    "",
    "CMS source changed during qualification",
  );
  for (const input of hostIdentity.inputs)
    assert.equal(sha256(readFileSync(join(cmsRoot, input.path))), input.sha256);
  assert.equal(
    sha256(readFileSync(archive)),
    artifactHash,
    "The tested archive changed",
  );
  assert.deepEqual(
    verifyIntegration(root),
    source,
    "Source changed during qualification",
  );
  mkdirSync(join(qualified, "logs"), { recursive: true });
  copyFileSync(archive, join(qualified, "package.tgz"));
  for (const check of checks)
    copyFileSync(
      join(output, `${check.name}.log`),
      join(qualified, "logs", `${check.name}.log`),
    );
  const receipt = {
    schemaVersion: "cityos.upstream-qualification.v1",
    sourceSha: source.sourceSha,
    sourceDigest: source.sourceDigest,
    dirty: false,
    upstream: manifest.upstream,
    artifact: {
      path: ".build/upstream/qualified/package.tgz",
      package: packageManifest.name,
      version: packageManifest.version,
      sha256: artifactHash,
    },
    lockfile: {
      path: "pnpm-lock.yaml",
      sha256: sha256(readFileSync(join(root, "pnpm-lock.yaml"))),
    },
    requiredChecks: manifest.requiredChecks,
    host: {
      ...hostIdentity,
      graph: host.graph,
      artifactSha256: artifactHash,
      passed: host.passed,
      failed: host.failed,
      skipped: host.skipped,
    },
    checks,
    published: false,
    nonClaims: [
      "Stationary package and CMS/Studio host qualification does not prove browser drag geometry, consumer adoption, or deployed runtime readiness.",
    ],
  };
  validatePublicationInput(receipt, packageManifest);
  assert.deepEqual(verifyReceipt(root, receipt), []);
  writeFileSync(
    join(qualified, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      sourceSha: source.sourceSha,
      artifact: receipt.artifact,
      checks,
    }),
  );
  return receipt;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(
    process.argv.length,
    6,
    "Usage: qualification.mjs --cms-root <pinned checkout> --cms-commit <40-character SHA>",
  );
  assert.equal(process.argv[2], "--cms-root");
  assert.equal(process.argv[4], "--cms-commit");
  await qualify(process.argv[3], process.argv[5]);
}
