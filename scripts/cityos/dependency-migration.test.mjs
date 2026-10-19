import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { materializeManifest, resolveCatalog } from "../../packages/create-puck-app/manifest-catalog.js";
import { readDefaultCatalog } from "../toolchains/catalog-version.mjs";
import { formatSource } from "./format-source.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const json = (path) => JSON.parse(read(path));
const catalog = readDefaultCatalog();
const core = json("packages/core/package.json");

function* files(directory) {
  for (const entry of readdirSync(new URL(directory, root), { withFileTypes: true })) {
    if (["node_modules", "dist", ".next", "build"].includes(entry.name)) continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

test("bootstrap catalog readers resolve scoped names and reject ambiguous syntax", () => {
  assert.equal(readDefaultCatalog('catalog:\n  "@scope/pkg": "1.2.3"\ncatalogs:\n')["@scope/pkg"], "1.2.3");
  assert.throws(() => readDefaultCatalog('catalog:\n  pkg: latest\n'), /Unsupported/u);
  assert.throws(() => readDefaultCatalog('catalog:\n  "pkg": "1"\n  "pkg": "2"\n'), /Duplicate/u);
  assert.throws(() => readDefaultCatalog("packages: []"), /Missing/u);
});

test("standalone manifests materialize default, named, optional, and peer catalogs without mutation", () => {
  const input = { dependencies: { react: "catalog:" }, devDependencies: { typescript: "catalog:" }, optionalDependencies: { yaml: "catalog:" }, peerDependencies: { react: "catalog:peers" } };
  const workspace = { catalog, catalogs: { peers: { react: `^${catalog.react}` } } };
  const result = materializeManifest(input, workspace);
  assert.equal(result.dependencies.react, catalog.react);
  assert.equal(result.devDependencies.typescript, catalog.typescript);
  assert.equal(result.optionalDependencies.yaml, catalog.yaml);
  assert.equal(result.peerDependencies.react, `^${catalog.react}`);
  assert.equal(input.dependencies.react, "catalog:");
  assert.throws(() => resolveCatalog("missing", "catalog:", workspace), /Missing concrete/u);
  assert.throws(() => materializeManifest({ dependencies: { core: "workspace:*" } }, workspace), /Standalone template/u);
});

test("every standalone recipe emits concrete public versions and the exact owned source identity", () => {
  for (const recipe of ["next", "next-ai", "react-router", "react-router-ai"]) {
    const source = read(`packages/create-puck-app/templates/${recipe}/package.json.hbs`)
      .replaceAll("{{appName}}", "catalog-regression")
      .replaceAll("{{puckVersion}}", `npm:${core.name}@${core.version}`)
      .replaceAll("{{puckSourceVersion}}", core.version)
      .replaceAll("{{packageManager}}", json("package.json").packageManager)
      .replaceAll("{{nodeEngine}}", json("package.json").engines.node);
    const result = materializeManifest(JSON.parse(source), { catalog });
    assert.equal(result.dependencies["@puckeditor/core"], `npm:${core.name}@${core.version}`);
    assert.equal(result.devDependencies.typescript, catalog.typescript);
    assert.equal(result.engines.node, json("package.json").engines.node);
    assert.doesNotMatch(JSON.stringify(result), /catalog:|workspace:/u);
    assert.equal(read(`packages/create-puck-app/templates/${recipe}/.nvmrc.hbs`).trim(), "{{nodeVersion}}");
  }
});

test("all public dependency declarations use their owning catalogs", () => {
  const manifests = ["package.json", ...["packages", "apps", "recipes"].flatMap((directory) =>
    readdirSync(new URL(directory, root), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `${directory}/${entry.name}/package.json`)
  )];
  for (const path of manifests) {
    const manifest = json(path);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, reference] of Object.entries(manifest[field] ?? {})) {
        if (reference.startsWith("workspace:")) {
          if (name === "@puckeditor/core") assert.equal(reference, `workspace:${core.name}@*`, path);
          continue;
        }
        assert.equal(reference, field === "peerDependencies" ? "catalog:peers" : "catalog:", `${path}/${name}`);
        assert.ok(catalog[name], `Missing catalog input ${path}/${name}`);
      }
    }
  }
});

test("React Router framework packages and both recipe consumers use one catalog family", () => {
  for (const name of ["@react-router/dev", "@react-router/node", "@react-router/serve"]) {
    assert.equal(catalog[name], catalog["react-router"], name);
  }
  for (const recipe of ["react-router", "react-router-ai"]) {
    const manifest = json(`recipes/${recipe}/package.json`);
    assert.equal(manifest.dependencies["react-router"], "catalog:");
    for (const name of ["@react-router/dev", "@react-router/node", "@react-router/serve"]) {
      assert.equal(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name], "catalog:", `${recipe}/${name}`);
    }
  }
});

test("TypeScript API compatibility stays inside exact third-party consumers", () => {
  assert.match(catalog.typescript, /^7\.\d+\.\d+$/u);
  assert.match(catalog["typescript-api"], /^npm:@typescript\/typescript6@6\./u);
  const workspace = read("pnpm-workspace.yaml");
  const scoped = [...workspace.matchAll(/^  "([^"\n]+)>typescript": "catalog:typescript-api"$/gmu)];
  assert.ok(scoped.length > 0);
  for (const [, selector] of scoped) assert.match(selector, /^(?:ts-jest|tsup|typescript-eslint|ts-api-utils|twoslash|tsconfck|@typescript-eslint\/[a-z-]+)@\d+\.\d+\.\d+$/u);
  assert.doesNotMatch(workspace, /^  (?:"typescript"|typescript): "catalog:typescript-api"$/mu);
  const require = createRequire(import.meta.url);
  const config = require("../../packages/core/jest.config.cjs");
  const transformer = config.transform["^.+\\.[tj]sx?$"][1];
  assert.equal(transformer.compiler, "typescript-api");
  assert.equal(transformer.diagnostics, false);
  assert.match(core.scripts.test, /typecheck\.mjs --noEmit && jest/u);
  assert.equal(core.devDependencies["ts-node"], undefined);
});

test("first-party and bootstrap TypeScript configs avoid removed compiler options", () => {
  for (const path of ["packages", "apps", "recipes"].flatMap((directory) => [...files(directory)])) {
    if (!/(?:tsconfig\/[^/]+\.json|tsconfig\.json(?:\.hbs)?)$/u.test(path)) continue;
    const options = json(path).compilerOptions ?? {};
    assert.ok(!["node", "node10", "classic"].includes(options.moduleResolution), path);
    assert.notEqual(String(options.target).toLowerCase(), "es5", path);
    assert.equal(options.baseUrl, undefined, path);
    assert.equal(options.plugins, undefined, path);
    for (const targets of Object.values(options.paths ?? {})) {
      for (const target of targets) assert.match(target, /^(?:\.\.?\/|\/)/u, path);
    }
  }
  for (const path of ["apps/demo/next.config.js", "apps/docs/next.config.mjs", "recipes/next/next.config.js", "recipes/next-ai/next.config.js"]) {
    assert.match(read(path), /useTypeScriptCli: true/u, path);
  }
});

test("Prettier 3 formatting awaits both configuration and formatting results", async () => {
  const calls = [];
  const formatted = await formatSource({
    async resolveConfig(path) { calls.push(path); return { semi: false }; },
    async format(source, options) { calls.push(options); return source + "\n"; },
  }, "const answer = 42", "fixture.ts");
  assert.equal(formatted, "const answer = 42\n");
  assert.deepEqual(calls, ["fixture.ts", { semi: false, filepath: "fixture.ts" }]);
  await assert.rejects(formatSource({ resolveConfig: async () => null, format: async () => { throw new Error("formatter failed"); } }, "", "fixture.ts"), /formatter failed/u);
});

test("Nextra content migration preserves every MDX route and interactive example body", () => {
  const fixture = json("scripts/cityos/fixtures/docs-route-migration.json");
  const digest = (source) => createHash("sha256").update(source.replace(/\s+/gu, " ").trim()).digest("hex");
  for (const { path, sha256 } of fixture.routes) {
    // Git checkouts may use CRLF. Normalize transport newlines before matching
    // extracted examples; the retained source/content hashes stay unchanged.
    let source = read(`apps/docs/content/${path}`).replaceAll("\r\n", "\n");
    const match = /^import \{ (Example\d+(?:, Example\d+)*) \} from "\.\/([^"\n]+)\.examples";\n/mu.exec(source);
    if (match) {
      const examples = read(`apps/docs/content/${path.replace(/[^/]+$/u, "")}${match[2]}.examples.tsx`).replaceAll("\r\n", "\n");
      assert.ok(examples.startsWith('"use client";'), path);
      for (const name of match[1].split(", ")) {
        const body = new RegExp(`export function ${name}\\(\\) \\{\\n  return \\(\\n([\\s\\S]*?)\\n  \\);\\n\\}`).exec(examples);
        assert.ok(body, `${path}/${name}`);
        source = source.replace(`<${name} />`, body[1]);
      }
      source = source.replace(match[0], "");
    }
    assert.equal(digest(source), sha256, path);
  }
});
