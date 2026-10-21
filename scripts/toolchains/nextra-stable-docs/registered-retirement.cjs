"use strict";
const { createHash } = require("node:crypto");
const { readFileSync, lstatSync, realpathSync } = require("node:fs");
const { isAbsolute, join, relative, resolve, sep } = require("node:path");

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const fail = (reason) => { throw new Error(`NEXTRA_REGISTERED_RETIREMENT: ${reason}`); };
const plain = (value) => value && typeof value === "object" && !Array.isArray(value);

function beneath(root, path) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("Artifact path escapes its canonical root");
  if (lstatSync(target).isSymbolicLink()) fail("Registered artifact must be a regular file");
  const actual = relative(realpathSync(root), realpathSync(target));
  if (!actual || actual === ".." || actual.startsWith(`..${sep}`) || isAbsolute(actual)) fail("Registered artifact resolves outside its canonical root");
  return target;
}

function inventoryMap(entries) {
  if (!Array.isArray(entries) || !entries.length) fail("Incomplete generated package inventory");
  const result = new Map();
  for (const entry of entries) {
    if (!plain(entry) || !/^[A-Za-z0-9_./@-]+$/u.test(entry.path ?? "") || entry.path.split("/").includes("..") ||
        !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "") || result.has(entry.path)) fail("Invalid or duplicate package inventory entry");
    result.set(entry.path, entry.sha256);
  }
  return result;
}

function verifyCompletePatch(root, packet, registration) {
  const source = json(join(packet, "provenance.json"));
  const canonicalManifest = json(join(packet, source.upstream.manifest));
  if (hash(readFileSync(join(packet, source.upstream.manifest))) !== source.upstream.manifestSha256) fail("Canonical source manifest changed");
  const patchPath = beneath(root, registration.path);
  const receipt = json(beneath(root, `${registration.path}.provenance.json`));
  const patch = readFileSync(patchPath);
  if (receipt.schemaVersion !== "cityos.nextra-stable-docs.generated-patch.v1" || receipt.status !== "complete-source-generated-patch" ||
      receipt.package?.name !== "nextra" || receipt.package?.version !== "4.6.1" ||
      receipt.package?.originalDependency !== "better-react-mathjax" ||
      receipt.package?.originalRange !== canonicalManifest.dependencies["better-react-mathjax"] ||
      receipt.registration?.selector !== registration.selector || receipt.registration?.path !== registration.path ||
      receipt.patchSha256 !== hash(patch) ||
      receipt.sourceProvenanceSha256 !== hash(readFileSync(join(packet, "provenance.json"))) ||
      receipt.packetIntegritySha256 !== hash(readFileSync(join(packet, "acceptance-inputs/packet-integrity.json"))) ||
      receipt.publishedBaselineSha256 !== source.publishedBaseline.sha256) fail("Registered patch and complete source provenance do not agree");
  const packetIntegrity = json(join(packet, "acceptance-inputs/packet-integrity.json"));
  for (const entry of packetIntegrity.files) {
    if (hash(readFileSync(beneath(packet, entry.path))) !== entry.sha256) fail(`Changed packet input: ${entry.path}`);
  }
  const before = inventoryMap(receipt.baselineInventory);
  const after = inventoryMap(receipt.candidateInventory);
  const expectedChanges = [...new Set([...before.keys(), ...after.keys()])].sort().filter((path) => before.get(path) !== after.get(path));
  if (!Array.isArray(receipt.changedFiles) || JSON.stringify(expectedChanges) !== JSON.stringify(receipt.changedFiles)) fail("Patch inventory is incomplete");
  const actualChanges = [...patch.toString("utf8").matchAll(/^diff --git a\/([^\r\n]+) b\/\1$/gmu)].map((match) => match[1]);
  if (JSON.stringify(actualChanges) !== JSON.stringify(expectedChanges)) fail("Patch does not cover the complete changed-file inventory");
  for (const path of ["package.json", "dist/client/components/index.js", "dist/client/components/index.d.ts",
    "dist/server/compile.js", "dist/server/schemas.js", "dist/server/schemas.d.ts", "dist/types.d.ts", "dist/types.generated.d.ts",
    "dist/server/rehype-plugins/index.js", "dist/server/rehype-plugins/rehype-better-react-mathjax.js",
    "dist/server/rehype-plugins/rehype-better-react-mathjax.d.ts"]) {
    if (!expectedChanges.includes(path)) fail(`Required coordinated retirement change is missing: ${path}`);
  }
  if (!plain(receipt.candidateDependencies) || Object.hasOwn(receipt.candidateDependencies, "better-react-mathjax")) fail("Generated physical manifest retains the retired edge");
  return { originalRange: canonicalManifest.dependencies["better-react-mathjax"], candidateDependencies: receipt.candidateDependencies };
}

// No installed YAML package or second YAML parser is used. initialize receives
// native pnpm's parsed canonical settings; the caller supplies the repository's
// existing dependency-free default-catalog reader. Worker state is fail-closed.
function createRegisteredMathJaxRetirement({ repositoryRoot, readCatalog }) {
  if (typeof readCatalog !== "function") fail("Existing canonical catalog reader is required");
  const root = realpathSync(repositoryRoot);
  const packet = join(root, "scripts/toolchains/nextra-stable-docs");
  let state;
  return {
    initialize(config) {
      state = undefined;
      if (!plain(config)) fail("Native canonical configuration is required");
      const integration = json(join(packet, "integration-inputs.json"));
      const expected = integration.registration;
      const registrations = config.patchedDependencies ?? {};
      if (!plain(registrations)) fail("Invalid canonical patchedDependencies metadata");
      const related = Object.keys(registrations).filter((key) => key === "nextra" || key.startsWith("nextra@"));
      if (!related.length) {
        state = { registered: false };
        return config;
      }
      if (related.length !== 1 || related[0] !== expected.selector || registrations[expected.selector] !== expected.path) fail("Unexpected Nextra patch selector or path");
      const catalog = readCatalog();
      if (catalog.nextra !== "4.6.1" || catalog["nextra-theme-docs"] !== "4.6.1") fail("Published stable Nextra/theme catalog identity changed");
      const proof = verifyCompletePatch(root, packet, expected);
      state = { registered: true, ...proof };
      return config;
    },
    readPackage(pkg) {
      if (pkg.name !== "nextra") return pkg;
      if (!state) fail("Canonical registration was not initialized in this native hook worker");
      if (!state.registered) return pkg;
      if (pkg.version !== "4.6.1") fail("Unexpected Nextra package version");
      for (const field of ["optionalDependencies", "peerDependencies"]) {
        if (Object.hasOwn(pkg[field] ?? {}, "better-react-mathjax")) fail(`Unexpected retired edge in ${field}`);
      }
      const dependencies = pkg.dependencies ?? {};
      if (!Object.hasOwn(dependencies, "better-react-mathjax")) {
        // A physical manifest already carrying the complete generated delta is
        // acceptable only with the exact verified candidate dependency map.
        const entries = (value) => Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"));
        if (JSON.stringify(entries(dependencies)) !== JSON.stringify(entries(state.candidateDependencies))) fail("Unexpected missing retirement edge");
        return pkg;
      }
      if (dependencies["better-react-mathjax"] !== state.originalRange) fail("Unexpected original better-react-mathjax range");
      const nextDependencies = { ...dependencies };
      delete nextDependencies["better-react-mathjax"];
      return { ...pkg, dependencies: nextDependencies };
    },
  };
}

module.exports = { createRegisteredMathJaxRetirement };
