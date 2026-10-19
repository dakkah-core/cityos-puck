import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import toolchainHelpers from "../../packages/create-puck-app/toolchain.cjs";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const { deriveToolchain } = toolchainHelpers;

export function loadToolchain(root = repositoryRoot) {
  return deriveToolchain(JSON.parse(readFileSync(resolve(root, "config/toolchains/node-typescript.json"), "utf8")));
}

export function assertNodeVersion(toolchain = loadToolchain(), actual = process.versions.node) {
  if (actual !== toolchain.node) {
    throw new Error(`Expected exactly Node ${toolchain.node}; selected ${actual}. Source the workspace selector in this shell.`);
  }
}
