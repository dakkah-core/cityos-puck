import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(__dirname, "../../..");
const coreRoot = resolve(repositoryRoot, "packages/core");
const manifest = JSON.parse(
  readFileSync(resolve(coreRoot, "package.json"), "utf8"),
);
const demo = JSON.parse(
  readFileSync(resolve(repositoryRoot, "apps/demo/tsconfig.json"), "utf8"),
);

/**
 * Runtime CSS verification must exercise the emitted client bundle, not source
 * or a legacy dist directory. Package prepare builds the artifacts before tests.
 * The full demo build independently verifies actual bundler/module resolution.
 */
describe("CityOS compiled bundle consumers", () => {
  it.each([
    "field-contentful",
    "plugin-emotion-cache",
    "plugin-heading-analyzer",
  ])(
    "checks %s with its declared build-tool types",
    (name) => {
      const result = spawnSync(
        process.execPath,
        [
          resolve(repositoryRoot, "scripts/toolchains/typecheck.mjs"),
          "--noEmit",
          "--project",
          resolve(repositoryRoot, "packages", name, "tsconfig.json"),
        ],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          windowsHide: true,
          timeout: 60_000,
        },
      );
      if (result.error || result.status !== 0)
        throw new Error(
          `Package compiler boundary failed: ${name}\n${String(result.error ?? "")}\n${String(result.stdout ?? "").slice(0, 5000)}${String(result.stderr ?? "").slice(0, 5000)}`,
        );
    },
    75_000,
  );
  it.each(["react-router", "react-router-ai"])(
    "checks the %s public export under its strict consumer compiler settings",
    (recipe) => {
      const fixture = mkdtempSync(join(tmpdir(), "puck-router-public-"));
      try {
        symlinkSync(
          resolve(repositoryRoot, "recipes", recipe, "node_modules"),
          join(fixture, "node_modules"),
          process.platform === "win32" ? "junction" : "dir",
        );
        writeFileSync(
          join(fixture, "consumer.tsx"),
          `import { Puck, FieldGroup, FieldTab } from "@puckeditor/core";
import type { Config } from "@puckeditor/core";
import type { ReactNode } from "react";
import "@puckeditor/core/puck.css";
const config: Config = { components: {}, root: { fields: { title: { type: "text" } }, renderFields: ({ fields }: { fields: Partial<Record<string, ReactNode>> }) => <FieldTab label="Content"><FieldGroup label="Content"><FieldGroup.Item>{fields.title}</FieldGroup.Item></FieldGroup></FieldTab> } };
export const Editor = () => <Puck config={config} data={{ root: { props: {} }, content: [] }} />;
`,
        );
        writeFileSync(
          join(fixture, "tsconfig.json"),
          JSON.stringify({
            extends: resolve(
              repositoryRoot,
              "recipes",
              recipe,
              "tsconfig.json",
            ),
            include: [],
            files: ["consumer.tsx"],
          }),
        );
        const result = spawnSync(
          process.execPath,
          [
            resolve(repositoryRoot, "scripts/toolchains/typecheck.mjs"),
            "--noEmit",
            "--project",
            join(fixture, "tsconfig.json"),
          ],
          {
            cwd: fixture,
            encoding: "utf8",
            windowsHide: true,
            timeout: 60_000,
          },
        );
        if (result.error || result.status !== 0)
          throw new Error(
            `Public consumer typecheck failed: ${recipe}\n${String(result.error ?? "")}\n${String(result.stdout ?? "").slice(0, 5000)}${String(result.stderr ?? "").slice(0, 5000)}`,
          );
      } finally {
        expect(dirname(realpathSync(fixture))).toBe(realpathSync(tmpdir()));
        expect(lstatSync(fixture).isSymbolicLink()).toBe(false);
        rmSync(fixture, { recursive: true, force: true });
      }
    },
    75_000,
  );
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
