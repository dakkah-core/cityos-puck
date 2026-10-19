/** @type {import("jest").Config} */

const config = {
  preset: "ts-jest/presets/js-with-ts-esm", // TS + ESM
  testEnvironment: "jsdom",

  // Treat these files as ESM so `import`/`export` keep working
  extensionsToTreatAsEsm: [".ts", ".tsx"],

  transform: {
    // Let ts-jest compile TS/JS for Jest
    "^.+\\.[tj]sx?$": ["ts-jest", { useESM: true, compiler: "typescript-api", diagnostics: false, tsconfig: { allowJs: true } }],
  },

  // Re-enable transform *inside* selected node_modules
  transformIgnorePatterns: [
    "/node_modules/(?!(?:\\.pnpm|@preact/signals-core|@preact/signals-react|@dnd-kit|flat)/)",
  ],

  moduleNameMapper: {
    // stub out style & asset imports
    "\\.(css|less|sass|scss)$": "identity-obj-proxy",
  },
};

module.exports = config;
