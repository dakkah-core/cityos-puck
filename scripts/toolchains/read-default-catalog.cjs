const { readFileSync } = require("node:fs");
const { join } = require("node:path");

// Shared by the pre-install CJS hook and ESM toolchain scripts. This deliberately
// accepts only the owning workspace's JSON-quoted scalar catalog.
function readDefaultCatalog(source = readFileSync(join(__dirname, "../../pnpm-workspace.yaml"), "utf8")) {
  const lines = source.split(/\r?\n/u);
  const start = lines.indexOf("catalog:");
  if (start < 0) throw new Error("Missing owning default catalog");
  const result = {};
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith(" ")) break;
    if (!/^  "[^"\n]+": "[^"\n]+"$/u.test(line)) {
      throw new Error(`Unsupported bootstrap catalog scalar: ${line}`);
    }
    const entry = JSON.parse(`{${line.trim()}}`);
    const name = Object.keys(entry)[0];
    if (Object.hasOwn(result, name)) throw new Error(`Duplicate catalog entry: ${name}`);
    result[name] = entry[name];
  }
  return result;
}

module.exports = { readDefaultCatalog };
