const assert = require("node:assert/strict");
assert.equal(typeof require("@cityos-core/puck").Puck, "function");
assert.equal(typeof require("@cityos-core/puck/rsc").Render, "function");
const cityos = require("@cityos-core/puck/cityos");
assert.equal(typeof cityos.digestCityOSPuckRegistration, "function");
assert.equal(cityos.CITYOS_PUCK_PACKAGE.forkRevision, process.argv[2]);
console.log("Packed CommonJS public exports passed");
