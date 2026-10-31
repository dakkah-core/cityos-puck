import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { loadToolchain } from "../toolchains/toolchain.mjs";
import { toolchainDrift } from "../toolchains/project-toolchain.mjs";
import { readDefaultCatalog } from "../toolchains/catalog-version.mjs";

const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const nodeVersion = readFileSync(new URL(".nvmrc", root), "utf8").trim();
const toolchain = loadToolchain();

test("the fork selects an exact Node 26 runtime", () => {
  assert.match(nodeVersion, /^26\.\d+\.\d+$/u);
  assert.equal(nodeVersion, toolchain.node);
  assert.equal(manifest.engines.node, toolchain.nodeEngine);
  assert.deepEqual(toolchainDrift(), []);
});

test("all Node workflow steps derive their runtime from the fork selector", () => {
  const directory = new URL(".github/workflows/", root);
  let steps = 0;
  for (const name of readdirSync(directory).filter(name => /\.ya?ml$/u.test(name))) {
    const source = readFileSync(new URL(name, directory), "utf8");
    for (const step of source.split(/^      - /mu).slice(1)) {
      if (/uses:\s+pnpm\/action-setup@/u.test(step)) {
        assert.doesNotMatch(step, /^\s+version:/mu, `${name} must derive pnpm from packageManager`);
      }
    }
    const count = [...source.matchAll(/^\s+(?:-\s+)?uses:\s+actions\/setup-node@/gmu)].length;
    if (!count) continue;
    assert.doesNotMatch(source, /^\s+node-version:/mu, `${name} must not copy a Node version`);
    assert.equal([...source.matchAll(/^\s+node-version-file:\s*["']?\.nvmrc["']?\s*$/gmu)].length, count, name);
    assert.equal([...source.matchAll(/node scripts\/toolchains\/project-toolchain\.mjs --check/gu)].length, count, name);
    assert.doesNotMatch(source, /^\s+(?:run:\s*)?pnpm\s/mu, `${name} must use the pinned manager runner`);
    assert.doesNotMatch(source, /^\s+cache:\s*["']?pnpm/mu, `${name} must not invoke an ambient manager through setup-node caching`);
    steps += count;
  }
  assert.ok(steps > 0, "The runtime selector guard must inspect actual workflow steps");
});

test("the fork pins pnpm 12 as its package manager", () => {
  assert.match(manifest.packageManager, /^pnpm@12\.\d+\.\d+$/u);
  assert.equal(manifest.packageManager, toolchain.packageManager);
  assert.equal(manifest.engines.pnpm, toolchain.pnpmEngine);
});

test("toolchain migration preserves the CityOS fork and public integration entry", () => {
  const core = JSON.parse(readFileSync(new URL("packages/core/package.json", root), "utf8"));
  assert.equal(core.name, "@cityos-core/puck");
  assert.match(core.version, /^\d+\.\d+\.\d+-cityos\.\d+$/u);
  assert.ok(core.exports["./cityos"]);
  assert.equal(core.engines.node, manifest.engines.node);
});

test("compiler, declarations and isolated API aliases derive exact pins from the toolchain catalog", () => {
  const catalog = readDefaultCatalog();
  assert.equal(catalog.typescript, toolchain.typescript);
  assert.equal(catalog["@types/node"], toolchain.nodeTypes);
  assert.equal(catalog[toolchain.typescriptApi.identifier], toolchain.typescriptApi.package);
  const workspace = readFileSync(new URL("pnpm-workspace.yaml", root), "utf8").replaceAll("\r\n", "\n");
  assert.match(workspace, new RegExp(`^  typescript-api:\\n(?:    #[^\\n]*\\n)*    typescript: ${JSON.stringify(toolchain.typescriptApi.package).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "mu"));
  assert.doesNotMatch(readFileSync(new URL("scripts/toolchains/typecheck.mjs", root), "utf8"), /\.nvmrc/u);
  assert.doesNotMatch(readFileSync(new URL("packages/create-puck-app/bootstrap-catalog.js", root), "utf8"), /\.nvmrc/u);
});

test("portable selectors verify exact Node and repository manager calls use the pinned runner", () => {
  const read = (path) => readFileSync(new URL(path, root), "utf8");
  const powershell = read("scripts/toolchains/select-workspace-node.ps1");
  const bash = read("scripts/toolchains/select-workspace-node.sh");
  assert.ok(powershell.includes("config/toolchains/node-typescript.json"));
  assert.ok(powershell.includes('"v$puckExpectedVersion"'));
  assert.ok(powershell.includes("Set-Alias -Name node -Value $puckSelectedNode"));
  assert.ok(bash.includes('"$(node --version)" == "$puck_expected"'));
  assert.ok(bash.includes("resolve-workspace-node.mjs"));
  for (const source of [powershell, bash, read("scripts/toolchains/resolve-workspace-node.mjs"), read("packages/create-puck-app/pinned-pnpm.mjs")]) {
    assert.doesNotMatch(source, /C:[/\\]cityos|26\.12\.0|12\.14\.0|\.nvmrc/u);
  }
  for (const directory of ["packages", "apps", "recipes"]) {
    for (const entry of readdirSync(new URL(`${directory}/`, root), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const path = `${directory}/${entry.name}/package.json`;
      const pkg = JSON.parse(read(path));
      for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
        assert.doesNotMatch(command, /(?:^|&&\s+|\|\s+|xargs\s+)pnpm\s/u, `${path}/${name}`);
      }
    }
  }
  for (const [name, command] of Object.entries(manifest.scripts)) {
    assert.doesNotMatch(command, /(?:^|&&\s+|\|\s+|xargs\s+)pnpm\s/u, `root/${name}`);
  }
  assert.doesNotMatch(read("scripts/publish.sh"), /(?:^|&&\s+)pnpm\s/mu);
  assert.doesNotMatch(read(".github/scripts/run-recorded-check.sh"), /command=\(pnpm\s/u);
  assert.ok(read("packages/create-puck-app/index.js").includes('runPinnedPnpm(["install"]'));
});
