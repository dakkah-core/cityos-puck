import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNodeVersion, loadToolchain, repositoryRoot } from "./toolchain.mjs";

export const nodeEngineManifests = [
  "package.json", "packages/core/package.json", "packages/create-puck-app/package.json",
  "recipes/react-router/package.json", "recipes/react-router-ai/package.json",
];

// Pure projection plan: --check and regression tests share exactly the write logic.
// Other manifest fields, workflow triggers, action refs and permissions are untouched.
export function planToolchainProjection(root = repositoryRoot, toolchain = loadToolchain(root)) {
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const plan = new Map([[".nvmrc", `${toolchain.node}\n`]]);
  for (const path of nodeEngineManifests) {
    const source = read(path);
    const manifest = JSON.parse(source);
    manifest.engines = { ...manifest.engines, node: toolchain.nodeEngine };
    if (path === "package.json") {
      manifest.packageManager = toolchain.packageManager;
      manifest.engines.pnpm = toolchain.pnpmEngine;
    }
    plan.set(path, JSON.stringify(manifest, null, 2) + "\n");
  }
  let workspace = read("pnpm-workspace.yaml");
  for (const [name, version] of Object.entries({
    "@types/node": toolchain.nodeTypes,
    typescript: toolchain.typescript,
    [toolchain.typescriptApi.identifier]: toolchain.typescriptApi.package,
  })) {
    // Only the default catalog uses JSON-quoted keys, as enforced by its reader.
    const prefix = `  ${JSON.stringify(name)}: `;
    const lines = workspace.split(/\r?\n/u);
    const positions = lines.flatMap((line, index) => line.startsWith(prefix) ? [index] : []);
    if (positions.length !== 1) throw new Error(`Expected one default catalog scalar for ${name}`);
    lines[positions[0]] = prefix + JSON.stringify(version);
    workspace = lines.join("\n");
  }
  const namedAlias = /(^  typescript-api:\r?\n(?:    #[^\n]*\r?\n)*    typescript: )"[^"\n]+"/mu;
  if (!namedAlias.test(workspace)) throw new Error("Missing isolated TypeScript API catalog");
  workspace = workspace.replace(namedAlias, (_match, prefix) => prefix + JSON.stringify(toolchain.typescriptApi.package));
  plan.set("pnpm-workspace.yaml", workspace);
  return plan;
}

export function toolchainDrift(root = repositoryRoot, plan = planToolchainProjection(root)) {
  return [...plan].filter(([path, expected]) =>
    readFileSync(resolve(root, path), "utf8").replaceAll("\r\n", "\n") !== expected.replaceAll("\r\n", "\n")
  ).map(([path]) => path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertNodeVersion();
  const mode = process.argv.slice(2);
  if (mode.length !== 1 || !["--check", "--write"].includes(mode[0])) {
    throw new Error("Usage: node scripts/toolchains/project-toolchain.mjs --check|--write");
  }
  const plan = planToolchainProjection();
  const drift = toolchainDrift(repositoryRoot, plan);
  if (mode[0] === "--write") {
    for (const path of drift) writeFileSync(resolve(repositoryRoot, path), plan.get(path));
  } else if (drift.length) {
    throw new Error(`Toolchain projections differ from config/toolchains/node-typescript.json: ${drift.join(", ")}`);
  }
}
