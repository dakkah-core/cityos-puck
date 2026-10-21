import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function inventoryPackage(root) {
  const entries = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) entries.push({ path: relative(root, path).replaceAll(sep, "/"), sha256: sha256(readFileSync(path)) });
      else throw new Error(`NEXTRA_PATCH_NON_REGULAR_INPUT: ${path}`);
    }
  }
  visit(root);
  return entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

function lines(bytes, path) {
  if (bytes.includes(0)) throw new Error(`NEXTRA_PATCH_BINARY_INPUT: ${path}`);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const result = text.split("\n");
  const finalNewline = result.at(-1) === "";
  if (finalNewline) result.pop();
  if (text === "") return { lines: [], finalNewline: true };
  return { lines: result, finalNewline };
}

function side(prefix, content) {
  return content.lines.flatMap((line, index) => [
    `${prefix}${line}\n`,
    ...(!content.finalNewline && index === content.lines.length - 1 ? ["\\ No newline at end of file\n"] : []),
  ]).join("");
}

// Deterministic complete-file unified hunks. No Git invocation, fuzzy diff,
// generated-file substitution, dependency install or package binding occurs.
export function createCompletePackagePatch(baselineRoot, candidateRoot, baselineInventory, candidateInventory) {
  const before = new Map(baselineInventory.map((entry) => [entry.path, entry.sha256]));
  const after = new Map(candidateInventory.map((entry) => [entry.path, entry.sha256]));
  const changedFiles = [...new Set([...before.keys(), ...after.keys()])]
    .sort().filter((path) => before.get(path) !== after.get(path));
  let patch = "";
  for (const path of changedFiles) {
    if (!/^[A-Za-z0-9_./@-]+$/u.test(path) || path.split("/").includes("..")) throw new Error(`NEXTRA_PATCH_UNSUPPORTED_PATH: ${path}`);
    const old = before.has(path) ? lines(readFileSync(join(baselineRoot, path)), path) : { lines: [], finalNewline: true };
    const next = after.has(path) ? lines(readFileSync(join(candidateRoot, path)), path) : { lines: [], finalNewline: true };
    patch += `diff --git a/${path} b/${path}\n`;
    if (!before.has(path)) patch += "new file mode 100644\n";
    if (!after.has(path)) patch += "deleted file mode 100644\n";
    patch += `--- ${before.has(path) ? `a/${path}` : "/dev/null"}\n`;
    patch += `+++ ${after.has(path) ? `b/${path}` : "/dev/null"}\n`;
    patch += `@@ -${old.lines.length ? 1 : 0},${old.lines.length} +${next.lines.length ? 1 : 0},${next.lines.length} @@\n`;
    patch += side("-", old) + side("+", next);
  }
  if (!changedFiles.length) throw new Error("NEXTRA_PATCH_EMPTY");
  return { patch, changedFiles };
}
