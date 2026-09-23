import { execSync } from "node:child_process";
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
 * Aliased consumers must wait for the renamed core's real bundles. Configuration
 * packages are core prerequisites, including Turbo transit tasks with no script.
 * The real dry-run catches indirect cycles that inspecting one edge would miss.
 */
describe("CityOS core build ordering", () => {
  it("orders consumers after the actual fork package", () => {
    expect(manifest.name).toBe("@cityos-core/puck");
    expect(configuration.tasks.build.dependsOn).toContain(coreBuild);
  });

  it("retains normal dependency ordering", () => {
    expect(configuration.tasks.build.dependsOn).toContain("^build");
  });

  it("gives core an override without a self-dependency", () => {
    expect(configuration.tasks[coreBuild].dependsOn).toEqual(["^build"]);
    expect(configuration.tasks[coreBuild].dependsOn).not.toContain(coreBuild);
  });

  it("restores all emitted core bundles on cache hits", () => {
    expect(configuration.tasks[coreBuild].outputs).toContain("dist/**");
  });

  it.each(["tsconfig", "tsup-config", "eslint-config-custom"])(
    "keeps the %s transit task below core",
    (name) => {
      const task = configuration.tasks[`${name}#build`];
      expect(task.dependsOn).toEqual(["^build"]);
      expect(task.outputs).toEqual([]);
    }
  );

  it("evaluates the actual Turbo graph", () => {
    // Constant command only. Dry-run evaluates the installed tool's full task
    // graph without running a build, generating files, or publishing packages.
    const output = execSync("pnpm exec turbo run build --dry=json", {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const graph = JSON.parse(output);
    const recipe = graph.tasks.find((task: { taskId: string }) => {
      return task.taskId === "react-router-ai-recipe#build";
    });
    expect(recipe).toBeDefined();
    expect(recipe.dependencies).toContain(coreBuild);
  });
});
