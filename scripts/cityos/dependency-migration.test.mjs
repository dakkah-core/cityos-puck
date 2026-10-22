import assert from "node:assert/strict";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { materializeManifest, resolveCatalog } from "../../packages/create-puck-app/manifest-catalog.js";
import { readDefaultCatalog } from "../toolchains/catalog-version.mjs";
import { formatSource } from "./format-source.mjs";
import { loadBootstrapCatalog } from "../../packages/create-puck-app/bootstrap-catalog.js";
import { prepareAmbientTypes } from "../toolchains/nextra-stable-docs/prepare-types.mjs";
import { planPacketInputCapture } from "../toolchains/nextra-stable-docs/source-inputs.mjs";
import { assembledRouteDigest, expectedRouteDigests } from "./docs-route-revisions.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const json = (path) => JSON.parse(read(path));
const catalog = readDefaultCatalog();
const core = json("packages/core/package.json");

test("Puppeteer release-age exceptions cover only the two approved exact versions", () => {
  const workspace = loadBootstrapCatalog().workspace;
  const exceptions = workspace.minimumReleaseAgeExclude;
  assert.ok(Array.isArray(exceptions));
  assert.deepEqual(
    exceptions.filter((entry) => entry.startsWith("puppeteer")),
    ["puppeteer@25.15.0", "puppeteer-core@25.15.0"],
  );
  assert.equal(workspace.minimumReleaseAge, undefined, "Preserve the native pnpm release-age default");
});

test("Nextra ambient source uses type queries without relative ambient import declarations", () => {
  const original = [
    "declare namespace globalThis {",
    "  import type { PagefindSearchOptions } from './types.js'",
    "  var pagefind: { options: PagefindSearchOptions } | undefined",
    "}",
    "declare module '*.svg' {",
    "  export { ReactComponent } from './icon.js'",
    "}",
    "declare module 'next-mdx-import-source-file' {",
    "  export { useMDXComponents } from 'nextra/mdx-components'",
    "}",
  ].join("\n");
  const expected = original
    .replace("import type { PagefindSearchOptions } from './types.js'", "type PagefindSearchOptions = import('./types.js').PagefindSearchOptions")
    .replace("export { ReactComponent } from './icon.js'", "const ReactComponent: typeof import('./icon.js').ReactComponent\n  export { ReactComponent }");
  assert.equal(prepareAmbientTypes(original), expected);
  assert.equal(prepareAmbientTypes(original.replaceAll("\n", "\r\n")).replaceAll("\r\n", "\n"), expected);
  for (const changed of [original.replace("PagefindSearchOptions } from", "ChangedOptions } from"), `${original}\n${original}`, expected]) {
    assert.throws(() => prepareAmbientTypes(changed), /NEXTRA_AMBIENT_SOURCE_CHANGED/u);
  }
  assert.doesNotMatch(read("scripts/toolchains/nextra-stable-docs/source-overlays/src/client/components/index.ts"), /@ts-expect-error/u);
});

test("Nextra source input capture refuses unnamed changes, removals and invalid paths", () => {
  const first = "a".repeat(64), second = "b".repeat(64);
  const previous = { schemaVersion: "cityos.nextra-stable-docs.packet-integrity-input.v1", status: "source-only", files: [{ path: "source.ts", sha256: first }] };
  const actual = [{ path: "source.ts", sha256: second }, { path: "new.ts", sha256: first }];
  const result = planPacketInputCapture(previous, actual, ["source.ts", "new.ts"]);
  assert.equal(result.status, previous.status);
  assert.deepEqual(result.files.map(({ path }) => path), ["new.ts", "source.ts"]);
  assert.equal(previous.files[0].sha256, first, "Never mutate the old input record");
  assert.throws(() => planPacketInputCapture(previous, actual, ["source.ts"]), /explicitly named/u);
  assert.throws(() => planPacketInputCapture(previous, [], []), /was removed/u);
  assert.throws(() => planPacketInputCapture(previous, actual, ["source.ts", "new.ts", "new.ts"]), /Duplicate/u);
  for (const path of ["../escape.ts", "/absolute.ts", "C:/absolute.ts", "source\\escape.ts", "./source.ts"]) {
    assert.throws(() => planPacketInputCapture(previous, [{ path, sha256: first }], [path]), /Invalid/u);
  }
});

test("Nextra source generation tools have direct owning catalog bindings", () => {
  const producer = json("scripts/toolchains/nextra-stable-docs/producer-inputs.json");
  const manifest = json("package.json");
  for (const name of producer.requiredToolCatalogKeys) {
    assert.equal(manifest.devDependencies[name], "catalog:", name);
    assert.match(catalog[name], /^\d+\.\d+\.\d+$/u, name);
  }
  assert.equal(catalog["@svgr/core"], "8.1.0");
  assert.equal(catalog["@svgr/plugin-jsx"], "8.1.0");
  assert.equal(catalog["@svgr/plugin-svgo"], "8.1.0");
  assert.equal(catalog["babel-plugin-react-compiler"], "1.0.0");
  assert.equal(catalog["react-compiler-webpack"], "1.1.0");
});

test("the actual catalog-only generator refreshes every snapshot and preserves recipe outputs", () => {
  const temporaryRoot = realpathSync(tmpdir());
  const fixture = mkdtempSync(join(temporaryRoot, "puck-catalog-snapshots-"));
  const identity = lstatSync(fixture, { bigint: true });
  const link = join(fixture, "node_modules");
  let linkIdentity;
  try {
    const copy = (source, target = source) => {
      const output = join(fixture, target);
      mkdirSync(dirname(output), { recursive: true });
      copyFileSync(new URL(source, root), output);
    };
    const snapshots = [
      ["pnpm-workspace.yaml", "dependency-catalog.yaml"],
      ["package.json", "workspace-package.json"],
      ["config/toolchains/node-typescript.json", "node-typescript.json"],
      ["packages/core/package.json", "core-package.json"],
      ["config/dependencies/plugin-ai.json", "plugin-ai-contract.json"],
    ];
    for (const [source] of snapshots) copy(source);
    for (const source of ["package.json", "bootstrap-catalog.js", "toolchain.cjs", "scripts/generate.js"]) {
      copy("packages/create-puck-app/" + source);
    }
    const bootstrap = loadBootstrapCatalog();
    for (const path of Object.values(bootstrap.workspace.patchedDependencies ?? {})) copy(path);
    const packageRoot = join(fixture, "packages/create-puck-app");
    mkdirSync(join(fixture, "recipes"));
    mkdirSync(join(packageRoot, "templates"));
    writeFileSync(join(fixture, "recipes/unrelated-output.txt"), "DO_NOT_COPY_RECIPE_OUTPUT\n");
    writeFileSync(join(packageRoot, "templates/kept.txt"), "PRESERVE_TEMPLATE_OUTPUT\n");
    for (const [, target] of snapshots) writeFileSync(join(packageRoot, target), "STALE_SNAPSHOT\n");
    symlinkSync(fileURLToPath(new URL("node_modules/", root)), link, "junction");
    linkIdentity = lstatSync(link, { bigint: true });
    const result = spawnSync(process.execPath,
      [join(packageRoot, "scripts/generate.js"), "--catalog-only"],
      { cwd: fixture, encoding: "utf8", windowsHide: true, timeout: 20_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /catalog inputs only/);
    for (const [source, target] of snapshots) {
      assert.deepEqual(readFileSync(join(packageRoot, target)), readFileSync(new URL(source, root)), target);
    }
    for (const path of Object.values(bootstrap.workspace.patchedDependencies ?? {})) {
      assert.deepEqual(readFileSync(join(packageRoot, path)), readFileSync(new URL(path, root)), path);
    }
    assert.equal(readFileSync(join(packageRoot, "templates/kept.txt"), "utf8"), "PRESERVE_TEMPLATE_OUTPUT\n");
    assert.equal(existsSync(join(packageRoot, "templates/unrelated-output.txt")), false);
  } finally {
    const current = lstatSync(fixture, { bigint: true });
    assert.equal(current.dev, identity.dev, "Fixture ownership changed; cleanup refused");
    assert.equal(current.ino, identity.ino, "Fixture ownership changed; cleanup refused");
    assert.equal(realpathSync(fixture), fixture);
    assert.equal(dirname(fixture), temporaryRoot);
    if (linkIdentity) {
      const currentLink = lstatSync(link, { bigint: true });
      assert.ok(currentLink.isSymbolicLink());
      assert.equal(currentLink.dev, linkIdentity.dev);
      assert.equal(currentLink.ino, linkIdentity.ino);
      unlinkSync(link);
    }
    rmSync(fixture, { recursive: true, force: true });
  }
});

function* files(directory) {
  for (const entry of readdirSync(new URL(directory, root), { withFileTypes: true })) {
    if (["node_modules", "dist", ".next", "build"].includes(entry.name)) continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

test("bootstrap catalog readers resolve scoped names and reject ambiguous syntax", () => {
  assert.equal(readDefaultCatalog('catalog:\n  "@scope/pkg": "1.2.3"\ncatalogs:\n')["@scope/pkg"], "1.2.3");
  assert.throws(() => readDefaultCatalog('catalog:\n  pkg: latest\n'), /Unsupported/u);
  assert.throws(() => readDefaultCatalog('catalog:\n  "pkg": "1"\n  "pkg": "2"\n'), /Duplicate/u);
  assert.throws(() => readDefaultCatalog("packages: []"), /Missing/u);
});

test("standalone manifests materialize default, named, optional, and peer catalogs without mutation", () => {
  const input = { dependencies: { react: "catalog:" }, devDependencies: { typescript: "catalog:" }, optionalDependencies: { yaml: "catalog:" }, peerDependencies: { react: "catalog:peers" } };
  const workspace = { catalog, catalogs: { peers: { react: `^${catalog.react}` } } };
  const result = materializeManifest(input, workspace);
  assert.equal(result.dependencies.react, catalog.react);
  assert.equal(result.devDependencies.typescript, catalog.typescript);
  assert.equal(result.optionalDependencies.yaml, catalog.yaml);
  assert.equal(result.peerDependencies.react, `^${catalog.react}`);
  assert.equal(input.dependencies.react, "catalog:");
  assert.throws(() => resolveCatalog("missing", "catalog:", workspace), /Missing concrete/u);
  assert.throws(() => materializeManifest({ dependencies: { core: "workspace:*" } }, workspace), /Standalone template/u);
});

test("every standalone recipe emits concrete public versions and the exact owned source identity", () => {
  for (const recipe of ["next", "next-ai", "react-router", "react-router-ai"]) {
    const source = read(`packages/create-puck-app/templates/${recipe}/package.json.hbs`)
      .replaceAll("{{appName}}", "catalog-regression")
      .replaceAll("{{puckVersion}}", `npm:${core.name}@${core.version}`)
      .replaceAll("{{puckSourceVersion}}", core.version)
      .replaceAll("{{packageManager}}", json("package.json").packageManager)
      .replaceAll("{{nodeEngine}}", json("package.json").engines.node);
    const result = materializeManifest(JSON.parse(source), { catalog });
    assert.equal(result.dependencies["@puckeditor/core"], `npm:${core.name}@${core.version}`);
    assert.equal(result.devDependencies.typescript, catalog.typescript);
    assert.equal(result.engines.node, json("package.json").engines.node);
    assert.doesNotMatch(JSON.stringify(result), /catalog:|workspace:/u);
    assert.equal(read(`packages/create-puck-app/templates/${recipe}/.nvmrc.hbs`).trim(), "{{nodeVersion}}");
  }
});

test("all public dependency declarations use their owning catalogs", () => {
  const manifests = ["package.json", ...["packages", "apps", "recipes"].flatMap((directory) =>
    readdirSync(new URL(directory, root), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `${directory}/${entry.name}/package.json`)
  )];
  for (const path of manifests) {
    const manifest = json(path);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, reference] of Object.entries(manifest[field] ?? {})) {
        if (reference.startsWith("workspace:")) {
          if (name === "@puckeditor/core") assert.equal(reference, `workspace:${core.name}@*`, path);
          continue;
        }
        assert.equal(reference, field === "peerDependencies" ? "catalog:peers" : "catalog:", `${path}/${name}`);
        assert.ok(catalog[name], `Missing catalog input ${path}/${name}`);
      }
    }
  }
});

test("React Router framework packages and both recipe consumers use one catalog family", () => {
  for (const name of ["@react-router/dev", "@react-router/node", "@react-router/serve"]) {
    assert.equal(catalog[name], catalog["react-router"], name);
  }
  for (const recipe of ["react-router", "react-router-ai"]) {
    const manifest = json(`recipes/${recipe}/package.json`);
    assert.equal(manifest.dependencies["react-router"], "catalog:");
    for (const name of ["@react-router/dev", "@react-router/node", "@react-router/serve"]) {
      assert.equal(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name], "catalog:", `${recipe}/${name}`);
    }
  }
});

test("TypeScript API compatibility stays inside exact third-party consumers", () => {
  assert.match(catalog.typescript, /^7\.\d+\.\d+$/u);
  assert.match(catalog["typescript-api"], /^npm:@typescript\/typescript6@6\./u);
  const workspace = read("pnpm-workspace.yaml");
  const scoped = [...workspace.matchAll(/^  "([^"\n]+)>typescript": "catalog:typescript-api"$/gmu)];
  assert.ok(scoped.length > 0);
  for (const [, selector] of scoped) assert.match(selector, /^(?:ts-jest|tsup|typescript-eslint|ts-api-utils|twoslash|tsconfck|@typescript-eslint\/[a-z-]+)@\d+\.\d+\.\d+$/u);
  assert.doesNotMatch(workspace, /^  (?:"typescript"|typescript): "catalog:typescript-api"$/mu);
  const require = createRequire(import.meta.url);
  const config = require("../../packages/core/jest.config.cjs");
  const transformer = config.transform["^.+\\.[tj]sx?$"][1];
  assert.equal(transformer.compiler, "typescript-api");
  assert.equal(transformer.diagnostics, false);
  assert.match(core.scripts.test, /typecheck\.mjs --noEmit && jest/u);
  assert.equal(core.devDependencies["ts-node"], undefined);
});

test("first-party and bootstrap TypeScript configs avoid removed compiler options", () => {
  for (const path of ["packages", "apps", "recipes"].flatMap((directory) => [...files(directory)])) {
    if (!/(?:tsconfig\/[^/]+\.json|tsconfig\.json(?:\.hbs)?)$/u.test(path)) continue;
    const options = json(path).compilerOptions ?? {};
    assert.ok(!["node", "node10", "classic"].includes(options.moduleResolution), path);
    assert.notEqual(String(options.target).toLowerCase(), "es5", path);
    assert.equal(options.baseUrl, undefined, path);
    assert.equal(options.plugins, undefined, path);
    for (const targets of Object.values(options.paths ?? {})) {
      for (const target of targets) assert.match(target, /^(?:\.\.?\/|\/)/u, path);
    }
  }
  for (const path of ["apps/demo/next.config.js", "apps/docs/next.config.mjs", "recipes/next/next.config.js", "recipes/next-ai/next.config.js"]) {
    assert.match(read(path), /useTypeScriptCli: true/u, path);
  }
});

test("Prettier 3 formatting awaits both configuration and formatting results", async () => {
  const calls = [];
  const formatted = await formatSource({
    async resolveConfig(path) { calls.push(path); return { semi: false }; },
    async format(source, options) { calls.push(options); return source + "\n"; },
  }, "const answer = 42", "fixture.ts");
  assert.equal(formatted, "const answer = 42\n");
  assert.deepEqual(calls, ["fixture.ts", { semi: false, filepath: "fixture.ts" }]);
  await assert.rejects(formatSource({ resolveConfig: async () => null, format: async () => { throw new Error("formatter failed"); } }, "", "fixture.ts"), /formatter failed/u);
});

test("Nextra content migration preserves every MDX route and interactive example body", () => {
  const fixture = json("scripts/cityos/fixtures/docs-route-migration.json");
  const expected = expectedRouteDigests(fixture, json("scripts/cityos/fixtures/docs-route-revisions.json"));
  for (const { path } of fixture.routes)
    assert.equal(assembledRouteDigest(path, read), expected.get(path), path);
});

test("owned Nextra renderer guard rejects MathJax explicitly without changing KaTeX settings", async () => {
  const { assertSupportedLatexRenderer } = await import("../toolchains/nextra-stable-docs/source-overlays/src/server/math-renderer.ts");
  for (const value of [undefined, false, true, { renderer: "katex", options: {} }]) {
    assert.equal(assertSupportedLatexRenderer(value), undefined);
  }
  assert.throws(() => assertSupportedLatexRenderer({ renderer: "mathjax" }), /NEXTRA_MATHJAX_UNSUPPORTED/u);
  assert.throws(() => assertSupportedLatexRenderer({ renderer: "unknown" }), /NEXTRA_UNSUPPORTED_MATH_RENDERER/u);
  const prefix = "scripts/toolchains/nextra-stable-docs/";
  for (const path of ["src/server/index.ts", "src/server/compile.ts"]) {
    assert.match(read(`${prefix}source-overlays/${path}`), /assertSupportedLatexRenderer\(/u, path);
  }
  const provenance = json(`${prefix}provenance.json`);
  assert.equal(provenance.activationAllowed, false);
  assert.deepEqual(provenance.manifestChanges.removeDependencies, ["better-react-mathjax"]);
  assert.equal(provenance.retiredSource.length, 1);
  assert.doesNotMatch(read(`${prefix}source-overlays/src/client/components/index.ts`), /better-react-mathjax|export.*MathJax/u);
  assert.doesNotMatch(read(`${prefix}source-overlays/src/types.ts`), /MathJaxOptions/u);
  assert.doesNotMatch(read(`${prefix}source-overlays/src/server/schemas.ts`), /MathJaxOptionsSchema|MathJax3Config/u);
  assert.doesNotMatch(read(`${prefix}source-overlays/src/server/rehype-plugins/index.ts`), /rehypeBetterReactMathjax/u);
  assert.match(read(`${prefix}source-overlays/src/server/compile.ts`), /latex && remarkMath/u);
  assert.match(read(`${prefix}source-overlays/src/server/compile.ts`), /\[rehypeKatex, latex.options\]/u);
  assert.match(read("apps/docs/next.config.mjs"), /nextra\(\{ latex: false \}\)/u);
});

test("owned Nextra preservation packet guards every route, example and public source boundary", () => {
  const input = json("scripts/toolchains/nextra-stable-docs/acceptance-inputs/preservation.json");
  const fixture = json(input.routeFixture);
  const actualRoutes = [...files("apps/docs/content")].filter((path) => path.endsWith(".mdx")).sort();
  const actualExamples = [...files("apps/docs/content")].filter((path) => path.endsWith(".examples.tsx")).sort();
  assert.equal(input.expectedRoutes, 117);
  assert.equal(input.expectedExamples, 44);
  assert.deepEqual(actualRoutes, fixture.routes.map(({ path }) => `apps/docs/content/${path}`).sort());
  assert.deepEqual(actualRoutes, input.routes.map(({ path }) => path).sort());
  assert.deepEqual(actualExamples, input.examples.map(({ path }) => path).sort());
  assert.equal(actualRoutes.length, input.expectedRoutes);
  assert.equal(actualExamples.length, input.expectedExamples);
  for (const { path, sha256 } of [...input.routes, ...input.examples, ...input.publicBoundarySources]) {
    const actual = createHash("sha256").update(read(path).replaceAll("\r\n", "\n")).digest("hex");
    assert.equal(actual, sha256, path);
  }
  assert.equal(core.name, input.publicPackage.name);
  assert.deepEqual(core.exports, input.publicPackage.exports);
});

test("owned Nextra metadata retirement stays inert without exact canonical patch registration", async () => {
  const require = createRequire(import.meta.url);
  const { fileURLToPath } = await import("node:url");
  const { createRegisteredMathJaxRetirement } = require("../toolchains/nextra-stable-docs/registered-retirement.cjs");
  const options = { repositoryRoot: fileURLToPath(root), readCatalog: readDefaultCatalog };
  const input = { name: "nextra", version: "4.6.1", dependencies: { "better-react-mathjax": "^2.3.0" } };
  const instance = createRegisteredMathJaxRetirement(options);
  assert.throws(() => instance.readPackage(input), /not initialized/u);
  const config = { patchedDependencies: {} };
  assert.equal(instance.initialize(config), config);
  assert.equal(instance.readPackage(input), input);
  assert.equal(input.dependencies["better-react-mathjax"], "^2.3.0");
  assert.throws(() => instance.initialize({ patchedDependencies: { nextra: "patches/unregistered.patch" } }), /Unexpected Nextra patch selector/u);
});
