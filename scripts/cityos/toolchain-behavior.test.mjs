import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertNodeVersion, deriveToolchain, loadToolchain } from "../toolchains/toolchain.mjs";
import { nodeEngineManifests, planToolchainProjection, toolchainDrift } from "../toolchains/project-toolchain.mjs";
import { selectExactRuntime } from "../toolchains/resolve-workspace-node.mjs";
import { assertPnpmVersion, isNativeExecutable, pinnedNodeEnvironment, pinnedPnpmEnvironment, resolvePinnedPnpm } from "../../packages/create-puck-app/pinned-pnpm.mjs";
import toolchainHelpers from "../../packages/create-puck-app/toolchain.cjs";

const root = new URL("../../", import.meta.url);
const toolchain = loadToolchain();
const catalog = JSON.parse(readFileSync(new URL("config/toolchains/node-typescript.json", root), "utf8"));

function temporary(run) {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(join(base, "puck-toolchain-"));
  try { run(directory); } finally {
    const child = relative(base, resolve(directory));
    assert.ok(child && !child.startsWith("..") && !isAbsolute(child));
    rmSync(directory, { force: true, recursive: true });
  }
}

test("derived engines and manager move with the canonical input, with no second free pin", () => {
  const changed = deriveToolchain({ ...catalog, node: "28.2.3", nodeTypes: "28.4.5", pnpm: "14.6.7" });
  assert.equal(changed.nodeEngine, ">=28.0.0 <29.0.0");
  assert.equal(changed.pnpmEngine, ">=14.0.0 <15.0.0");
  assert.equal(changed.packageManager, "pnpm@14.6.7");
  for (const key of ["node", "nodeTypes", "typescript", "pnpm"]) {
    assert.throws(() => deriveToolchain({ ...catalog, [key]: "latest" }), /exact stable/u);
    assert.throws(() => deriveToolchain({ ...catalog, [key]: "1.2.3-rc.1" }), /exact stable/u);
  }
  assert.throws(() => deriveToolchain({ ...catalog, nodeTypes: "1.2.3" }), /runtime major/u);
  assert.throws(() => deriveToolchain({ ...catalog, typescriptApi: { identifier: "typescript", package: catalog.typescriptApi.package } }), /isolated/u);
});

test("runtime selection rejects another patch, failed probes and version noise", () => {
  const [major, minor, patch] = toolchain.node.split(".").map(Number);
  const other = `${major}.${minor}.${patch + 1}`;
  const probes = [
    { status: 0, version: `v${other}`, executable: "wrong-patch" },
    { status: 7, version: `v${toolchain.node}`, executable: "failed" },
    { status: 0, version: `v${toolchain.node} extra`, executable: "noise" },
    { status: 0, version: `v${toolchain.node}`, executable: "exact" },
  ];
  assert.equal(selectExactRuntime(probes, toolchain.node).executable, "exact");
  assert.equal(selectExactRuntime(probes.slice(0, -1), toolchain.node), null);
  assert.doesNotThrow(() => assertNodeVersion(toolchain, toolchain.node));
  assert.throws(() => assertNodeVersion(toolchain, other), /Expected exactly/u);
});

test("bootstrap snapshots reject stale runtime, manager, declarations and either API alias", () => {
  const owner = { packageManager: toolchain.packageManager, engines: { node: toolchain.nodeEngine, pnpm: toolchain.pnpmEngine } };
  const workspace = { catalog: { typescript: toolchain.typescript, "@types/node": toolchain.nodeTypes,
    [toolchain.typescriptApi.identifier]: toolchain.typescriptApi.package },
    catalogs: { [toolchain.typescriptApi.identifier]: { typescript: toolchain.typescriptApi.package } } };
  const check = (w, o) => toolchainHelpers.assertBootstrapToolchain(w, o, toolchain);
  assert.doesNotThrow(() => check(workspace, owner));
  assert.throws(() => check(workspace, { ...owner, packageManager: "pnpm@1.2.3" }), /canonical toolchain/u);
  assert.throws(() => check(workspace, { ...owner, engines: { ...owner.engines, node: ">=24" } }), /canonical toolchain/u);
  for (const name of ["typescript", "@types/node", toolchain.typescriptApi.identifier]) {
    assert.throws(() => check({ ...workspace, catalog: { ...workspace.catalog, [name]: "stale" } }, owner), /canonical toolchain/u);
  }
  assert.throws(() => check({ ...workspace, catalogs: { "typescript-api": { typescript: "stale" } } }, owner), /canonical toolchain/u);
});

test("projection drift is repairable from the catalog and leaves unrelated manifest data intact", () => {
  temporary((directory) => {
    for (const path of ["pnpm-workspace.yaml", ".nvmrc", ...nodeEngineManifests]) {
      const target = join(directory, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(new URL(path, root)));
    }
    const changed = deriveToolchain({ ...catalog, node: "28.2.3", nodeTypes: "28.4.5", typescript: "7.1.0", pnpm: "14.6.7",
      typescriptApi: { ...catalog.typescriptApi, package: "npm:@typescript/typescript6@6.0.3" } });
    const plan = planToolchainProjection(directory, changed);
    const drift = toolchainDrift(directory, plan);
    assert.deepEqual(new Set(drift), new Set([".nvmrc", "pnpm-workspace.yaml", ...nodeEngineManifests]));
    const before = JSON.parse(readFileSync(join(directory, "packages/core/package.json"), "utf8"));
    const after = JSON.parse(plan.get("packages/core/package.json"));
    assert.equal(after.name, before.name);
    assert.equal(after.version, before.version);
    assert.deepEqual(after.exports, before.exports);
    assert.deepEqual(after.scripts, before.scripts);
    assert.equal(after.engines.node, changed.nodeEngine);
    const workspace = plan.get("pnpm-workspace.yaml");
    assert.ok(workspace.includes(`"@types/node": "${changed.nodeTypes}"`));
    assert.ok(workspace.includes(`"typescript": "${changed.typescript}"`));
    assert.equal(workspace.split(changed.typescriptApi.package).length - 1, 2);
    for (const [path, contents] of plan) writeFileSync(join(directory, path), contents);
    assert.deepEqual(toolchainDrift(directory, planToolchainProjection(directory, changed)), []);
  });
});

test("child environments preserve the selected Node on Windows and POSIX", () => {
  const windows = pinnedNodeEnvironment("C:\\runtime\\node.exe", { Path: "C:\\ambient", marker: "keep" }, "win32");
  assert.equal(windows.Path, "C:\\runtime;C:\\ambient");
  assert.equal(windows.PATH, undefined);
  assert.equal(windows.npm_node_execpath, "C:\\runtime\\node.exe");
  assert.equal(windows.marker, "keep");
  assert.equal(pinnedNodeEnvironment("/runtime/bin/node", { PATH: "/ambient" }, "linux").PATH, "/runtime/bin:/ambient");
});

test("native manager detection rejects command shims and accepts native file headers", () => {
  temporary((directory) => {
    for (const [name, contents, accepted] of [
      ["script", Buffer.from("#!/bin/sh\nnode wrong-runtime\n"), false],
      ["cmd", Buffer.from("@echo off\r\n"), false],
      ["elf", Buffer.from("7f454c46", "hex"), true],
      ["pe", Buffer.from("4d5a9000", "hex"), true],
      ["macho", Buffer.from("cffaedfe", "hex"), true],
    ]) {
      const path = join(directory, name);
      writeFileSync(path, contents);
      assert.equal(isNativeExecutable(path), accepted, name);
    }
    assert.equal(isNativeExecutable(join(directory, "missing")), false);
  });
});

test("nested Lerna and lifecycle calls resolve the pinned native manager and reject Node-directory shadows", () => {
  temporary((directory) => {
    const nodeDirectory = join(directory, "runtime");
    const managerDirectory = join(directory, "manager");
    mkdirSync(nodeDirectory);
    mkdirSync(managerDirectory);
    const executable = join(managerDirectory, process.platform === "win32" ? "pnpm.exe" : "pnpm");
    const nodeExecutable = join(nodeDirectory, process.platform === "win32" ? "node.exe" : "node");
    writeFileSync(executable, "fixture, never executed");
    const env = pinnedPnpmEnvironment(nodeExecutable, executable, { PATH: "ambient", COREPACK_ROOT: "ambient-corepack" });
    assert.equal(env.PATH, [nodeDirectory, managerDirectory, "ambient"].join(delimiter));
    assert.equal(env.COREPACK_ROOT, undefined);
    assert.equal(env.npm_execpath, executable);
    assert.equal(env.npm_node_execpath, nodeExecutable);
    assert.equal(env.PUCK_PNPM_EXECUTABLE, executable);
    assert.throws(() => pinnedPnpmEnvironment(nodeExecutable, join(managerDirectory, "manager-other-name"), {}), /pnpm filename/u);
    writeFileSync(join(nodeDirectory, "pnpm.cmd"), "ambient shim");
    assert.throws(() => pinnedPnpmEnvironment(nodeExecutable, executable, {}), /competing manager/u);
  });
});

test("the pinned manager resolver checks exact native bytes and propagates selected Node", () => {
  const executable = fileURLToPath(new URL("../../.build/fixture-native-pnpm", import.meta.url));
  const environment = { PUCK_PNPM_EXECUTABLE: executable, PATH: "/ambient" };
  let probes = 0;
  assert.equal(resolvePinnedPnpm({ toolchain, environment,
    native: (path) => path === executable,
    probe: (path, env) => {
      probes++;
      assert.equal(path, executable);
      assert.equal(env.npm_node_execpath, process.execPath);
      assert.equal(env.NODE, process.execPath);
      return { status: 0, stdout: `${toolchain.pnpm}\n` };
    },
  }), executable);
  assert.equal(probes, 1);
  for (const result of [{ status: 0, stdout: "12.0.0" }, { status: 7, stdout: toolchain.pnpm }, { error: new Error("unavailable") }]) {
    assert.throws(() => assertPnpmVersion(result, toolchain.pnpm), /Expected exactly/u);
    assert.throws(() => resolvePinnedPnpm({ toolchain, environment, native: () => true, probe: () => result }), /Expected exactly/u);
  }
  assert.throws(() => resolvePinnedPnpm({ toolchain, environment, native: () => false }), /No installed native/u);
  assert.throws(() => resolvePinnedPnpm({ toolchain, environment: { PUCK_PNPM_EXECUTABLE: "pnpm.cmd" } }), /absolute native/u);
});
