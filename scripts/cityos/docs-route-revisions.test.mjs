import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedRouteDigests } from "./docs-route-revisions.mjs";

test("maintained docs revisions retain historical anchors and reject unrecorded or ambiguous scope", () => {
  const fixture = {
    routes: [{ path: "docs/example.mdx", sha256: "a".repeat(64) }],
  };
  const entry = {
    path: fixture.routes[0].path,
    originalMigrationSha256: "a".repeat(64),
    sha256: "b".repeat(64),
    baselineRevision: "c".repeat(40),
    reason: "Use the current executable Puck API",
  };
  const revisions = {
    schemaVersion: "cityos.docs-maintained-route-revisions.v1",
    routes: [entry],
  };
  assert.equal(
    expectedRouteDigests(fixture, revisions).get(entry.path),
    entry.sha256,
  );
  assert.equal(
    expectedRouteDigests(fixture, { ...revisions, routes: [] }).get(entry.path),
    fixture.routes[0].sha256,
  );
  for (const changed of [
    { path: "other.mdx" },
    { originalMigrationSha256: "d".repeat(64) },
    { sha256: "bad" },
    { sha256: "a".repeat(64) },
    { baselineRevision: "main" },
    { reason: "" },
  ])
    assert.throws(() =>
      expectedRouteDigests(fixture, {
        ...revisions,
        routes: [{ ...entry, ...changed }],
      }),
    );
  assert.throws(() =>
    expectedRouteDigests(fixture, { ...revisions, routes: [entry, entry] }),
  );
});
