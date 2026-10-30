#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { loadBootstrapCatalog } from "../bootstrap-catalog.js";
import { copyRecipes } from "./copy-recipes.mjs";
import { copyNextToolchain } from "./copy-next-toolchain.mjs";
import { verifyGeneratedTypesPolicy } from "../../../scripts/toolchains/verify-generated-types-policy.mjs";

export function copyBootstrapCatalog({ repositoryRoot, packageRoot }) {
  verifyGeneratedTypesPolicy(path.join(repositoryRoot, "scripts/toolchains/generated-types-policy"));
  const sourceDirectory = path.join(repositoryRoot, "packages/create-puck-app/scripts");
  // Ship one coherent copy of the canonical inputs, including their patches.
  for (const [source, target] of [
    ["../../../pnpm-workspace.yaml", "dependency-catalog.yaml"],
    ["../../../package.json", "workspace-package.json"],
    ["../../../config/toolchains/node-typescript.json", "node-typescript.json"],
    ["../../core/package.json", "core-package.json"],
    ["../../../config/dependencies/plugin-ai.json", "plugin-ai-contract.json"],
  ]) {
    fs.copyFileSync(path.resolve(sourceDirectory, source), path.join(packageRoot, target));
  }
  const base = new URL("../", pathToFileURL(path.join(sourceDirectory, "generate.js")));
  const bootstrap = loadBootstrapCatalog(base);
  for (const [selector, patch] of Object.entries(bootstrap.patches)) {
    const relative = bootstrap.workspace.patchedDependencies[selector];
    const target = path.join(packageRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(patch, target);
  }
}

const run = async (catalogOnly) => {
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

  const packagePath = path.join(__dirname, "..");
  copyBootstrapCatalog({ repositoryRoot: path.resolve(__dirname, "../../.."), packageRoot: packagePath });

  if (catalogOnly) {
    console.log("Copied canonical bootstrap catalog inputs only.");
    return;
  }

  console.warn(
    `⚠️   The following files use handlebars templates. Please manually update them:`
  );

  const counter = copyRecipes({ recipePath, templatePath, requireNextAttributes: true, onTemplated: file => console.warn(`- ${file}`) });
  copyNextToolchain({ repositoryRoot: path.resolve(__dirname, "../../.."), templatePath });

  console.log(`Copied ${counter} files into generator!`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--catalog-only")) {
    throw new Error("Usage: generate.js [--catalog-only]");
  }
  await run(arguments_[0] === "--catalog-only");
}
