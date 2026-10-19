import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { materializeManifest } from "../../packages/create-puck-app/manifest-catalog.js";
import { prepareBootstrapIntegration, requireRecipePackageManager, verifyIntegrationPatch } from "../../packages/create-puck-app/bootstrap-integration.js";
import { readDefaultCatalog } from "../toolchains/catalog-version.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const json = (path) => JSON.parse(read(path));
const require = createRequire(import.meta.url);
const { retargetPluginAiPeer } = require("../../packages/create-puck-app/plugin-ai-peer.cjs");
const contract = json("config/dependencies/plugin-ai.json");
const core = json("packages/core/package.json");
const catalog = readDefaultCatalog();

test("the exact resolver hook retargets only the inspected plugin peer before resolution", () => {
  const original = { name: contract.upstreamPackage, version: contract.upstreamVersion, peerDependencies: { "@puckeditor/core": "^0", react: "^18.0.0 || ^19.0.0" } };
  const result = retargetPluginAiPeer(original, contract);
  assert.equal(contract.upstreamVersion, catalog[contract.upstreamPackage]);
  assert.equal(contract.corePackage, core.name);
  assert.equal(contract.coreSourceVersion, core.version);
  assert.deepEqual(result.peerDependencies, { [core.name]: core.version, react: original.peerDependencies.react });
  assert.equal(original.peerDependencies["@puckeditor/core"], "^0");
  assert.equal(retargetPluginAiPeer(result, contract), result);
  assert.throws(() => retargetPluginAiPeer({ ...original, peerDependencies: { "@puckeditor/core": "^1" } }, contract), /Unexpected/u);
  const other = { ...original, version: "99.0.0" };
  assert.equal(retargetPluginAiPeer(other, contract), other);
  const rootHook = require("../../.pnpmfile.cjs");
  assert.deepEqual(rootHook.hooks.readPackage(original), result);
});

test("the exact patch covers both runtimes, both declarations, and the installed peer manifest", () => {
  const patch = read(contract.patchPath);
  assert.equal(createHash("sha256").update(patch).digest("hex"), contract.patchSha256);
  assert.equal(verifyIntegrationPatch(patch, contract), patch);
  assert.throws(() => verifyIntegrationPatch(patch + "\n", contract), /patch bytes differ/u);
  for (const path of ["package.json", "dist/index.js", "dist/index.mjs", "dist/index.d.ts", "dist/index.d.mts"]) {
    assert.ok(patch.includes(`diff --git a/${path} b/${path}`), path);
  }
  assert.ok(patch.includes(`+declare module "${core.name}"`));
  assert.ok(patch.includes(`+    "${core.name}": "${core.version}"`));
  for (const line of patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))) {
    assert.ok(!/from ["']@puckeditor\/core["']|require\(["']@puckeditor\/core["']\)|declare module ["']@puckeditor\/core["']/u.test(line), line);
  }
  assert.ok(read("pnpm-workspace.yaml").includes(`"${contract.upstreamPackage}@${contract.upstreamVersion}": "${contract.patchPath}"`));
});

test("both AI bootstraps retain the owned prerelease and carry the exact hook and patch registration", () => {
  for (const recipe of ["next-ai", "react-router-ai"]) {
    const source = read(`packages/create-puck-app/templates/${recipe}/package.json.hbs`)
      .replaceAll("{{appName}}", "owned-ai-recipe")
      .replaceAll("{{puckVersion}}", `npm:${core.name}@${core.version}`)
      .replaceAll("{{puckSourceVersion}}", core.version)
      .replaceAll("{{packageManager}}", json("package.json").packageManager)
      .replaceAll("{{nodeEngine}}", json("package.json").engines.node);
    const manifest = materializeManifest(JSON.parse(source), { catalog });
    const selector = `${contract.upstreamPackage}@${contract.upstreamVersion}`;
    const workspace = { patchedDependencies: { [selector]: contract.patchPath } };
    const integration = prepareBootstrapIntegration(manifest, workspace, core, contract);
    assert.deepEqual(integration.workspace.patchedDependencies, { [selector]: integration.targetPath });
    assert.ok(integration.targetPath.startsWith(".cityos/patches/"));
    assert.match(integration.hook, /readPackage/u);
    assert.match(integration.hook, /plugin-ai-peer\.cjs/u);
    assert.equal(manifest.dependencies[core.name], core.version);
    assert.throws(() => prepareBootstrapIntegration(manifest, {}, core, contract), /Missing exact/u);
    assert.throws(() => prepareBootstrapIntegration({ ...manifest, dependencies: { ...manifest.dependencies, [core.name]: "0.23.0" } }, workspace, core, contract), /same owned package/u);
    assert.throws(() => prepareBootstrapIntegration(manifest, workspace, core, { ...contract, upstreamVersion: "0.0.0" }), /source versions/u);
  }
  requireRecipePackageManager(true, "pnpm");
  requireRecipePackageManager(false, "npm");
  requireRecipePackageManager(false, "yarn");
  assert.throws(() => requireRecipePackageManager(true, "npm"), /--use-pnpm/u);
  assert.throws(() => requireRecipePackageManager(true, "yarn"), /--use-pnpm/u);
});

test("heading and rich-text consumers no longer depend on the incompatible peer packages", () => {
  assert.equal(json("packages/plugin-heading-analyzer/package.json").dependencies["react-from-json"], undefined);
  assert.equal(core.dependencies["@tiptap/html"], undefined);
  assert.equal(core.dependencies["@tiptap/static-renderer"], "catalog:");
  assert.equal(core.dependencies["happy-dom"], undefined);
  assert.equal(core.devDependencies["happy-dom"], "catalog:");
  assert.equal(catalog["happy-dom"], "21.0.3");
  assert.equal(catalog["@tiptap/static-renderer"], catalog["@tiptap/core"]);
  assert.equal(catalog["react-from-json"], undefined);
  assert.equal(catalog["@tiptap/html"], undefined);
  assert.equal(catalog["deep-diff"], "1.0.2");
});
