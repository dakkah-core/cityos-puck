import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePublicationInput } from "./publication-input.mjs";

test("publication uses only the qualified archive for the current owned package version", () => {
  const manifest = { name: "@cityos-core/puck", version: "0.23.0-cityos.3" };
  const artifact = {
    path: ".build/upstream/qualified/package.tgz",
    package: manifest.name,
    version: manifest.version,
  };
  assert.doesNotThrow(() => validatePublicationInput({ artifact }, manifest));
  for (const replacement of [
    { path: "packages/core" },
    { package: "@upstream/puck" },
    { version: "0.23.0-cityos.2" },
  ]) {
    assert.throws(
      () =>
        validatePublicationInput(
          { artifact: { ...artifact, ...replacement } },
          manifest,
        ),
      /does not match/,
    );
  }
});
