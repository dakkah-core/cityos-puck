const { retargetPluginAiPeer } = require("./packages/create-puck-app/plugin-ai-peer.cjs");
const contract = require("./config/dependencies/plugin-ai.json");
const core = require("./packages/core/package.json");
const { readDefaultCatalog } = require("./scripts/toolchains/read-default-catalog.cjs");
const { adaptToolingApi } = require("./scripts/toolchains/tooling-api.cjs");
const toolingPolicy = require("./config/dependencies/tooling-api.json");
const catalog = readDefaultCatalog();

if (contract.corePackage !== core.name || contract.coreSourceVersion !== core.version) {
  throw new Error("The plugin-ai source patch must match the owned core identity and source version");
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      // pnpm resolves peer declarations before applying file patches.
      return adaptToolingApi(retargetPluginAiPeer(pkg, contract), catalog, toolingPolicy);
    },
  },
};
