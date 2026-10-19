import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Bootstrap reader for the JSON-quoted scalar catalog, before dependencies exist.
// Reject unsupported YAML syntax instead of guessing a dependency version.
export function readDefaultCatalog(source = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8")) {
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  const version = readDefaultCatalog()[name];
  if (!version) throw new Error(`No catalog version for ${name}`);
  console.log(version);
}
