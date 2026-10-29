const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

module.exports = (phase) => ({
  experimental: { useTypeScriptCli: true },
  typescript: { tsconfigPath: phase === PHASE_DEVELOPMENT_SERVER ? "tsconfig.json" : "tsconfig.build.json" },
  reactStrictMode: true,
});
