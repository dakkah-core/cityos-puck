import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNodeVersion, repositoryRoot } from "./toolchain.mjs";
import { sha256 } from "../upstream/integration.mjs";
import {
  assembledRouteDigest,
  expectedRouteDigests,
} from "../cityos/docs-route-revisions.mjs";
import { capturePacketInputs } from "./nextra-stable-docs/generate.mjs";

// Explicit authored-source capture; this creates no approval or acceptance state.
export async function captureDocsPreservation(baselineRevision, changedInputs) {
  assertNodeVersion();
  assert.match(baselineRevision, /^[a-f0-9]{40}$/u);
  const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
  const json = (path) => JSON.parse(read(path));
  const prefix = "scripts/toolchains/nextra-stable-docs/acceptance-inputs/";
  const preservationPath = prefix + "preservation.json";
  const preservationBytes = read(preservationPath);
  const preservation = JSON.parse(preservationBytes);
  const inputs = [
    ...preservation.routes,
    ...preservation.examples,
    ...preservation.publicBoundarySources,
  ];
  const known = new Set(inputs.map(({ path }) => path));
  const added = globSync("apps/docs/content/**/*", { cwd: repositoryRoot })
    .map((path) => path.replaceAll("\\", "/"))
    .filter(
      (path) => /\.(?:mdx|examples\.tsx)$/u.test(path) && !known.has(path),
    )
    .sort();
  const actual = inputs
    .filter(
      (entry) =>
        sha256(Buffer.from(read(entry.path).replaceAll("\r\n", "\n"))) !==
        entry.sha256,
    )
    .map((entry) => entry.path)
    .concat(added)
    .sort();
  assert.deepEqual(
    actual,
    [...changedInputs].sort(),
    "Name every changed preservation input explicitly",
  );
  assert.equal(new Set(changedInputs).size, changedInputs.length);
  for (const path of added) {
    const entry = {
      path,
      sha256: sha256(Buffer.from(read(path).replaceAll("\r\n", "\n"))),
    };
    (path.endsWith(".mdx") ? preservation.routes : preservation.examples).push(
      entry,
    );
  }
  preservation.routes.sort((a, b) => a.path.localeCompare(b.path, "en"));
  preservation.examples.sort((a, b) => a.path.localeCompare(b.path, "en"));
  preservation.expectedRoutes = preservation.routes.length;
  preservation.expectedExamples = preservation.examples.length;
  const fixture = json("scripts/cityos/fixtures/docs-route-migration.json");
  const originalRoutes = new Set(
    fixture.routes.map(({ path }) => `apps/docs/content/${path}`),
  );
  preservation.addedRoutes = preservation.routes
    .map(({ path }) => path)
    .filter((path) => !originalRoutes.has(path));
  const revisionsPath = "scripts/cityos/fixtures/docs-route-revisions.json";
  const previous = existsSync(resolve(repositoryRoot, revisionsPath))
    ? json(revisionsPath)
    : {
        schemaVersion: "cityos.docs-maintained-route-revisions.v1",
        routes: [],
      };
  const beforeExpected = expectedRouteDigests(fixture, previous);
  const before = (path) =>
    execFileSync("git", ["show", `${baselineRevision}:${path}`], {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
    });
  const revisions = {
    schemaVersion: previous.schemaVersion,
    scope:
      "Explicit current executable-example source revisions; original migration observations remain immutable. No acceptance or release claim.",
    routes: [],
  };
  for (const route of fixture.routes) {
    assert.equal(
      assembledRouteDigest(route.path, before),
      beforeExpected.get(route.path),
      "Baseline does not match recorded docs source",
    );
    const current = assembledRouteDigest(route.path, read);
    if (current !== route.sha256)
      revisions.routes.push({
        path: route.path,
        originalMigrationSha256: route.sha256,
        sha256: current,
        baselineRevision,
        reason:
          "Maintain the current upstream documentation and executable examples, retaining the original migration digest as historical evidence; source revision only.",
      });
  }
  expectedRouteDigests(fixture, revisions);
  const archive = resolve(repositoryRoot, ".build/docs-source-input-captures");
  mkdirSync(archive, { recursive: true });
  const previousInput = resolve(
    archive,
    sha256(Buffer.from(preservationBytes)) + ".json",
  );
  if (existsSync(previousInput))
    assert.equal(readFileSync(previousInput, "utf8"), preservationBytes);
  else writeFileSync(previousInput, preservationBytes, { flag: "wx" });
  for (const entry of inputs)
    if (changedInputs.includes(entry.path))
      entry.sha256 = sha256(
        Buffer.from(read(entry.path).replaceAll("\r\n", "\n")),
      );
  const packetBefore = sha256(
    readFileSync(resolve(repositoryRoot, prefix + "packet-integrity.json")),
  );
  writeFileSync(
    resolve(repositoryRoot, revisionsPath),
    JSON.stringify(revisions, null, 2) + "\n",
  );
  writeFileSync(
    resolve(repositoryRoot, preservationPath),
    JSON.stringify(preservation, null, 2) + "\n",
  );
  const packet = await capturePacketInputs(packetBefore, [
    "acceptance-inputs/preservation.json",
  ]);
  return {
    scope: revisions.scope,
    changedInputs,
    revisedRoutes: revisions.routes.length,
    packet,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.ok(
    process.argv.length >= 4,
    "Usage: capture-docs-preservation.mjs <baseline SHA> <every changed input path>",
  );
  console.log(
    JSON.stringify(
      await captureDocsPreservation(process.argv[2], process.argv.slice(3)),
    ),
  );
}
