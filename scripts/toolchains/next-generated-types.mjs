import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyGeneratedTypePath, planGeneratedTypePreparation, validateGeneratedTypeEvidence } from './generated-types-policy/generated-types-policy.mjs';
import { verifyGeneratedTypesPolicy } from './verify-generated-types-policy.mjs';
import { acquireNextOutputLocks, preflightNextNativeBinding } from './next-output-lock.mjs';
import { assertNextProductionMembership, createNextTypecheckOverlay } from './next-typecheck-overlay.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const regular = file => existsSync(file) && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink();
function local(root, file) {
  const ref = relative(root, file);
  if (!ref || isAbsolute(ref) || ref === '..' || ref.startsWith(`..${sep}`)) throw new Error(`Path outside app: ${file}`);
  return ref.split(sep).join('/');
}
function fingerprint(app, owner) {
  const digest = createHash('sha256');
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', '.git', '.build', '.turbo', 'coverage', 'dist', 'out'].includes(entry.name)) continue;
      const path = join(dir, entry.name), ref = local(app, path);
      if (classifyGeneratedTypePath({ path: ref, owners: [owner] }) === 'transient-framework-output') continue;
      if (entry.isSymbolicLink()) throw new Error(`Source input is a symbolic link: ${ref}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) digest.update(ref).update('\0').update(readFileSync(path)).update('\0');
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
// The typegen child loads the config again. Restrict it to the modules observed
// during the parent preflight and verify each before it executes.
if (process.env.PUCK_NEXT_CONFIG_BASELINE) {
  const baseline = JSON.parse(readFileSync(process.env.PUCK_NEXT_CONFIG_BASELINE, 'utf8'));
  trackExternalConfig(baseline.app, baseline.files, true);
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
    source: fingerprint(app, { path: '.', framework: 'next', distDir: '.next' }),
    inputs: sha(Buffer.concat([readFileSync(catalogPath), readFileSync(lockPath), readFileSync(nextManifest), readFileSync(compilerManifest)])),
  });
  const initialConfigInputs = beforeConfig();
  const compilerInputs = compilerExternalSources(compiler, selected, app, process.env);
  const configInputs = {};
  const configHook = trackExternalConfig(app, configInputs);
  let config;
  try {
    config = await nextRequire('next/dist/server/config').default(nextRequire('next/constants').PHASE_PRODUCTION_BUILD, app);
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
  const owner = { path: '.', framework: 'next', distDir, cacheLifeEnabled: !!config.cacheLife && Object.keys(config.cacheLife).length > 0 };
  const observed = () => {
    assertExternalFiles(configInputs);
    assertExternalFiles(compilerInputs);
    return { routes: fingerprint(app, owner), config: sha(Buffer.concat([readFileSync(catalogPath), readFileSync(nextConfigProject), readFileSync(selected), readFileSync(nextManifest), readFileSync(compilerManifest), Buffer.from(JSON.stringify({ configInputs, compilerInputs }))])), lock: sha(readFileSync(lockPath)) };
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
    writeFileSync(baselinePath, JSON.stringify({ app, files: configInputs }));
    const generated = command(appRequire.resolve('next/dist/bin/next'), ['typegen'], app, { ...env, PUCK_NEXT_CONFIG_BASELINE: baselinePath, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(fileURLToPath(import.meta.url)).href}`.trim() });
    requireSuccess(generated, 'Next typegen');
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
    const members = requireSuccess(command(compiler, ['-p', overlayPath, '--listFilesOnly'], app, env), 'TypeScript membership');
    const memberFiles = members.trim().split(/\r?\n/u);
    assertNextProductionMembership({ appDir: app, files: memberFiles, distDir });
    const finalCompilerInputs = snapshotExternalFiles(app, memberFiles);
    for (const [file, digest] of Object.entries(finalCompilerInputs)) {
      if (JSON.stringify(compilerInputs[file]) !== JSON.stringify(digest)) throw new Error(`Untracked or changed external compiler source: ${file}`);
    }
    if (JSON.stringify(observed()) !== JSON.stringify(inputDigests)) throw new Error('Next inputs changed before typechecking');
    const checked = command(compiler, ['-p', overlayPath, '--noEmit'], app, env);
    requireSuccess(checked, 'TypeScript check');
    for (const [ref, digest] of Object.entries(outputs)) {
      const file = resolve(app, ref);
      if (!regular(file) || sha(readFileSync(file)) !== digest) throw new Error(`Generated output changed during checking: ${ref}`);
    }
    const diagnostics = validateGeneratedTypeEvidence(policy, { success: true, toolchain: policy.evidence.toolchain, inputDigests, finalInputDigests: observed(), projects: policy.projects, outputs });
    if (diagnostics.length) throw new Error(diagnostics.join('; '));
    return { status: 0, generated: generated.stdout, checked: checked.stdout, outputs: policy.requiredOutputs };
  } finally {
    if (overlayDirectory) rmSync(overlayDirectory, { recursive: true, force: true });
    if (release) release();
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
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
