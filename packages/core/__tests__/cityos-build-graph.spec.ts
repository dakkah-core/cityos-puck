import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(__dirname, "../../..");
const manifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, "packages/core/package.json"), "utf8")
);
const configuration = JSON.parse(
  readFileSync(resolve(repositoryRoot, "turbo.json"), "utf8")
);
const coreBuild = `${manifest.name}#build`;

/**
 * Existing upstream recipes and third-party plugin peers use the upstream alias.
 * Turbo must wait for the renamed core's real build, not race its dist cleanup.
 * The full CI build is the execution proof; these checks prevent graph regression.
 */
describe("CityOS core build ordering", () => {
  it("orders consumer builds after the actual fork package", () => {
    expect(manifest.name).toBe("@cityos-core/puck");
    expect(configuration.tasks.build.dependsOn).toContain(coreBuild);
  });

  it("retains normal dependency ordering for other packages", () => {
    expect(configuration.tasks.build.dependsOn).toContain("^build");
  });

  it("gives core an explicit override without a self-dependency", () => {
    expect(configuration.tasks[coreBuild].dependsOn).toEqual(["^build"]);
    expect(configuration.tasks[coreBuild].dependsOn).not.toContain(coreBuild);
  });

  it("restores all emitted core bundles on cache hits", () => {
    expect(configuration.tasks[coreBuild].outputs).toContain("dist/**");
  });
});
