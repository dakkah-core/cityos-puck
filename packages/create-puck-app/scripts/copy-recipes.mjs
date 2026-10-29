import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { glob } from 'glob';
import { classifyGeneratedTypePath } from '../../../scripts/toolchains/generated-types-policy/generated-types-policy.mjs';
import { GENERATED_TYPES_POLICY_FILES } from '../../../scripts/toolchains/verify-generated-types-policy.mjs';

function framework(manifest) {
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (dependencies.next) return 'next';
  if (dependencies['react-router']) return 'react-router';
  if (dependencies.expo) return 'expo';
  return null;
}

function isLocalEnvFile(path) {
  const leaf = path.replaceAll('\\', '/').split('/').at(-1);
  return /^\.env(?:\.|$)/u.test(leaf) && !/^\.env(?:\.[a-z0-9_-]+)*\.example$/iu.test(leaf);
}

// These paths are the exact outputs owned by copy-next-toolchain.mjs.
const nextToolchainFiles = new Set([
  'next-generated-types.mjs', 'next-build-guard.mjs', 'next-output-lock.mjs',
  'next-typecheck-overlay.mjs', 'verify-generated-types-policy.mjs', 'node-typescript.json',
  ...GENERATED_TYPES_POLICY_FILES.map(file => `generated-types-policy/${file}`), 'generated-types-policy/projection.json',
]);

// Hand-maintained files are not recipe copies. List their owners explicitly so
// an orphaned template cannot silently become part of a generated application.
const authoredTemplates = new Map([
  ['next', new Set(['package.json.hbs', '.nvmrc.hbs'])],
  ['next-ai', new Set(['package.json.hbs', '.nvmrc.hbs'])],
  ['react-router', new Set(['package.json.hbs', 'tsconfig.json.hbs', '.nvmrc.hbs'])],
  ['react-router-ai', new Set(['package.json.hbs', 'tsconfig.json.hbs', '.nvmrc.hbs'])],
]);

export function copyRecipes({ recipePath, templatePath, onTemplated = () => {} }) {
  // A previous generation may have copied local environment files into the
  // package tree. Skipping them in the source does not remove those copies.
  if (existsSync(templatePath)) {
    for (const file of glob.sync('**/.env*', { cwd: templatePath, dot: true, nodir: true, follow: false })) {
      if (isLocalEnvFile(file)) throw new Error(`Local environment file already exists in template: ${file}`);
    }
  }
  const copies = [];
  const expected = new Set();
  const copyTargets = new Map();
  function scheduleCopy(from, to, ref, alias = false) {
    const previous = copyTargets.get(to);
    if (previous) throw new Error(`Recipe copy target collision: ${ref} is supplied by both ${previous} and ${from}`);
    copyTargets.set(to, from);
    expected.add(ref);
    copies.push({ from, to, alias });
  }
  const nextOwners = new Set();
  const activeOwners = new Set();
  for (const entry of readdirSync(recipePath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(recipePath, entry.name), manifestPath = join(source, 'package.json');
    if (!existsSync(manifestPath)) continue;
    activeOwners.add(entry.name);
    const kind = framework(JSON.parse(readFileSync(manifestPath, 'utf8')));
    if (kind === 'next') nextOwners.add(entry.name);
    const owner = kind ? [{ path: entry.name, framework: kind }] : [];
    const oldOutputs = ['node_modules', '.git', '.turbo', '.build', ...(kind === 'next' ? ['.next', 'next-env.d.ts', 'out'] : kind === 'expo' ? ['.expo', 'expo-env.d.ts'] : kind === 'react-router' ? ['.react-router', 'build'] : [])];
    for (const output of oldOutputs) if (existsSync(join(templatePath, entry.name, output))) throw new Error(`Transient output already exists in template: ${entry.name}/${output}`);
    const ignored = ['**/node_modules/**', '**/.git/**', '**/.turbo/**', '**/.build/**'];
    if (kind === 'next') ignored.push('.next/**', 'out/**');
    if (kind === 'expo') ignored.push('.expo/**');
    if (kind === 'react-router') ignored.push('.react-router/**', 'build/**');
    for (const file of glob.sync('**/*', { cwd: source, dot: true, nodir: true, ignore: ignored, follow: false })) {
      const normalized = file.replaceAll('\\', '/');
      if (isLocalEnvFile(normalized)) continue;
      if (classifyGeneratedTypePath({ path: `${entry.name}/${normalized}`, owners: owner }) === 'transient-framework-output') continue;
      const from = join(source, file), to = join(templatePath, entry.name, file);
      if (lstatSync(from).isSymbolicLink()) throw new Error(`Recipe symlink is not a safe template input: ${entry.name}/${normalized}`);
      if (existsSync(`${to}.hbs`)) { onTemplated(`${entry.name}/${normalized}`); continue; }
      scheduleCopy(from, to, `${entry.name}/${normalized}`);
      if (basename(to) === '.gitignore') {
        const alias = `${entry.name}/${normalized.slice(0, -'.gitignore'.length)}gitignore`;
        scheduleCopy(from, join(dirname(to), 'gitignore'), alias, true);
      }
    }
  }
  // Existing files without a current source are not demonstrably ours to delete.
  // Refuse to package them, including legacy copies made before this check existed.
  // The separately generated Next adapter is owned by copy-next-toolchain.mjs.
  if (existsSync(templatePath)) {
    for (const file of glob.sync('**/*', { cwd: templatePath, dot: true, nodir: true, follow: false })) {
      const normalized = file.replaceAll('\\', '/');
      const parts = normalized.split('/');
      if (lstatSync(join(templatePath, file)).isSymbolicLink()) throw new Error(`Template symlink is not a safe package input: ${normalized}`);
      if (normalized === '.gitignore' || normalized === '.npmignore' || expected.has(normalized)) continue;
      // scripts/publish.sh temporarily renames the root ignore file before
      // prepack runs; it is package metadata, not a recipe-owned file.
      if (normalized === 'gitignore' && !existsSync(join(templatePath, '.gitignore'))) continue;
      if (normalized.endsWith('.hbs') && activeOwners.has(parts[0]) && authoredTemplates.get(parts[0])?.has(parts.slice(1).join('/'))) {
        // .nvmrc is an authored standalone template with no recipe counterpart.
        // Other overrides require their source to remain in the active recipe.
        if (parts.slice(1).join('/') === '.nvmrc.hbs' || existsSync(join(recipePath, parts[0], ...parts.slice(1)).slice(0, -4))) continue;
      }
      const toolchainPrefix = `${parts[0]}/.cityos/next-typecheck/`;
      if (nextOwners.has(parts[0]) && normalized.startsWith(toolchainPrefix) && nextToolchainFiles.has(normalized.slice(toolchainPrefix.length))) continue;
      throw new Error(`Unmanaged or stale template file: ${normalized}. Review and remove or restore its recipe source before packaging.`);
    }
  }
  for (const { from, to } of copies) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  return copies.filter(copy => !copy.alias).length;
}
