import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(__dirname, "../../..");
const coreRoot = resolve(repositoryRoot, "packages/core");
const manifest = JSON.parse(
  readFileSync(resolve(coreRoot, "package.json"), "utf8")
);
const demo = JSON.parse(
  readFileSync(resolve(repositoryRoot, "apps/demo/tsconfig.json"), "utf8")
);

/**
 * Runtime CSS verification must exercise the emitted client bundle, not source
 * or a legacy dist directory. Package prepare builds the artifacts before tests.
 * The full demo build independently verifies actual bundler/module resolution.
 */
describe("CityOS compiled bundle consumers", () => {
  it("binds the demo alias to the exported ESM client bundle", () => {
    const targets = demo.compilerOptions.paths["@/core-dist"];
    expect(targets).toHaveLength(1);
    const actual = resolve(repositoryRoot, "apps/demo", targets[0]);
    const expected = resolve(coreRoot, manifest.exports["."].default.import);
    expect(actual).toBe(expected);
  });

  it("includes the executable client and declaration artifacts", () => {
    const entry = manifest.exports["."].default;
    const css = resolve(coreRoot, manifest.exports["./puck.css"]);
    expect(statSync(resolve(coreRoot, entry.import)).isFile()).toBe(true);
    expect(statSync(resolve(coreRoot, entry.types)).isFile()).toBe(true);
    expect(statSync(css).isFile()).toBe(true);
  });
});
