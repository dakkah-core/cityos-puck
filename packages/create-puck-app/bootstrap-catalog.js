import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import toolchainHelpers from "./toolchain.cjs";

export function loadBootstrapCatalog(base = new URL("./", import.meta.url)) {
  const source = {
    workspace: new URL("../../pnpm-workspace.yaml", base),
    core: new URL("../core/package.json", base),
    owner: new URL("../../package.json", base),
    toolchain: new URL("../../config/toolchains/node-typescript.json", base),
  };
  // Local readers follow source authority even when older packed snapshots exist.
  // Standalone readers use one coherent snapshot copied by scripts/generate.js.
  const selected = [source.workspace, source.core, source.owner].every((path) => existsSync(path)) ? source : {
    workspace: new URL("dependency-catalog.yaml", base),
    core: new URL("core-package.json", base),
    owner: new URL("workspace-package.json", base),
    toolchain: new URL("node-typescript.json", base),
  };
  const workspace = parse(readFileSync(selected.workspace, "utf8"));
  const toolchain = toolchainHelpers.deriveToolchain(JSON.parse(readFileSync(selected.toolchain, "utf8")));
  const owner = JSON.parse(readFileSync(selected.owner, "utf8"));
  toolchainHelpers.assertBootstrapToolchain(workspace, owner, toolchain);
  const contract = selected === source
    ? new URL("../../config/dependencies/plugin-ai.json", base)
    : new URL("plugin-ai-contract.json", base);
  return {
    workspace,
    core: JSON.parse(readFileSync(selected.core, "utf8")),
    owner,
    toolchain,
    nodeVersion: toolchain.node,
    pluginAiContract: JSON.parse(readFileSync(contract, "utf8")),
    patches: Object.fromEntries(Object.entries(workspace.patchedDependencies ?? {}).map(([selector, path]) => [selector, new URL(path, selected.workspace)])),
  };
}
