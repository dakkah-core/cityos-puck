#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { loadBootstrapCatalog } from "../bootstrap-catalog.js";
import { copyRecipes } from "./copy-recipes.mjs";
import { copyNextToolchain } from "./copy-next-toolchain.mjs";
import { verifyGeneratedTypesPolicy } from "../../../scripts/toolchains/verify-generated-types-policy.mjs";

const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--catalog-only")) {
  throw new Error("Usage: generate.js [--catalog-only]");
}
const catalogOnly = arguments_[0] === "--catalog-only";

const run = async () => {
  verifyGeneratedTypesPolicy();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Copy template files to the new directory
  const recipePath = path.join(__dirname, "../../../recipes");
  const templatePath = path.join(__dirname, "../templates");

  if (!catalogOnly && !fs.existsSync(recipePath)) {
    console.error(`No recipe directory could be found at ${recipePath}.`);
    return;
  }

  if (!catalogOnly && !fs.existsSync(templatePath)) {
    console.error(`No template directory could be found at ${templatePath}.`);
    return;
  }

  // Ship canonical inputs with the standalone CLI. No independently pinned versions.
  const packagePath = path.join(__dirname, "..");
  for (const [source, target] of [
    ["../../../pnpm-workspace.yaml", "dependency-catalog.yaml"],
    ["../../../package.json", "workspace-package.json"],
    ["../../../config/toolchains/node-typescript.json", "node-typescript.json"],
    ["../../core/package.json", "core-package.json"],
    ["../../../config/dependencies/plugin-ai.json", "plugin-ai-contract.json"],
  ]) {
    fs.copyFileSync(path.resolve(__dirname, source), path.join(packagePath, target));
  }
  const bootstrap = loadBootstrapCatalog();
  for (const [selector, patch] of Object.entries(bootstrap.patches)) {
    const relative = bootstrap.workspace.patchedDependencies[selector];
    const target = path.join(packagePath, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(patch, target);
  }

  if (catalogOnly) {
    console.log("Copied canonical bootstrap catalog inputs only.");
    return;
  }

  console.warn(
    `⚠️   The following files use handlebars templates. Please manually update them:`
  );

  const counter = copyRecipes({ recipePath, templatePath, onTemplated: file => console.warn(`- ${file}`) });
  copyNextToolchain({ repositoryRoot: path.resolve(__dirname, "../../.."), templatePath });

  console.log(`Copied ${counter} files into generator!`);
};

await run();
