import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readDefaultCatalog } from "../toolchains/catalog-version.mjs";

const require = createRequire(import.meta.url);
const { adaptToolingApi } = require("../toolchains/tooling-api.cjs");
const policy = require("../../config/dependencies/tooling-api.json");
const catalog = readDefaultCatalog();

test("only the exact catalog-selected API consumers own TS6; other peers stay intact", () => {
  for (const [name, key] of Object.entries(policy.compilerApi.bindings)) {
    assert.match(catalog[key], /^\d+\.\d+\.\d+$/u, key);
    const original = { name, version: catalog[key], dependencies: { retained: "1" }, peerDependencies: { typescript: ">=4 <6.1", retained: "2" }, peerDependenciesMeta: { typescript: { optional: true }, retained: { optional: true } } };
    const input = structuredClone(original);
    const result = adaptToolingApi(input, catalog, policy);
    assert.equal(result.dependencies.typescript, catalog["typescript-api"], name);
    assert.equal(result.dependencies.retained, "1");
    assert.deepEqual(result.peerDependencies, { retained: "2" });
    assert.deepEqual(result.peerDependenciesMeta, { retained: { optional: true } });
    assert.deepEqual(input, original);
    const unselected = { ...original, version: "0.0.0" };
    assert.equal(adaptToolingApi(unselected, catalog, policy), unselected);
  }
  const firstParty = { name: "@cityos-core/puck", version: "0.23.0-cityos.3", devDependencies: { typescript: "catalog:" } };
  assert.equal(adaptToolingApi(firstParty, catalog, policy), firstParty);
  assert.throws(() => adaptToolingApi({ name: "tsup", version: catalog.tsup }, { ...catalog, "typescript-api": catalog.typescript }, policy), /COMPILER_API_CATALOG_INVALID/u);
});

test("ESLint peer changes reject source drift and leave unrelated peers and versions intact", () => {
  for (const [name, binding] of Object.entries(policy.eslint.peerBindings)) {
    const input = { name, version: catalog[binding.versionCatalog], peerDependencies: { eslint: binding.upstreamRange, retained: "*" } };
    assert.deepEqual(adaptToolingApi(input, catalog, policy).peerDependencies, { eslint: `${binding.upstreamRange} || ${catalog.eslint}`, retained: "*" });
    assert.equal(input.peerDependencies.eslint, binding.upstreamRange);
    assert.throws(() => adaptToolingApi({ ...input, peerDependencies: { eslint: "*" } }, catalog, policy), /ESLINT_ADAPTATION_SOURCE_DRIFT/u);
    const otherVersion = { ...input, version: "0.0.0" };
    assert.equal(adaptToolingApi(otherVersion, catalog, policy), otherVersion);
  }
});

test("all compatibility selectors agree with the active catalog family", () => {
  const workspace = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  for (const [name, key] of Object.entries(policy.compilerApi.bindings)) {
    assert.ok(workspace.includes(`"${name}@${catalog[key]}>typescript": "catalog:typescript-api"`), name);
    assert.ok(workspace.includes(`"${name}@${catalog[key]}":\n    dependencies:\n      typescript: "catalog:typescript-api"`), name);
  }
  assert.ok(workspace.includes(`"eslint-config-next@${catalog["eslint-config-next"]}>typescript-eslint": "catalog:"`));
});
