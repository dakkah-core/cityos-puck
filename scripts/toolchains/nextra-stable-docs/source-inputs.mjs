import assert from "node:assert/strict";

const schema = "cityos.nextra-stable-docs.packet-integrity-input.v1";
const validPath = (value) => typeof value === "string" && value.length > 0 &&
  !value.startsWith("/") && !value.includes("\\") && !value.includes(":") &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");

function entries(files) {
  const result = new Map();
  for (const { path, sha256 } of files) {
    assert.ok(validPath(path), "Invalid packet source path");
    assert.match(sha256, /^[a-f0-9]{64}$/u, "Invalid packet source hash");
    assert.ok(!result.has(path), "Duplicate packet source path");
    result.set(path, sha256);
  }
  return result;
}

// Capturing authored source hashes is explicit and distinct from generation,
// acceptance, activation or approval. Every changed input must be named.
export function planPacketInputCapture(previous, actualFiles, changedPaths) {
  assert.equal(previous.schemaVersion, schema);
  const before = entries(previous.files);
  const after = entries(actualFiles);
  for (const path of before.keys()) assert.ok(after.has(path), `Required packet input was removed: ${path}`);
  const named = new Set(changedPaths);
  assert.equal(named.size, changedPaths.length, "Duplicate changed input");
  for (const path of named) assert.ok(validPath(path), "Invalid changed input path");
  const actualChanges = [...after].filter(([path, sha256]) => before.get(path) !== sha256)
    .map(([path]) => path).sort();
  assert.deepEqual(actualChanges, [...named].sort(), "Actual source changes differ from the explicitly named inputs");
  return {
    ...previous,
    files: [...after].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([path, sha256]) => ({ path, sha256 })),
  };
}
