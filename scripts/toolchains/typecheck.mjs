import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assertNodeVersion, loadToolchain } from "./toolchain.mjs";

// Resolve the compiler package itself, never a hoisted tsc/ts-node executable.
const toolchain = loadToolchain();
assertNodeVersion(toolchain);
const require = createRequire(new URL("../../package.json", import.meta.url));
const manifestPath = require.resolve("typescript/package.json");
const compiler = JSON.parse(readFileSync(manifestPath, "utf8"));
if (compiler.version !== toolchain.typescript || !compiler.version.startsWith("7.")) {
  throw new Error(`First-party checking requires catalog TypeScript 7, received ${compiler.version}`);
}
const entry = typeof compiler.bin === "string" ? compiler.bin : compiler.bin.tsc;
const result = spawnSync(process.execPath, [resolve(dirname(manifestPath), entry), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
