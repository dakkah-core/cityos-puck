// Run only after the parent admits and installs this fork's dependency graph.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
    const api = require("typescript");
    assert.equal(`npm:@typescript/typescript6@${api.version}`, toolchain.typescriptApi.package);
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
    const api = apiRequire("typescript");
    assert.equal(`npm:@typescript/typescript6@${api.version}`, toolchain.typescriptApi.package);
    assert.equal(typeof api.createProgram, "function");
  }
  const estreeRequire = createRequire(parserRequire.resolve("@typescript-eslint/typescript-estree"));
  const apiUtilsRequire = createRequire(estreeRequire.resolve("ts-api-utils"));
  assert.equal(`npm:@typescript/typescript6@${apiUtilsRequire("typescript").version}`, toolchain.typescriptApi.package);
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
