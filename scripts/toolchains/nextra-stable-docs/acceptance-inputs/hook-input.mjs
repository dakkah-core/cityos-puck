import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createRegisteredMathJaxRetirement } = require("../registered-retirement.cjs");

// registeredRepositoryRoot must be a parent-staged real generated patch fixture
// containing this packet and the complete patch/receipt at its canonical path.
export function registerHookAcceptanceInputs({ test, registeredRepositoryRoot, readCatalog, registration }) {
  const original = () => ({ name: "nextra", version: "4.6.1", dependencies: { "better-react-mathjax": "^2.3.0", katex: "^0.16.21" } });
  const helper = () => createRegisteredMathJaxRetirement({ repositoryRoot: registeredRepositoryRoot, readCatalog });
  const configured = () => {
    const instance = helper();
    instance.initialize({ patchedDependencies: { [registration.selector]: registration.path } });
    return instance;
  };
  test("unregistered complete patch files alone never retire a dependency", () => {
    const instance = helper();
    instance.initialize({ patchedDependencies: {} });
    const input = original();
    assert.equal(instance.readPackage(input), input);
    assert.equal(input.dependencies["better-react-mathjax"], "^2.3.0");
  });
  test("exact registered complete source patch retires only the original range without mutating input", () => {
    const instance = configured();
    const input = original();
    const result = instance.readPackage(input);
    assert.equal(input.dependencies["better-react-mathjax"], "^2.3.0");
    assert.deepEqual(result.dependencies, { katex: "^0.16.21" });
    const foreign = { name: "another-package", version: "4.6.1", dependencies: input.dependencies };
    assert.equal(instance.readPackage(foreign), foreign);
  });
  test("registered retirement fails for range/version drift and broad registration", () => {
    const instance = configured();
    assert.throws(() => instance.readPackage({ ...original(), version: "4.6.2" }), /Unexpected Nextra package version/u);
    assert.throws(() => instance.readPackage({ ...original(), dependencies: { "better-react-mathjax": "2.3.0" } }), /Unexpected original.*range/u);
    assert.throws(() => instance.readPackage({ ...original(), dependencies: {} }), /Unexpected missing retirement edge/u);
    assert.throws(() => helper().initialize({ patchedDependencies: { nextra: registration.path } }), /Unexpected Nextra patch selector/u);
    assert.throws(() => helper().readPackage(original()), /not initialized/u);
  });
}
