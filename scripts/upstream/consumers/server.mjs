import assert from "node:assert/strict";
for (const key of ["window", "document", "navigator"])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get() {
      throw new Error(`Server import accessed browser ${key}`);
    },
  });
assert.equal(typeof (await import("@cityos-core/puck")).Render, "function");
assert.equal(typeof (await import("@cityos-core/puck/rsc")).Render, "function");
const cityos = await import("@cityos-core/puck/cityos");
assert.equal(typeof cityos.digestCityOSPuckRegistration, "function");
assert.equal(cityos.CITYOS_PUCK_PACKAGE.forkRevision, process.argv[2]);
console.log("Packed React server exports passed without browser access");
