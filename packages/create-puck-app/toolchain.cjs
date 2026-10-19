// Shared by source tools and the packed bootstrap. All exact pins come from JSON.
function deriveToolchain(catalog) {
  if (catalog.schemaVersion !== "cityos.puck-node-typescript-toolchain.v1") {
    throw new Error("Unsupported Puck toolchain catalog");
  }
  for (const key of ["node", "nodeTypes", "typescript", "pnpm"]) {
    if (!/^\d+\.\d+\.\d+$/u.test(catalog[key] ?? "")) {
      throw new Error(`Toolchain ${key} must be an exact stable version`);
    }
  }
  const api = catalog.typescriptApi;
  if (api?.identifier !== "typescript-api" || !/^npm:@typescript\/typescript6@6\.\d+\.\d+$/u.test(api.package ?? "")) {
    throw new Error("Expected the isolated third-party TypeScript API alias");
  }
  const nodeMajor = Number(catalog.node.split(".")[0]);
  const pnpmMajor = Number(catalog.pnpm.split(".")[0]);
  if (Number(catalog.nodeTypes.split(".")[0]) !== nodeMajor) {
    throw new Error("Node declarations must match the catalog runtime major");
  }
  return {
    ...catalog,
    nodeEngine: `>=${nodeMajor}.0.0 <${nodeMajor + 1}.0.0`,
    pnpmEngine: `>=${pnpmMajor}.0.0 <${pnpmMajor + 1}.0.0`,
    packageManager: `pnpm@${catalog.pnpm}`,
  };
}

function assertBootstrapToolchain(workspace, owner, toolchain) {
  if (owner.packageManager !== toolchain.packageManager || owner.engines?.node !== toolchain.nodeEngine ||
      owner.engines?.pnpm !== toolchain.pnpmEngine ||
      workspace.catalog?.typescript !== toolchain.typescript || workspace.catalog?.["@types/node"] !== toolchain.nodeTypes ||
      workspace.catalog?.[toolchain.typescriptApi.identifier] !== toolchain.typescriptApi.package ||
      workspace.catalogs?.[toolchain.typescriptApi.identifier]?.typescript !== toolchain.typescriptApi.package) {
    throw new Error("Bootstrap snapshots differ from the canonical toolchain catalog");
  }
}

module.exports = { deriveToolchain, assertBootstrapToolchain };
