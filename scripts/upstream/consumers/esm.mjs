import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { Puck } from "@cityos-core/puck";
import {
  CITYOS_PUCK_PACKAGE,
  bindCityOSPuckRegistration,
} from "@cityos-core/puck/cityos";
const require = createRequire(import.meta.url);
assert.equal(typeof Puck, "function");
assert.equal(typeof bindCityOSPuckRegistration, "function");
assert.equal(CITYOS_PUCK_PACKAGE.forkRevision, process.argv[2]);
assert.equal(CITYOS_PUCK_PACKAGE.sourceDigest, process.argv[3]);
assert.equal(CITYOS_PUCK_PACKAGE.dirty, false);
assert.equal(
  require("@cityos-core/puck/package.json").version,
  process.argv[4],
);
assert.deepEqual(
  CITYOS_PUCK_PACKAGE,
  require("@cityos-core/puck/cityos").CITYOS_PUCK_PACKAGE,
);
assert.equal(
  require.resolve("react"),
  createRequire(require.resolve("@cityos-core/puck")).resolve("react"),
);
for (const entry of ["puck.css", "no-external.css", "dist/index.css"])
  assert.ok(
    readFileSync(require.resolve(`@cityos-core/puck/${entry}`)).length > 100,
  );
console.log("Packed ESM, metadata, React identity and styles passed");
