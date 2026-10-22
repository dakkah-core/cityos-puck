import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export function assembledRouteDigest(path, read) {
  let source = read(`apps/docs/content/${path}`).replaceAll("\r\n", "\n");
  const match =
    /^import \{ (Example\d+(?:, Example\d+)*) \} from "\.\/([^"\n]+)\.examples";\n/mu.exec(
      source,
    );
  if (match) {
    const examples = read(
      `apps/docs/content/${path.replace(/[^/]+$/u, "")}${match[2]}.examples.tsx`,
    ).replaceAll("\r\n", "\n");
    assert.ok(examples.startsWith('"use client";'), path);
    for (const name of match[1].split(", ")) {
      const body = new RegExp(
        `export function ${name}\\(\\) \\{\\n  return \\(\\n([\\s\\S]*?)\\n  \\);\\n\\}`,
      ).exec(examples);
      assert.ok(body, `${path}/${name}`);
      source = source.replace(`<${name} />`, body[1]);
    }
    source = source.replace(match[0], "");
  }
  return createHash("sha256")
    .update(source.replace(/\s+/gu, " ").trim())
    .digest("hex");
}

export function expectedRouteDigests(fixture, revisions) {
  assert.equal(
    revisions.schemaVersion,
    "cityos.docs-maintained-route-revisions.v1",
  );
  const expected = new Map(
    fixture.routes.map(({ path, sha256 }) => [path, sha256]),
  );
  const revised = new Set();
  for (const entry of revisions.routes) {
    assert.ok(expected.has(entry.path), "Unknown preserved route");
    assert.ok(!revised.has(entry.path), "Duplicate route revision");
    revised.add(entry.path);
    assert.equal(
      entry.originalMigrationSha256,
      expected.get(entry.path),
      "Historical migration anchor changed",
    );
    assert.match(entry.sha256, /^[a-f0-9]{64}$/u);
    assert.notEqual(
      entry.sha256,
      entry.originalMigrationSha256,
      "Redundant route revision",
    );
    assert.match(entry.baselineRevision, /^[a-f0-9]{40}$/u);
    assert.ok(
      typeof entry.reason === "string" && entry.reason.trim().length > 10,
    );
    expected.set(entry.path, entry.sha256);
  }
  return expected;
}
