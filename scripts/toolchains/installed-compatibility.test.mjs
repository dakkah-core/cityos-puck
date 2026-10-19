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
  const eslintRequire = createRequire(rootRequire.resolve("eslint-config-next"));
  const parser = eslintRequire("@typescript-eslint/parser");
  const result = parser.parseForESLint("const value: number = 42;", { ecmaVersion: "latest", sourceType: "module" });
  assert.equal(result.ast.body[0].type, "VariableDeclaration");
  const parserRequire = createRequire(eslintRequire.resolve("@typescript-eslint/parser"));
  assert.equal(typeof parserRequire("typescript").createProgram, "function");
});
