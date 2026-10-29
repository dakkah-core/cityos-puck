import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { glob } from 'glob';
import { classifyGeneratedTypePath } from '../../../scripts/toolchains/generated-types-policy/generated-types-policy.mjs';

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

export function copyRecipes({ recipePath, templatePath, onTemplated = () => {} }) {
  // A previous generation may have copied local environment files into the
  // package tree. Skipping them in the source does not remove those copies.
  if (existsSync(templatePath)) {
    for (const file of glob.sync('**/.env*', { cwd: templatePath, dot: true, nodir: true, follow: false })) {
      if (isLocalEnvFile(file)) throw new Error(`Local environment file already exists in template: ${file}`);
    }
  }
  let count = 0;
  for (const entry of readdirSync(recipePath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(recipePath, entry.name), manifestPath = join(source, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const kind = framework(JSON.parse(readFileSync(manifestPath, 'utf8')));
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
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      if (basename(to) === '.gitignore') copyFileSync(from, join(dirname(to), 'gitignore'));
      count += 1;
    }
  }
  return count;
}
