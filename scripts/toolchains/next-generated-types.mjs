import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import Module, { createRequire, registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalGeneratedTypeValue, classifyGeneratedTypePath, frameGeneratedTypeField, planGeneratedTypePreparation, validateGeneratedTypeEvidence } from './generated-types-policy/generated-types-policy.mjs';
import { verifyGeneratedTypesPolicy } from './verify-generated-types-policy.mjs';
import { acquireNextOutputLocks, preflightNextNativeBinding } from './next-output-lock.mjs';
import { assertNextProductionMembership, createNextTypecheckOverlay } from './next-typecheck-overlay.mjs';

// Bind the verified observer before application configuration can run and
// replace a CommonJS cache entry. Reverify its bytes at the check boundary.
verifyGeneratedTypesPolicy();
const { collectCompilerResolutionMetadata, captureCompilerInputs } = createRequire(import.meta.url)('./generated-types-policy/compiler-input-evidence.cjs');
const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
export function digestNextConfigInputs(fields) {
  const digest = createHash('sha256');
  for (const field of fields) digest.update(frameGeneratedTypeField(field));
  return digest.digest('hex');
}
const regular = file => existsSync(file) && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink();
function local(root, file) {
  const ref = relative(root, file);
  if (!ref || isAbsolute(ref) || ref === '..' || ref.startsWith(`..${sep}`)) throw new Error(`Path outside app: ${file}`);
  return ref.split(sep).join('/');
}
export function fingerprintNextSource(app, owner) {
  const digest = createHash('sha256');
  const addField = value => digest.update(frameGeneratedTypeField(value));
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      // Dependencies and Git metadata are not authored application inputs.
      // Framework output is excluded below only for the observed owner.
      if (['node_modules', '.git'].includes(entry.name)) continue;
      const path = join(dir, entry.name), ref = local(app, path);
      if (classifyGeneratedTypePath({ path: ref, owners: [owner] }) === 'transient-framework-output') continue;
      if (entry.isSymbolicLink()) throw new Error(`Source input is a symbolic link: ${ref}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) { addField(ref); addField(readFileSync(path)); }
    }
  }
  walk(app);
  return digest.digest('hex');
}
// Track local modules outside the app as they are loaded, before their code can
// change them. Installed dependencies are governed by the package lock instead.
function externalSource(app, file) {
  const path = realpathSync(file);
  const ref = relative(app, path);
  if (!isAbsolute(ref) && ref !== '..' && !ref.startsWith(`..${sep}`)) return null;
  if (path.split(sep).includes('node_modules')) return null;
  return path;
}
function snapshotExternalFiles(app, files) {
  const result = {};
  for (const file of files) {
    if (!regular(file)) throw new Error(`External source is missing or redirected: ${file}`);
    const path = externalSource(app, file);
    if (path) result[resolve(file)] = [path, sha(readFileSync(path))];
  }
  return result;
}
function assertExternalFiles(snapshot) {
  for (const [file, value] of Object.entries(snapshot)) {
    const [target, digest] = Array.isArray(value) ? value : [file, value];
    if (!regular(file) || realpathSync(file) !== target || sha(readFileSync(file)) !== digest) throw new Error(`External Next input changed: ${file}`);
  }
}
function trackExternalConfig(app, snapshot, restricted = false) {
  return registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith('file:')) {
        const file = fileURLToPath(url);
        if (regular(file)) {
          const path = externalSource(app, file);
          if (path) {
            const digest = sha(readFileSync(path));
            if (snapshot[path] && snapshot[path] !== digest) throw new Error(`External Next input changed: ${path}`);
            if (!snapshot[path] && restricted) throw new Error(`Untracked external Next config import: ${path}`);
            snapshot[path] = digest;
          }
        }
      }
      return nextLoad(url, context);
    },
  });
}
function effectiveNextConfigDigest(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      (config.cacheLife !== undefined && (!config.cacheLife || typeof config.cacheLife !== 'object' || Array.isArray(config.cacheLife)))) throw new Error('Invalid effective Next configuration');
  return sha(canonicalGeneratedTypeValue({
    distDir: config.distDir,
    cacheLife: config.cacheLife ?? {},
    tsconfigPath: config.typescript?.tsconfigPath,
    typedRoutes: config.typedRoutes,
    pageExtensions: config.pageExtensions,
    disableStaticImages: config.images?.disableStaticImages,
    strictRouteTypes: config.experimental?.strictRouteTypes,
    useTypeScriptCli: config.experimental?.useTypeScriptCli,
    lockDistDir: config.experimental?.lockDistDir,
    useWasmBinary: config.experimental?.useWasmBinary,
  }));
}
// Next typegen calls these functions while building its route manifest. Bind
// their returned values, not their source or function identity, to the check.
async function customRouteDigest(kind, fn) {
  if (fn === undefined || fn === null) return null;
  if (typeof fn !== 'function') throw new Error(`Invalid Next ${kind} configuration`);
  const value = await fn();
  const routeLists = kind === 'redirects' || Array.isArray(value) ? [value] :
    value && typeof value === 'object' && Object.keys(value).every(key => ['beforeFiles', 'afterFiles', 'fallback'].includes(key))
      ? ['beforeFiles', 'afterFiles', 'fallback'].map(key => value[key] ?? []) : null;
  if (!routeLists || routeLists.some(list => !Array.isArray(list) || list.some(route => !route || typeof route !== 'object' || typeof route.source !== 'string'))) {
    throw new Error(`Invalid Next ${kind} result`);
  }
  return sha(canonicalGeneratedTypeValue(value));
}
async function observeCustomRoutes(config) {
  const { redirects, rewrites } = config;
  return { redirects: await customRouteDigest('redirects', redirects), rewrites: await customRouteDigest('rewrites', rewrites) };
}
// Re-load in a separate process so the post-check observation cannot reuse
// cached config modules or closures from the preflight. This is a stability
// check, not a complete record of files read by the config or compiler.
async function observeFinalConfig(baselinePath) {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const hook = trackExternalConfig(baseline.app, baseline.files, true);
  try {
    const appRequire = createRequire(join(baseline.app, 'package.json'));
    const nextRequire = createRequire(appRequire.resolve('next/package.json'));
    const config = await nextRequire('next/dist/server/config').default(nextRequire('next/constants').PHASE_PRODUCTION_BUILD, baseline.app);
    const effectiveConfig = effectiveNextConfigDigest(config);
    const customRoutes = await observeCustomRoutes(config);
    assertExternalFiles(baseline.files);
    if (effectiveConfig !== baseline.effectiveConfig) throw new Error('Effective Next configuration changed during checking');
    for (const kind of ['redirects', 'rewrites']) {
      if (customRoutes[kind] !== baseline.customRoutes[kind]) throw new Error(`Effective Next ${kind} routes changed during checking`);
    }
    writeFileSync(baseline.finalAttestation, JSON.stringify({ effectiveConfig, customRoutes }), { flag: 'wx' });
  } finally { hook.deregister(); }
}
// The typegen child loads the config again. Restrict it to the modules observed
// during the parent preflight, then compare the actual config used by Next
// before Next can install dependencies or write to an unleased output tree.
if (process.env.PUCK_NEXT_CONFIG_BASELINE) {
  const baseline = JSON.parse(readFileSync(process.env.PUCK_NEXT_CONFIG_BASELINE, 'utf8'));
  trackExternalConfig(baseline.app, baseline.files, true);
  const load = Module._load;
  Module._load = function(request, parent, ...rest) {
    const result = load.call(this, request, parent, ...rest);
    if (parent?.filename !== baseline.typegenModule || Module._resolveFilename(request, parent) !== baseline.configModule) return result;
    if (typeof result?.default !== 'function') throw new Error('Next typegen configuration hook is unsupported');
    return { ...result, __esModule: true, default: async (...args) => {
      const config = await result.default(...args);
      const digest = effectiveNextConfigDigest(config);
      if (digest !== baseline.effectiveConfig) throw new Error('Effective Next configuration differs during type generation');
      for (const kind of ['redirects', 'rewrites']) {
        const original = config[kind];
        if (baseline.customRoutes[kind] === null) {
          if (original !== undefined && original !== null) throw new Error(`Effective Next ${kind} configuration differs during type generation`);
          continue;
        }
        if (typeof original !== 'function') throw new Error(`Effective Next ${kind} configuration differs during type generation`);
        config[kind] = async function(...routeArgs) {
          // Invoke exactly once, with Next's original receiver and arguments.
          // Return the same result that was checked to the route manifest.
          const value = await Reflect.apply(original, this, routeArgs);
          const observed = await customRouteDigest(kind, () => value);
          if (observed !== baseline.customRoutes[kind]) throw new Error(`Effective Next ${kind} routes differ during type generation`);
          writeFileSync(`${baseline.attestation}-${kind}`, observed, { flag: 'wx' });
          return value;
        };
      }
      writeFileSync(baseline.attestation, digest, { flag: 'wx' });
      return config;
    } };
  };
}
function compilerExternalSources(compiler, project, app, env) {
  const listed = requireSuccess(command(compiler, ['-p', project, '--listFilesOnly'], app, env), 'TypeScript initial membership');
  return snapshotExternalFiles(app, listed.trim().split(/\r?\n/u).filter(Boolean));
}
function command(entry, args, app, env) {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: app, env, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
function requireSuccess(result, name) {
  if (result.status !== 0) throw new Error(`${name} failed (${result.status}):\n${result.stdout}${result.stderr}`);
  return result.stdout;
}
const membershipKey = file => process.platform === 'win32' ? file.toLowerCase() : file;
function parseCompilerMembership(stdout) {
  if (typeof stdout !== 'string' || !stdout.endsWith('\n')) throw new Error('Ambiguous compiler membership');
  const lines = stdout.split(/\r?\n/u); lines.pop();
  const seen = new Set();
  const files = lines.map(line => {
    if (!line || !isAbsolute(line) || line.includes('\0')) throw new Error('Ambiguous compiler membership');
    const file = resolve(line), key = membershipKey(file);
    if (seen.has(key) || !statSync(file).isFile()) throw new Error('Invalid compiler membership');
    seen.add(key); return file;
  });
  if (!files.length) throw new Error('Empty compiler membership');
  return files.sort((a, b) => membershipKey(a) < membershipKey(b) ? -1 : membershipKey(a) > membershipKey(b) ? 1 : 0);
}
// This checks a stability fence; it does not establish all resolution reads.
export function checkNextDiagnosticMembership({ list, check, validate }) {
  // Verify the projected adapter before executing it; standalone templates
  // carry the same bytes and need no sibling CMS checkout.
  verifyGeneratedTypesPolicy();
  const observeMetadata = files => {
    const metadata = collectCompilerResolutionMetadata(process.cwd(), files);
    return metadata.length ? captureCompilerInputs(process.cwd(), metadata).sha256 : sha('[]');
  };
  const before = parseCompilerMembership(requireSuccess(list(), 'TypeScript membership'));
  validate(before);
  const digests = before.map(file => sha(readFileSync(file)));
  const physical = before.map(file => membershipKey(realpathSync(file)));
  const resolution = observeMetadata(before);
  const unchanged = files => files.every((file, index) => sha(readFileSync(file)) === digests[index]
    && membershipKey(realpathSync(file)) === physical[index]);
  const checked = check();
  const diagnostic = parseCompilerMembership(requireSuccess(checked, 'TypeScript check'));
  const same = files => before.length === files.length && before.every((file, index) => membershipKey(file) === membershipKey(files[index]));
  if (!same(diagnostic)) throw new Error('Next diagnostic compiler membership differs from preparation');
  const after = parseCompilerMembership(requireSuccess(list(), 'TypeScript membership'));
  if (!same(after)) throw new Error('Next compiler membership changed during check');
  if (after.some((file, index) => sha(readFileSync(file)) !== digests[index])) throw new Error('TypeScript inputs changed during check');
  if (after.some((file, index) => membershipKey(realpathSync(file)) !== physical[index]) || observeMetadata(after) !== resolution) throw new Error('Next resolution metadata changed or compiler input retargeted during check');
  return { ...checked, verifyResolutionCurrentness() {
    if (!unchanged(before) || observeMetadata(before) !== resolution) throw new Error('Next resolution metadata changed or compiler input retargeted after check');
  } };
}
function assertSafeOutputTree(app, distDir) {
  const carrier = join(app, 'next-env.d.ts');
  if (existsSync(carrier) && !regular(carrier)) throw new Error('Next declaration carrier is redirected');
  const tree = join(app, distDir, 'types');
  function inspect(path) {
    if (!existsSync(path)) return;
    const entry = lstatSync(path);
    if (entry.isSymbolicLink()) throw new Error(`Next type output is redirected: ${path}`);
    if (entry.isDirectory()) for (const name of readdirSync(path)) inspect(join(path, name));
    else if (!entry.isFile()) throw new Error(`Unexpected Next output: ${path}`);
  }
  inspect(tree);
}

// The caller owns appDir. Workspace and standalone use the same policy and tools.
export async function runNextTypecheck({ appDir = process.cwd(), catalogPath, lockPath, project = 'tsconfig.json' } = {}) {
  verifyGeneratedTypesPolicy();
  if (process.env.NODE_ENV !== 'production' || process.env.CI !== '1') throw new Error('Next preflight requires NODE_ENV=production and CI=1');
  const app = realpathSync(resolve(appDir));
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  if (process.versions.node !== catalog.node) throw new Error(`Expected Node ${catalog.node}; received ${process.versions.node}`);
  if (!regular(lockPath)) throw new Error(`Missing package lock: ${lockPath}`);
  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  if (!(manifest.dependencies?.next || manifest.devDependencies?.next)) throw new Error('Application has no direct Next dependency');
  const appRequire = createRequire(join(app, 'package.json'));
  const nextManifest = appRequire.resolve('next/package.json');
  preflightNextNativeBinding(nextManifest);
  const nextPackage = JSON.parse(readFileSync(nextManifest, 'utf8'));
  const nextRequire = createRequire(nextManifest);
  const compilerManifest = appRequire.resolve('typescript/package.json');
  const compilerPackage = JSON.parse(readFileSync(compilerManifest, 'utf8'));
  if (compilerPackage.version !== catalog.typescript) throw new Error(`Expected TypeScript ${catalog.typescript}; received ${compilerPackage.version}`);
  const compiler = resolve(dirname(compilerManifest), typeof compilerPackage.bin === 'string' ? compilerPackage.bin : compilerPackage.bin?.tsc ?? '');
  if (!regular(compiler)) throw new Error('TypeScript compiler executable is missing');
  // Mirror Next's required type-package presence checks before it can install.
  for (const name of ['@types/react', '@types/node']) {
    const path = appRequire.resolve(`${name}/package.json`);
    if (!regular(join(dirname(path), 'index.d.ts'))) throw new Error(`Required ${name} declaration is missing`);
  }
  const selected = resolve(app, project);
  const projectRef = local(app, selected);
  if (!regular(selected)) throw new Error(`Missing compiler project: ${projectRef}`);
  if (realpathSync(selected) !== selected) throw new Error(`Compiler project is redirected: ${projectRef}`);
  // Config executes user code before its distDir is known. Capture the app and
  // external toolchain inputs before that execution, then reject changes made
  // while resolving it. The normal distDir-aware snapshot follows below.
  const beforeConfig = () => ({
    source: fingerprintNextSource(app, { path: '.', framework: 'next', distDir: '.next' }),
    inputs: sha(Buffer.concat([readFileSync(catalogPath), readFileSync(lockPath), readFileSync(nextManifest), readFileSync(compilerManifest)])),
  });
  const initialConfigInputs = beforeConfig();
  const compilerInputs = compilerExternalSources(compiler, selected, app, process.env);
  const configInputs = {};
  const configHook = trackExternalConfig(app, configInputs);
  let config;
  let customRoutes;
  try {
    config = await nextRequire('next/dist/server/config').default(nextRequire('next/constants').PHASE_PRODUCTION_BUILD, app);
    customRoutes = await observeCustomRoutes(config);
  } finally { configHook.deregister(); }
  assertExternalFiles(configInputs);
  assertExternalFiles(compilerInputs);
  if (JSON.stringify(beforeConfig()) !== JSON.stringify(initialConfigInputs)) throw new Error('Next inputs changed during config loading');
  if (config.experimental?.useTypeScriptCli !== true || config.experimental?.lockDistDir !== true || config.experimental?.useWasmBinary) throw new Error('Next must enable CLI mode and native output locking');
  const distDir = config.distDir;
  if (typeof distDir !== 'string' || isAbsolute(distDir) || distDir.includes('\\') || distDir.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe Next distDir');
  const nextConfigProject = resolve(app, config.typescript?.tsconfigPath ?? 'tsconfig.json');
  local(app, nextConfigProject);
  if (!regular(nextConfigProject)) throw new Error('Next selected tsconfig is missing or redirected');
  if (realpathSync(nextConfigProject) !== nextConfigProject) throw new Error('Next selected tsconfig is redirected');
  if (JSON.stringify(beforeConfig()) !== JSON.stringify(initialConfigInputs)) throw new Error('Next inputs changed after config loading');
  const effectiveConfig = effectiveNextConfigDigest(config);
  const owner = { path: '.', framework: 'next', distDir, cacheLifeEnabled: !!config.cacheLife && Object.keys(config.cacheLife).length > 0 };
  const observed = () => {
    assertExternalFiles(configInputs);
    assertExternalFiles(compilerInputs);
    return { routes: fingerprintNextSource(app, owner), config: digestNextConfigInputs([readFileSync(catalogPath), readFileSync(nextConfigProject), readFileSync(selected), readFileSync(nextManifest), readFileSync(compilerManifest), Buffer.from(JSON.stringify({ configInputs, compilerInputs, effectiveConfig, customRoutes }))]), lock: sha(readFileSync(lockPath)) };
  };
  const inputDigests = observed();
  const routes = nextRequire('next/dist/lib/find-pages-dir').findPagesDir(app);
  const temporary = mkdtempSync(join(tmpdir(), 'puck-next-preflight-'));
  let release;
  let overlayDirectory;
  try {
    // The Next writer is tested on a copy before it can touch an app config.
    const original = readFileSync(nextConfigProject);
    const dryConfig = join(temporary, 'tsconfig.json');
    writeFileSync(dryConfig, original);
    await nextRequire('next/dist/lib/typescript/writeConfigurationDefaults').writeConfigurationDefaults(compilerPackage.version, dryConfig, false, !!routes.appDir, distDir, !!routes.pagesDir, !!config.experimental.strictRouteTypes);
    if (!readFileSync(dryConfig).equals(original)) throw new Error(`Next would rewrite config: ${nextConfigProject}`);
    release = await acquireNextOutputLocks({ appDir: app, nextManifest, distDir, lockingEnabled: true });
    if (!readFileSync(nextConfigProject).equals(original)) throw new Error(`Next config changed before generation: ${nextConfigProject}`);
    if (JSON.stringify(observed()) !== JSON.stringify(inputDigests)) throw new Error('Next inputs changed before generation');
    assertSafeOutputTree(app, distDir);
    // No native fallback download or dependency installer may be selected.
    const env = { ...process.env, NODE_ENV: 'production', CI: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_DISABLE_SWC_WASM: '1', NEXT_IGNORE_INCORRECT_LOCKFILE: '1' };
    const policy = planGeneratedTypePreparation({ owner, projects: [projectRef], toolchain: { node: catalog.node, compiler: `${compilerPackage.version}:${sha(readFileSync(compiler))}`, generator: `${nextPackage.version}:${sha(readFileSync(nextManifest))}` }, inputDigests });
    const baselinePath = join(temporary, 'config-inputs.json');
    const attestation = join(temporary, 'effective-config');
    const finalAttestation = join(temporary, 'final-effective-config.json');
    writeFileSync(baselinePath, JSON.stringify({ app, files: configInputs, effectiveConfig, customRoutes, attestation, finalAttestation,
      typegenModule: nextRequire.resolve('next/dist/cli/next-typegen'), configModule: nextRequire.resolve('next/dist/server/config') }));
    const generated = command(appRequire.resolve('next/dist/bin/next'), ['typegen'], app, { ...env, PUCK_NEXT_CONFIG_BASELINE: baselinePath, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(fileURLToPath(import.meta.url)).href}`.trim() });
    requireSuccess(generated, 'Next typegen');
    if (!regular(attestation) || readFileSync(attestation, 'utf8') !== effectiveConfig) throw new Error('Effective Next configuration observation is missing or invalid');
    for (const [kind, digest] of Object.entries(customRoutes)) {
      const proof = `${attestation}-${kind}`;
      if (digest !== null && (!regular(proof) || readFileSync(proof, 'utf8') !== digest)) throw new Error(`Effective Next ${kind} observation is missing or invalid`);
    }
    if (JSON.stringify(observed()) !== JSON.stringify(inputDigests)) throw new Error('Next inputs changed during generation');
    if (!readFileSync(nextConfigProject).equals(original)) throw new Error(`Next modified config: ${nextConfigProject}`);
    const outputs = {};
    for (const ref of policy.requiredOutputs) {
      const file = resolve(app, ref);
      if (!regular(file)) throw new Error(`Missing generated output: ${ref}`);
      outputs[ref] = sha(readFileSync(file));
    }
    const carrier = readFileSync(join(app, 'next-env.d.ts'), 'utf8').replaceAll('\\', '/');
    if (!carrier.includes(`./${distDir}/types/routes.d.ts`) || !carrier.includes(`./${distDir}/types/root-params.d.ts`)) throw new Error('Next generated an unexpected declaration carrier');
    const show = requireSuccess(command(compiler, ['--showConfig', '-p', selected], app, env), 'TypeScript project discovery');
    const overlay = createNextTypecheckOverlay({ appDir: app, project: selected, effective: JSON.parse(show), distDir, requiredOutputs: policy.requiredOutputs });
    overlayDirectory = mkdtempSync(join(app, distDir, 'puck-typecheck-'));
    const overlayPath = join(overlayDirectory, 'tsconfig.json');
    writeFileSync(overlayPath, JSON.stringify(overlay));
    const checked = checkNextDiagnosticMembership({
      list: () => command(compiler, ['-p', overlayPath, '--listFilesOnly', '--pretty', 'false'], app, env),
      check: () => command(compiler, ['-p', overlayPath, '--noEmit', '--listFiles', '--listFilesOnly', 'false', '--pretty', 'false'], app, env),
      validate(memberFiles) {
        assertNextProductionMembership({ appDir: app, files: memberFiles, distDir });
        const finalCompilerInputs = snapshotExternalFiles(app, memberFiles);
        for (const [file, digest] of Object.entries(finalCompilerInputs)) {
          if (JSON.stringify(compilerInputs[file]) !== JSON.stringify(digest)) throw new Error(`Untracked or changed external compiler source: ${file}`);
        }
        if (JSON.stringify(observed()) !== JSON.stringify(inputDigests)) throw new Error('Next inputs changed before typechecking');
      },
    });
    const finalEnv = { ...process.env };
    delete finalEnv.PUCK_NEXT_CONFIG_BASELINE;
    const finalCheck = command(fileURLToPath(import.meta.url), ['--observe-final-config', baselinePath], app, finalEnv);
    requireSuccess(finalCheck, 'Next final effective configuration observation');
    if (!regular(finalAttestation)) throw new Error('Final effective Next configuration observation is missing');
    let finalObservation;
    try { finalObservation = JSON.parse(readFileSync(finalAttestation, 'utf8')); }
    catch { throw new Error('Final effective Next configuration observation is invalid'); }
    if (JSON.stringify(finalObservation) !== JSON.stringify({ effectiveConfig, customRoutes })) throw new Error('Final effective Next configuration observation differs');
    checked.verifyResolutionCurrentness();
    for (const [ref, digest] of Object.entries(outputs)) {
      const file = resolve(app, ref);
      if (!regular(file) || sha(readFileSync(file)) !== digest) throw new Error(`Generated output changed during checking: ${ref}`);
    }
    const diagnostics = validateGeneratedTypeEvidence(policy, { success: true, toolchain: policy.evidence.toolchain, inputDigests, finalInputDigests: observed(), projects: policy.projects, outputs });
    if (diagnostics.length) throw new Error(diagnostics.join('; '));
    return { status: 0, generated: generated.stdout, checked: '', outputs: policy.requiredOutputs };
  } finally {
    if (overlayDirectory) rmSync(overlayDirectory, { recursive: true, force: true });
    if (release) release();
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === '--observe-final-config' && process.argv.length === 4) {
    await observeFinalConfig(process.argv[3]);
  } else {
    if (process.argv.length !== 3 || !['--workspace', '--standalone'].includes(mode)) throw new Error('Usage: next-generated-types.mjs --workspace|--standalone');
    const app = realpathSync(process.cwd());
    const root = mode === '--workspace' ? resolve(here, '../..') : app;
    if (mode === '--workspace') {
      const ref = local(root, app);
      const rootRequire = createRequire(join(root, 'package.json'));
      const workspace = rootRequire('yaml').parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'));
      const glob = rootRequire('glob');
      if (!Array.isArray(workspace.packages) || workspace.packages.some(pattern => typeof pattern !== 'string' || pattern.startsWith('!'))) throw new Error('Unsupported workspace membership configuration');
      if (!workspace.packages.some(pattern => glob.sync(`${pattern}/package.json`, { cwd: root, nodir: true }).some(path => resolve(root, path).toLowerCase() === resolve(root, ref, 'package.json').toLowerCase()))) throw new Error('Expected a registered Puck workspace');
    }
    const catalogPath = mode === '--workspace' ? join(root, 'config/toolchains/node-typescript.json') : join(here, 'node-typescript.json');
    const locks = mode === '--workspace' ? [join(root, 'pnpm-lock.yaml')] : ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].map(name => join(app, name)).filter(regular);
    if (locks.length !== 1) throw new Error('Exactly one package lock is required');
    Object.assign(process.env, { NODE_ENV: 'production', CI: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_DISABLE_SWC_WASM: '1', NEXT_IGNORE_INCORRECT_LOCKFILE: '1' });
    const result = await runNextTypecheck({ appDir: app, catalogPath, lockPath: locks[0] });
    process.stdout.write(result.generated + result.checked);
  }
}
