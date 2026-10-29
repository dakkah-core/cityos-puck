const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

module.exports = (phase) => ({
  experimental: { useTypeScriptCli: true },
  typescript: { tsconfigPath: phase === PHASE_DEVELOPMENT_SERVER ? "tsconfig.json" : "tsconfig.build.json" },
  reactStrictMode: true,
  transpilePackages: ["@puckeditor/core", "lucide-react"],
  async rewrites() {
    return [
      {
        source: "/ev/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ev/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  // posthog-js posts to trailing-slash paths, and Next's trailing-slash
  // redirect runs before rewrites, so ingest would never reach /ev.
  skipTrailingSlashRedirect: true,
});
