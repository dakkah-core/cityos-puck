#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { program } from "commander";
import inquirer from "inquirer";
import Handlebars from "handlebars";
import { glob } from "glob";
import { execSync } from "child_process";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { loadBootstrapCatalog } from "./bootstrap-catalog.js";
import { materializeManifest } from "./manifest-catalog.js";
import { prepareBootstrapIntegration, requireRecipePackageManager, verifyIntegrationPatch } from "./bootstrap-integration.js";
import { resolvePinnedPnpm, runPinnedPnpm } from "./pinned-pnpm.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { workspace, core, toolchain, nodeVersion, pluginAiContract, patches } = loadBootstrapCatalog();
if (process.versions.node !== toolchain.node) throw new Error(`Expected exactly Node ${toolchain.node}; selected ${process.versions.node}`);

const ansiColors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
};

// Lifted from https://github.com/vercel/next.js/blob/c2d7bbd1b82c71808b99e9a7944fb16717a581db/packages/create-next-app/helpers/get-pkg-manager.ts
function getPkgManager() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const userAgent = process.env.npm_config_user_agent || "";

  if (userAgent.startsWith("yarn")) {
    return "yarn";
  }

  if (userAgent.startsWith("pnpm")) {
    return "pnpm";
  }

  return "npm";
}

const handleSigTerm = () => process.exit(0);

process.on("SIGINT", handleSigTerm);
process.on("SIGTERM", handleSigTerm);

program
  .command("create [app-name]")
  .option(
    "--use-npm",
    `

    Explicitly tell the CLI to bootstrap the application using npm
  `
  )
  .option(
    "--use-pnpm",
    `

    Explicitly tell the CLI to bootstrap the application using pnpm
  `
  )
  .option(
    "--use-yarn",
    `

    Explicitly tell the CLI to bootstrap the application using Yarn
  `
  )
  .option(
    "--ai",
    `

    Add Puck AI to the editor (requires a Puck Cloud account)
  `
  )
  .action(async (_appName, options) => {
    const questions = [];

    if (!_appName) {
      questions.push({
        type: "input",
        name: "appName",
        message: "What is the name of your app?",
        required: true,
      });
    }

    questions.push({
      type: "list",
      name: "recipe",
      message: "Which recipe would you like to use?",
      required: true,
      default: "next",
      choices: [
        {
          name: "Next.js",
          value: "next",
        },
        {
          name: "React Router",
          value: "react-router",
        },
      ],
    });

    // If the user didn't specify the --ai flag, ask them if they want to add Puck AI to the editor.
    if (!options.ai) {
      questions.push({
        type: "confirm",
        name: "puckAi",
        message: `Puck AI (beta) lets you generate pages using your own components. Learn more: ${ansiColors.cyan}https://puckeditor.com/docs/ai/overview${ansiColors.reset}

  Add Puck AI to the editor? (Requires a Puck Cloud account)`,
        required: true,
        default: true,
      });
    }

    const answers = await inquirer.prompt(questions);

    // Check the app name
    const appNameInput = answers.appName || _appName;
    const appName = typeof appNameInput === "string" ? appNameInput.trim() : "";

    if (!appName) {
      console.error("Please provide a name for your app.");
      return;
    }

    const recipe = answers.recipe;
    const usesPuckAi = answers.puckAi || !!options.ai;

    // Copy template files to the new directory
    const recipeName = `${recipe}${usesPuckAi ? "-ai" : ""}`;
    const templatePath = path.join(__dirname, "./templates", recipeName);
    const appPath = path.join(process.cwd(), appName);

    if (!recipe) {
      console.error(`Please specify a recipe.`);
      return;
    }

    if (!fs.existsSync(templatePath)) {
      console.error(`No recipe named ${recipeName} exists.`);
      return;
    }

    if (fs.existsSync(appPath)) {
      console.error(
        `A directory called ${appName} already exists. Please use a different name or delete this directory.`
      );
      return;
    }

    const packageManager = !!options.useNpm
      ? "npm"
      : !!options.usePnpm
      ? "pnpm"
      : !!options.useYarn
      ? "yarn"
      : getPkgManager();

    // Resolve required integration support before creating any app files.
    requireRecipePackageManager(usesPuckAi, packageManager);
    const templateContext = {
      ...answers,
      appName,
      puckVersion: `npm:${core.name}@${core.version}`,
      puckSourceVersion: core.version,
      packageManager: toolchain.packageManager,
      nodeVersion,
      nodeEngine: toolchain.nodeEngine,
    };
    const packageTemplate = fs.readFileSync(path.join(templatePath, "package.json.hbs"), "utf8");
    const manifest = materializeManifest(JSON.parse(Handlebars.compile(packageTemplate)(templateContext)), workspace);
    const integration = prepareBootstrapIntegration(manifest, workspace, core, pluginAiContract);
    const patchBytes = integration
      ? verifyIntegrationPatch(fs.readFileSync(patches[integration.selector]), pluginAiContract)
      : undefined;
    const pinnedPnpm = packageManager === "pnpm"
      ? resolvePinnedPnpm({ toolchain, root: __dirname })
      : undefined;
    fs.mkdirSync(appName);

    // Compile handlebars templates
    const templateFiles = glob.sync(`**/*`, {
      cwd: templatePath,
      nodir: true,
      dot: true,
    });

    for (const templateFile of templateFiles) {
      const filePath = path.join(templatePath, templateFile);
      const targetPath = filePath
        .replace(templatePath, appPath)
        .replace(".hbs", "")
        .replace("gitignore", ".gitignore"); // Rename gitignore back to .gitignore (.gitignore) gets ignored by npm during publish

      let data;

      if (path.extname(filePath) === ".hbs") {
        const templateString = fs.readFileSync(filePath, "utf-8");

        const template = Handlebars.compile(templateString);
        data = template(templateContext);
      } else {
        data = fs.readFileSync(filePath, "utf-8");
      }

      if (path.basename(targetPath) === "package.json") {
        if (integration) {
          const patchPath = path.join(appPath, integration.targetPath);
          fs.mkdirSync(path.dirname(patchPath), { recursive: true });
          fs.writeFileSync(patchPath, patchBytes);
          fs.copyFileSync(new URL("plugin-ai-peer.cjs", import.meta.url), path.join(appPath, ".cityos/plugin-ai-peer.cjs"));
          fs.writeFileSync(path.join(appPath, ".cityos/plugin-ai-contract.json"), JSON.stringify(pluginAiContract, null, 2) + "\n");
          // JSON is valid YAML and keeps the standalone patch registration exact.
          fs.writeFileSync(path.join(appPath, "pnpm-workspace.yaml"), JSON.stringify(integration.workspace, null, 2) + "\n");
          fs.writeFileSync(path.join(appPath, ".pnpmfile.cjs"), integration.hook);
        }
        data = JSON.stringify(manifest, null, 2) + "\n";
      }

      const dir = path.dirname(targetPath);

      fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(targetPath, data);
    }

    if (packageManager === "yarn") {
      execSync("yarn install", { cwd: appPath, stdio: "inherit" });
    } else if (packageManager === "pnpm") {
      const status = runPinnedPnpm(["install"], { toolchain, root: appPath, cwd: appPath,
        environment: { ...process.env, PUCK_PNPM_EXECUTABLE: pinnedPnpm } });
      if (status !== 0) throw new Error(`Pinned pnpm install failed with exit ${status}`);
    } else {
      execSync("npm i", { cwd: appPath, stdio: "inherit" });
    }

    let inGitRepo = false;

    try {
      inGitRepo =
        execSync("git status", { cwd: appPath })
          .toString()
          .indexOf("fatal:") !== 0;
    } catch {}

    // Only commit if this is a new repo
    if (!inGitRepo) {
      try {
        execSync("git init", { cwd: appPath, stdio: "inherit" });

        execSync("git add .", { cwd: appPath, stdio: "inherit" });
        execSync('git commit -m "build(puck): generate app"', {
          cwd: appPath,
          stdio: "inherit",
        });
      } catch (error) {
        console.log("Failed to commit git changes");
      }
    }

    console.log("\nDone! Now run:\n");
    console.log(`  cd ${appName}`);
    console.log(`  ${packageManager} run dev\n`);

    if (usesPuckAi) {
      console.log(
        `Configure Puck AI access: ${ansiColors.cyan}https://cloud.puckeditor.com/onboarding/integrate${ansiColors.reset}`
      );
    }
  })
  .parse(process.argv);
