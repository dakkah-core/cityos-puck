import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire, findPackageJSON } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import catalogReader from "../read-default-catalog.cjs";
import { assertNodeVersion, loadToolchain } from "../toolchain.mjs";
import { createCompletePackagePatch, inventoryPackage } from "./package-patch.mjs";

// Explicit generation only. Importing this module has no filesystem effects.
// There is deliberately no install, patch-registration or activation operation.
const packet = fileURLToPath(new URL("./", import.meta.url));
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const ownerURL = pathToFileURL(join(repository, "package.json"));
const ownerRequire = createRequire(ownerURL);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const fail = (message) => { throw new Error(`NEXTRA_SOURCE_PRODUCER: ${message}`); };

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`Symbolic link in producer input: ${path}`);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
    else fail(`Unsupported filesystem entry: ${path}`);
  }
}

function within(parent, child) {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function checkedPath(parent, path) {
  const result = resolve(parent, path);
  if (!within(parent, result)) fail(`Path escapes its owning directory: ${path}`);
  return result;
}

function verify(path, expected) {
  const actual = digest(readFileSync(path));
  if (actual !== expected) fail(`Input hash mismatch: ${path}`);
  return actual;
}

export function assertPreservedInputs(root = repository) {
  const preservation = json(join(packet, "acceptance-inputs/preservation.json"));
  for (const entry of [...preservation.routes, ...preservation.examples, ...preservation.publicBoundarySources]) {
    const path = checkedPath(root, entry.path);
    const actual = digest(readFileSync(path, "utf8").replaceAll("\r\n", "\n"));
    if (actual !== entry.sha256) fail(`Preserved first-party input changed: ${entry.path}`);
  }
  return preservation;
}

function tool(name, catalog) {
  const version = catalog[name];
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version)) {
    fail(`Missing exact stable owning-catalog tool selection: ${name}`);
  }
  const manifestPath = findPackageJSON(name, ownerURL);
  if (!manifestPath) fail(`Catalog-selected tool is not installed: ${name}`);
  const manifest = json(manifestPath);
  if (manifest.name !== name || manifest.version !== version) fail(`Installed tool differs from catalog: ${name}`);
  return { version, manifest, manifestPath };
}

export function preflight() {
  const toolchain = loadToolchain();
  assertNodeVersion(toolchain);
  if (process.env.NODE_ENV !== "production") fail("Generation requires the upstream production React compiler mode (NODE_ENV=production)");
  const provenance = json(join(packet, "provenance.json"));
  const inputs = json(join(packet, "producer-inputs.json"));
  const catalog = catalogReader.readDefaultCatalog();
  if (catalog.nextra !== provenance.upstream.version || catalog["nextra-theme-docs"] !== provenance.upstream.version) fail("Published Nextra/theme catalog identity differs from the exact source variant");
  const tools = Object.fromEntries(inputs.requiredToolCatalogKeys.map((name) => [name, tool(name, catalog)]));
  assert.equal(tools.typescript.version, toolchain.typescript);
  assert.match(tools.typescript.version, /^7\./u);
  verify(join(packet, provenance.upstream.archive), provenance.upstream.archiveSha256);
  verify(join(packet, provenance.upstream.manifest), provenance.upstream.manifestSha256);
  verify(join(packet, provenance.upstream.licenseFile), provenance.upstream.licenseSha256);
  verify(join(packet, provenance.publishedBaseline.archive), provenance.publishedBaseline.sha256);
  const integrity = `sha512-${createHash("sha512").update(readFileSync(join(packet, provenance.publishedBaseline.archive))).digest("base64")}`;
  assert.equal(integrity, provenance.publishedBaseline.integrity);
  const packetHashes = json(join(packet, "acceptance-inputs/packet-integrity.json"));
  for (const entry of packetHashes.files) verify(checkedPath(packet, entry.path), entry.sha256);
  const preservation = assertPreservedInputs();
  const integration = json(join(packet, "integration-inputs.json"));
  return { toolchain, provenance, inputs, catalog, tools, preservation, integration };
}

async function extractSources(tar, context, work, baselineRoot) {
  const { provenance } = context;
  const archiveRoot = provenance.upstream.archiveRoot;
  const prefix = `${archiveRoot}/packages/nextra/`;
  const pluginPath = `${archiveRoot}/${provenance.reactCompilerSource.path}`;
  const extraFiles = new Set(["setup-files.ts", "default-entry.ts", "tsconfig.json", "tsup.config.ts", "loader.cjs"]);
  await tar.x({
    file: join(packet, provenance.upstream.archive), cwd: work, strip: 1, strict: true,
    preservePaths: false,
    filter(path, entry) {
      const local = path.startsWith(prefix) ? path.slice(prefix.length) : null;
      const selected = path === pluginPath || (local !== null && (
        (local.startsWith("src/") && !local.includes("/__tests__/") && !/\.(?:test|spec)\.[^/]+$/u.test(local)) ||
        local.startsWith("styles/") || extraFiles.has(local)
      ));
      if (selected && !["File", "Directory"].includes(entry.type)) fail(`Non-regular archive input: ${path}`);
      return selected;
    },
  });
  const packageRoot = join(work, "packages/nextra");
  for (const entry of [...provenance.overlays, ...provenance.retiredSource, provenance.generatedInputToOmit]) {
    verify(checkedPath(packageRoot, entry.path), entry.beforeSha256);
  }
  for (const [path, expected] of Object.entries(provenance.retainedProducer)) verify(checkedPath(packageRoot, path), expected);
  verify(checkedPath(work, provenance.reactCompilerSource.path), provenance.reactCompilerSource.sha256);
  for (const entry of provenance.overlays) {
    await copyFile(checkedPath(join(packet, "source-overlays"), entry.path), checkedPath(packageRoot, entry.path));
  }
  for (const path of provenance.additions) {
    const target = checkedPath(packageRoot, path);
    if (existsSync(target)) fail(`New authored source collides with upstream: ${path}`);
    await copyFile(checkedPath(join(packet, "source-overlays"), path), target);
  }
  // Exclude retired/generated inputs from the emission source without removing
  // or changing any retained input, installed dependency or previous build.
  const { rename } = await import("node:fs/promises");
  for (const entry of [...provenance.retiredSource, provenance.generatedInputToOmit]) {
    const path = checkedPath(packageRoot, entry.path);
    await rename(path, `${path}.upstream-input`);
  }
  // The physical manifest retains published metadata; the retirement range
  // and source identities must agree with the exact owning source manifest.
  const canonicalManifest = json(join(packet, provenance.upstream.manifest));
  const manifest = json(join(baselineRoot, "package.json"));
  assert.equal(manifest.name, provenance.upstream.name);
  assert.equal(manifest.version, provenance.upstream.version);
  assert.deepEqual(manifest.exports, canonicalManifest.exports);
  for (const name of provenance.manifestChanges.removeDependencies) {
    if (!Object.hasOwn(manifest.dependencies, name) || manifest.dependencies[name] !== canonicalManifest.dependencies[name]) fail(`Missing or changed retirement edge: ${name}`);
    delete manifest.dependencies[name];
  }
  for (const [name, key] of Object.entries(provenance.manifestChanges.catalogBindings)) manifest.dependencies[name] = context.catalog[key];
  for (const field of provenance.manifestChanges.omitBuildOnlyFields) delete manifest[field];
  await writeFile(join(packageRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await copyFile(join(packet, provenance.upstream.licenseFile), join(packageRoot, "LICENSE"));
  for (const entry of readdirSync(baselineRoot, { withFileTypes: true })) {
    if (entry.isFile() && /^readme(?:\.[^/]+)?$/iu.test(entry.name)) await copyFile(join(baselineRoot, entry.name), join(packageRoot, entry.name));
  }
  return packageRoot;
}

async function prepareSvgAndImports(packageRoot, svgr) {
  const svgo = await import(pathToFileURL(ownerRequire.resolve("@svgr/plugin-svgo")).href);
  const jsx = await import(pathToFileURL(ownerRequire.resolve("@svgr/plugin-jsx")).href);
  const transforms = [];
  for (const path of [...files(join(packageRoot, "src"))]) {
    if (!path.endsWith(".svg")) continue;
    const target = path.replace(/\.svg$/u, ".tsx");
    if (existsSync(target)) fail(`SVG source target collision: ${relative(packageRoot, target)}`);
    const input = await readFile(path, "utf8");
    const transformed = await svgr.transform(input, {
      exportType: "named", namedExport: "ReactComponent", typescript: true,
      plugins: [svgo.default, jsx.default],
      svgoConfig: { plugins: ["removeXMLNS"] },
    }, { filePath: path, componentName: "SvgComponent" });
    const namedExport = /export\s*\{\s*SvgComponent\s+as\s+ReactComponent\s*\};?/gu;
    if ([...transformed.matchAll(namedExport)].length !== 1) fail(`Unexpected SVGR named-export source: ${relative(packageRoot, path)}`);
    let iconTypeSource = relative(dirname(target), join(packageRoot, "src/icon.js")).replaceAll(sep, "/");
    if (!iconTypeSource.startsWith(".")) iconTypeSource = `./${iconTypeSource}`;
    // Preserve the declaration contract of upstream's src/icon.ts alias. The
    // generated TSX implementation still receives the full ordinary SVG props.
    const output = transformed.replace(namedExport,
      `const ReactComponent = SvgComponent as typeof import(${JSON.stringify(iconTypeSource)}).ReactComponent;\nexport { ReactComponent };`);
    await writeFile(target, `${output}\n`);
    transforms.push({ source: relative(packageRoot, path).replaceAll(sep, "/"), inputSha256: digest(input), outputSha256: digest(`${output}\n`) });
  }
  for (const path of files(join(packageRoot, "src"))) {
    if (!/\.(?:ts|tsx)$/u.test(path)) continue;
    const input = await readFile(path, "utf8");
    // These are source-producer passes matching upstream's SVG and node:
    // import renderers. They never rewrite emitted JS or declarations.
    const output = input
      .replace(/(\bfrom\s+["'][^"'\n]+)\.svg(["'])/gu, "$1.js$2")
      .replace(/(\bfrom\s+["'])node:/gu, "$1");
    if (output !== input) {
      await writeFile(path, output);
      transforms.push({ source: relative(packageRoot, path).replaceAll(sep, "/"), inputSha256: digest(input), outputSha256: digest(output) });
    }
  }
  return transforms;
}

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`Source producer subprocess failed (${result.status}): ${args[0]}`);
}

function runtimeSource(path) {
  return /\.(?:ts|tsx)$/u.test(path) && !path.endsWith(".d.ts") &&
    !/[\\/]__tests__[\\/]/u.test(path) && !/\.(?:test|spec)\.[^/\\]+$/u.test(path) &&
    !path.endsWith(`${sep}src${sep}icon.ts`);
}

async function emit(packageRoot, work, context) {
  const esbuild = await import(pathToFileURL(ownerRequire.resolve("esbuild")).href);
  const svgr = await import(pathToFileURL(ownerRequire.resolve("@svgr/core")).href);
  const transforms = await prepareSvgAndImports(packageRoot, svgr);
  const bootstrap = join(packageRoot, ".producer");
  await mkdir(bootstrap);
  // setup-files.ts remains the owner of schema-derived configuration types.
  await esbuild.build({ entryPoints: [join(packageRoot, "setup-files.ts")], outfile: join(bootstrap, "setup-files.mjs"), bundle: true, packages: "external", platform: "node", format: "esm", target: "es2022" });
  runNode([join(bootstrap, "setup-files.mjs")], packageRoot);
  const generatedTypes = await readFile(join(packageRoot, "src/types.generated.ts"), "utf8");
  if (/better-react-mathjax|MathJaxOptions|renderer:\s*["']mathjax/u.test(generatedTypes)) fail("Generated schema types retain MathJax");
  const tsconfig = json(join(packageRoot, "tsconfig.json"));
  Object.assign(tsconfig.compilerOptions, {
    moduleResolution: "bundler", target: "es2022", module: "ESNext", noEmit: true,
    skipLibCheck: false, types: ["node", "react"], rootDir: "src", outDir: "dist",
  });
  delete tsconfig.compilerOptions.paths;
  tsconfig.include = ["src/**/*.ts", "src/**/*.tsx"];
  tsconfig.exclude = ["dist", "src/**/__tests__/**", "src/**/*.test.*", "src/**/*.spec.*"];
  const tsconfigPath = join(packageRoot, ".producer/tsconfig.json");
  // Resolve relative to the package, rather than the .producer directory.
  tsconfig.compilerOptions.rootDir = "../src";
  tsconfig.compilerOptions.outDir = "../dist";
  // Self references in upstream declarations must resolve to source before
  // dist exists; these are compiler paths in scratch, never runtime aliases.
  tsconfig.compilerOptions.paths = {
    nextra: ["../src/server/index.ts"],
    "nextra/*": ["../src/client/*"],
  };
  tsconfig.include = ["../src/**/*.ts", "../src/**/*.tsx"];
  tsconfig.exclude = ["../dist", "../src/**/__tests__/**", "../src/**/*.test.*", "../src/**/*.spec.*"];
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
  runNode([join(repository, "scripts/toolchains/typecheck.mjs"), "--project", tsconfigPath, "--noEmit"], packageRoot);
  runNode([join(repository, "scripts/toolchains/typecheck.mjs"), "--project", tsconfigPath, "--noEmit", "false", "--declaration", "--emitDeclarationOnly"], packageRoot);
  const pluginEntry = checkedPath(work, context.provenance.reactCompilerSource.path);
  const compiledPlugin = join(bootstrap, "react-compiler-plugin.mjs");
  await esbuild.build({ entryPoints: [pluginEntry], outfile: compiledPlugin, bundle: true, packages: "external", platform: "node", format: "esm", target: "es2022" });
  const { reactCompilerPlugin } = await import(pathToFileURL(compiledPlugin).href);
  await esbuild.build({
    absWorkingDir: packageRoot,
    entryPoints: [...files(join(packageRoot, "src"))].filter(runtimeSource),
    outbase: join(packageRoot, "src"), outdir: join(packageRoot, "dist"),
    bundle: false, packages: "external", platform: "node", format: "esm", target: "es2022", jsx: "automatic",
    plugins: [reactCompilerPlugin({ filter: /[\\/]src[\\/]client[\\/]/u })],
  });
  await writeFile(join(packageRoot, "dist/client/package.json"), '{"sideEffects":false}\n');
  for (const path of files(join(packageRoot, "dist"))) {
    if (!/\.(?:js|mjs|d\.ts|d\.mts)$/u.test(path)) continue;
    const output = await readFile(path, "utf8");
    if (/better-react-mathjax|mathjax-full|MathJaxContext|MathJaxOptions|MathJax3Config|rehypeBetterReactMathjax|renderer:\s*["']mathjax/u.test(output)) {
      fail(`Generated runtime/declaration retains retired integration: ${relative(packageRoot, path)}`);
    }
  }
  const variant = {
    upstream: { name: "nextra", version: "4.6.1", commit: context.provenance.upstream.commit },
    compatibility: context.provenance.compatibility,
    producer: "scripts/toolchains/nextra-stable-docs/generate.mjs",
    producerInputsSha256: digest(readFileSync(join(packet, "producer-inputs.json"))),
    packetInputsSha256: digest(readFileSync(join(packet, "acceptance-inputs/packet-integrity.json"))),
    tools: Object.fromEntries(Object.entries(context.tools).map(([key, value]) => [key, value.version])),
    sourceTransforms: transforms,
    acceptance: "Generated candidate only; acceptance and provider binding are separate parent-owned gates.",
    buildPluginLicense: "Retained upstream esbuild-react-compiler-plugin package metadata declares ISC; source archive and root MIT license are retained in the input packet.",
  };
  await writeFile(join(packageRoot, "dist/OWNED_VARIANT.json"), `${JSON.stringify(variant, null, 2)}\n`);
}

export async function generate(workDirectory) {
  const context = preflight();
  const permitted = resolve(repository, ".build/nextra-stable-docs");
  const work = resolve(workDirectory);
  if (!within(permitted, work) || existsSync(work)) fail("--work-dir must be a new child of .build/nextra-stable-docs");
  // Check every existing ancestor before any write; never follow a junction
  // into another checkout or machine directory.
  for (let path = dirname(work); within(repository, path); path = dirname(path)) {
    if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !within(realpathSync(repository), realpathSync(path)))) fail(`Unsafe output ancestor: ${path}`);
  }
  const tar = await import(pathToFileURL(ownerRequire.resolve("tar")).href);
  await mkdir(work, { recursive: true });
  const baselineRoot = join(work, "published-baseline");
  await mkdir(baselineRoot);
  await tar.x({ file: join(packet, context.provenance.publishedBaseline.archive), cwd: baselineRoot, strip: 1, strict: true, preservePaths: false,
    filter(path, entry) {
      if (!path.startsWith("package/")) fail(`Unexpected published package path: ${path}`);
      if (!["File", "Directory"].includes(entry.type)) fail(`Non-regular published package input: ${path}`);
      return true;
    },
  });
  const packageRoot = await extractSources(tar, context, work, baselineRoot);
  await emit(packageRoot, work, context);
  const artifacts = join(work, "artifacts");
  await mkdir(artifacts);
  const candidateRoot = join(work, "candidate-package");
  await mkdir(candidateRoot);
  const candidatePaths = ["package.json", "LICENSE", "loader.cjs", ...readdirSync(packageRoot).filter((name) => /^readme(?:\.[^/]+)?$/iu.test(name)),
    ...[...files(join(packageRoot, "dist")), ...files(join(packageRoot, "styles"))].map((path) => relative(packageRoot, path))];
  for (const path of candidatePaths) {
    const target = checkedPath(candidateRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(checkedPath(packageRoot, path), target);
  }
  const baselineInventory = inventoryPackage(baselineRoot);
  const candidateInventory = inventoryPackage(candidateRoot);
  const { patch, changedFiles } = createCompletePackagePatch(baselineRoot, candidateRoot, baselineInventory, candidateInventory);
  const patchName = context.integration.registration.path.split("/").at(-1);
  const patchPath = join(artifacts, patchName);
  await writeFile(patchPath, patch);
  const canonicalManifest = json(join(packet, context.provenance.upstream.manifest));
  const receipt = {
    schemaVersion: "cityos.nextra-stable-docs.generated-patch.v1",
    status: "complete-source-generated-patch",
    nonEvidence: "Generation is not qualification or activation. Parent must prove the real native hook/patch graph and public behavior before registration.",
    package: { name: "nextra", version: "4.6.1", originalDependency: "better-react-mathjax", originalRange: canonicalManifest.dependencies["better-react-mathjax"] },
    registration: context.integration.registration,
    patchSha256: digest(patch),
    sourceProvenanceSha256: digest(readFileSync(join(packet, "provenance.json"))),
    packetIntegritySha256: digest(readFileSync(join(packet, "acceptance-inputs/packet-integrity.json"))),
    publishedBaselineSha256: context.provenance.publishedBaseline.sha256,
    changedFiles, baselineInventory, candidateInventory,
    candidateDependencies: json(join(candidateRoot, "package.json")).dependencies,
  };
  await writeFile(`${patchPath}.provenance.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  return { packageRoot: candidateRoot, patchPath, provenancePath: `${patchPath}.provenance.json` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--work-dir") fail("Usage: generate.mjs --work-dir <new .build/nextra-stable-docs child>");
  console.log(JSON.stringify(await generate(process.argv[3])));
}
