import { createHash } from "node:crypto";

export function requireRecipePackageManager(usesPuckAi, packageManager) {
  if (usesPuckAi && packageManager !== "pnpm") {
    throw new Error("AI recipes require pnpm for the CityOS integration patch. Use --use-pnpm.");
  }
}

export function prepareBootstrapIntegration(manifest, workspace, core, contract) {
  const version = manifest.dependencies?.[contract.upstreamPackage];
  if (!version) return undefined;
  const selector = `${contract.upstreamPackage}@${version}`;
  if (version !== contract.upstreamVersion || contract.corePackage !== core.name || contract.coreSourceVersion !== core.version) {
    throw new Error("AI recipe source versions do not match the exact CityOS integration patch");
  }
  if (manifest.dependencies[core.name] !== core.version || manifest.dependencies["@puckeditor/core"] !== `npm:${core.name}@${core.version}`) {
    throw new Error("AI recipe must resolve its core imports and cloud-client types to the same owned package");
  }
  const sourcePath = workspace.patchedDependencies?.[selector];
  if (sourcePath !== contract.patchPath) throw new Error(`Missing exact integration patch for ${selector}`);
  const targetPath = `.cityos/patches/${sourcePath.split("/").at(-1)}`;
  return {
    selector,
    targetPath,
    workspace: { packages: ["."], patchedDependencies: { [selector]: targetPath } },
    hook: 'const { retargetPluginAiPeer } = require("./.cityos/plugin-ai-peer.cjs");\nconst contract = require("./.cityos/plugin-ai-contract.json");\nmodule.exports = { hooks: { readPackage: (pkg) => retargetPluginAiPeer(pkg, contract) } };\n',
  };
}

export function verifyIntegrationPatch(bytes, contract) {
  if (createHash("sha256").update(bytes).digest("hex") !== contract.patchSha256) {
    throw new Error("AI recipe integration patch bytes differ from the inspected source contract");
  }
  return bytes;
}
