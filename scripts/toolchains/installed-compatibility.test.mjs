// Run only after the parent admits and installs this fork's dependency graph.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { readDefaultCatalog } from "./catalog-version.mjs";
import { assertNodeVersion, loadToolchain } from "./toolchain.mjs";

const catalog = readDefaultCatalog();
const toolchain = loadToolchain();
assertNodeVersion(toolchain);
const rootRequire = createRequire(new URL("../../package.json", import.meta.url));
const coreRequire = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const loadManifest = (require, name) => {
  const path = require.resolve(`${name}/package.json`);
  return { path, value: JSON.parse(readFileSync(path, "utf8")) };
};
const assertIsolatedApi = (require) => {
  const { path: manifestPath, value: manifest } = loadManifest(require, "typescript");
  assert.equal(`npm:${manifest.name}@${manifest.version}`, toolchain.typescriptApi.package);
  const api = require("typescript");
  // This pinned wrapper delegates to its own declared TypeScript 6 package.
  // Verify both identities instead of equating the two package versions.
  assert.equal(manifest.dependencies["@typescript/old"], "npm:typescript@^6");
  const wrapperRequire = createRequire(resolve(dirname(manifestPath), manifest.main));
  const implementation = loadManifest(wrapperRequire, "@typescript/old").value;
  assert.equal(implementation.name, "typescript");
  assert.match(implementation.version, /^6\./u);
  assert.equal(api, wrapperRequire("@typescript/old"));
  assert.equal(api.version, implementation.version);
  assert.equal(typeof api.createProgram, "function");
  return api;
};

test("the installed first-party compiler is the catalog TS7 CLI", () => {
  const { path, value } = loadManifest(rootRequire, "typescript");
  assert.equal(value.version, toolchain.typescript);
  assert.equal(catalog.typescript, toolchain.typescript);
  assert.match(value.version, /^7\./u);
  const bin = typeof value.bin === "string" ? value.bin : value.bin.tsc;
  const result = spawnSync(process.execPath, [resolve(dirname(path), bin), "--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `Version ${toolchain.typescript}`);
});

for (const name of ["ts-jest", "tsup"]) {
  test(`${name} receives the isolated compiler API while first-party TS7 stays selected`, () => {
    const require = createRequire(coreRequire.resolve(name));
    const api = assertIsolatedApi(require);
    assert.equal(catalog[toolchain.typescriptApi.identifier], toolchain.typescriptApi.package);
    assert.equal(typeof api.createProgram, "function");
    assert.equal(loadManifest(rootRequire, "typescript").value.version, toolchain.typescript);
  });
}

test("ts-jest performs an actual isolated TSX transformation with its configured API alias", () => {
  const { default: tsJest } = coreRequire("ts-jest");
  const transformer = tsJest.createTransformer({ compiler: "typescript-api", diagnostics: false, tsconfig: { isolatedModules: true, jsx: "react-jsx", target: "ES2022" } });
  const result = transformer.process("export const Component = () => <span>TS6 transformer</span>;", "compatibility.tsx", {
    config: { rootDir: fileURLToPath(new URL("../../packages/core/", import.meta.url)) },
    configString: "cityos-ts6-transform-only",
    instrument: false,
    cacheFS: new Map(),
    supportsStaticESM: false,
    supportsDynamicImport: true,
    supportsExportNamespaceFrom: true,
    supportsTopLevelAwait: true,
  });
  assert.match(typeof result === "string" ? result : result.code, /TS6 transformer/u);
});

test("documentation and recipe API tools use their exact isolated compiler binding", async () => {
  for (const name of ["twoslash", "tsconfck"]) {
    const require = createRequire(import.meta.resolve(name));
    const api = assertIsolatedApi(require);
    assert.equal(typeof api.createProgram, "function", name);
  }
  const { createTwoslasher } = await import("twoslash");
  const result = createTwoslasher({ compilerOptions: { types: [] } })(
    '// @errors: 2322\nconst value: number = "wrong";', "ts"
  );
  assert.ok(result.errors.some((error) => error.code === 2322));
  const directory = mkdtempSync(join(tmpdir(), "puck-tsconfck-api-"));
  try {
    const config = join(directory, "tsconfig.json");
    writeFileSync(config, JSON.stringify({ compilerOptions: { strict: true }, files: ["fixture.ts"] }));
    writeFileSync(join(directory, "fixture.ts"), "export const value = 42;\n");
    const { parseNative } = await import("tsconfck");
    const parsed = await parseNative(config);
    assert.equal(parsed.result.options.strict, true);
    assert.equal(parsed.result.fileNames.length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(loadManifest(rootRequire, "typescript").value.version, toolchain.typescript);
});

test("ESLint's TypeScript parser can parse a typed fixture through its scoped API", () => {
  const configRequire = createRequire(new URL("../../packages/eslint-config-custom/package.json", import.meta.url));
  const eslintRequire = createRequire(configRequire.resolve("eslint-config-next"));
  const toolingRequire = createRequire(eslintRequire.resolve("typescript-eslint"));
  assert.equal(loadManifest(toolingRequire, "typescript-eslint").value.version, catalog["typescript-eslint"]);
  const parser = toolingRequire("@typescript-eslint/parser");
  const result = parser.parseForESLint("const value: number = 42;", { ecmaVersion: "latest", sourceType: "module" });
  assert.equal(result.ast.body[0].type, "VariableDeclaration");
  const parserRequire = createRequire(toolingRequire.resolve("@typescript-eslint/parser"));
  for (const apiRequire of [toolingRequire, parserRequire]) {
    const api = assertIsolatedApi(apiRequire);
    assert.equal(typeof api.createProgram, "function");
  }
  const estreeRequire = createRequire(parserRequire.resolve("@typescript-eslint/typescript-estree"));
  const apiUtilsRequire = createRequire(estreeRequire.resolve("ts-api-utils"));
  assertIsolatedApi(apiUtilsRequire);
});

test("the complete Next/Turbo flat config runs legacy rule paths under catalog ESLint", async () => {
  const { ESLint } = rootRequire("eslint");
  const { default: config } = await import("../../packages/eslint-config-custom/index.mjs");
  assert.equal(loadManifest(rootRequire, "eslint").value.version, catalog.eslint);
  const fixtures = [
    ["react/jsx-equals-spacing", 'export const A = () => <span aria-label = "label" />;', ["error", "never"]],
    ["import/no-anonymous-default-export", "export default {};", "error"],
    ["import/order", 'import z from "zeta";\nimport a from "alpha";\nexport {z, a};', ["error", { alphabetize: { order: "asc" } }]],
    ["jsx-a11y/alt-text", "export const A = () => <img />;", "error"],
    ["jsx-a11y/aria-props", 'export const A = () => <div aria-unknown="x" />;', "error"],
    ["jsx-a11y/aria-proptypes", 'export const A = () => <div aria-hidden="invalid" />;', "error"],
    ["jsx-a11y/aria-unsupported-elements", 'export const A = () => <meta aria-label="x" />;', "error"],
    ["jsx-a11y/role-has-required-aria-props", 'export const A = () => <div role="checkbox" />;', "error"],
    ["jsx-a11y/role-supports-aria-props", 'export const A = () => <div role="button" aria-checked="true" />;', "error"],
  ];
  for (const [rule, source, setting] of fixtures) {
    const linter = new ESLint({ cwd: fileURLToPath(new URL("../../", import.meta.url)), overrideConfigFile: true, overrideConfig: [...config, { rules: { [rule]: setting } }] });
    const [result] = await linter.lintText(source, { filePath: "compatibility.tsx" });
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    assert.ok(result.messages.some((message) => message.ruleId === rule), `${rule}: ${JSON.stringify(result.messages)}`);
  }
});

test("both React Router recipes resolve the catalog family and the public APIs their routes use", async () => {
  for (const recipe of ["react-router", "react-router-ai"]) {
    const require = createRequire(new URL(`../../recipes/${recipe}/package.json`, import.meta.url));
    for (const name of ["react-router", "@react-router/node", "@react-router/serve", "@react-router/dev"]) {
      assert.equal(loadManifest(require, name).value.version, catalog["react-router"], `${recipe}/${name}`);
    }
    const load = (name) => import(pathToFileURL(require.resolve(name)).href);
    const router = await load("react-router");
    for (const name of ["isRouteErrorResponse", "useFetcher", "useLoaderData"]) assert.equal(typeof router[name], "function", name);
    for (const name of ["Links", "Meta", "Outlet", "Scripts", "ScrollRestoration"]) assert.ok(router[name], name);
    const routes = await load("@react-router/dev/routes");
    assert.equal(typeof routes.route, "function");
    assert.equal(typeof routes.index, "function");
    assert.equal(typeof (await load("@react-router/dev/vite")).reactRouter, "function");
    assert.equal(typeof (await load("@react-router/node")).createRequestListener, "function");
    // The serve entrypoint starts a server: check its package identity above,
    // and leave actual launch/shutdown to the separately admitted recipe smoke.
  }
});
