import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { classifyGeneratedTypePath, requiredFrameworkOutputs } from './generated-types-policy/generated-types-policy.mjs';

// `effective` is the selected compiler's --showConfig result, after typegen.
// Explicit files prevent broad source globs from admitting stale framework output.
export function createNextTypecheckOverlay({ appDir, project, effective, distDir = '.next', requiredOutputs }) {
  const app = resolve(appDir);
  const projectPath = resolve(project);
  const projectDirectory = dirname(projectPath);
  const toPortable = path => relative(app, path).split(sep).join('/');
  const isWithin = path => { const ref = relative(app, path); return ref && !isAbsolute(ref) && ref !== '..' && !ref.startsWith(`..${sep}`); };
  if (!isWithin(projectPath)) throw new Error('Project must be inside the Next app');
  if (!Array.isArray(effective?.files)) throw new Error('Compiler did not enumerate project files');
  const owner = { path: '.', framework: 'next', distDir };
  const allowed = new Set(requiredOutputs ?? requiredFrameworkOutputs(owner));
  const files = effective.files.map(file => resolve(projectDirectory, file)).filter(file => {
    if (!isWithin(file)) return true; // Imported workspace source remains in scope.
    const path = toPortable(file);
    return classifyGeneratedTypePath({ path, owners: [owner] }) !== 'transient-framework-output' || allowed.has(path);
  });
  for (const file of allowed) if (!files.includes(resolve(app, file))) throw new Error(`Required typegen output is not a compiler root: ${file}`);
  return {
    extends: projectPath,
    files,
    include: [],
    exclude: [],
    ...(effective.references ? { references: effective.references.map(reference => ({ ...reference, path: resolve(projectDirectory, reference.path) })) } : {}),
    compilerOptions: { incremental: false, tsBuildInfoFile: null },
  };
}

// An excluded root can still enter through an import or a `files` entry. Call
// this on the actual compiler's --listFilesOnly output before accepting a check.
export function assertNextProductionMembership({ appDir, files, distDir = '.next' }) {
  const app = resolve(appDir);
  if (!Array.isArray(files)) throw new Error('Compiler membership must be supplied');
  const forbidden = [resolve(app, distDir, 'dev'), resolve(app, distDir, 'types', 'app')];
  for (const name of files) {
    const path = resolve(app, name);
    for (const base of forbidden) {
      const ref = relative(base, path);
      if (!isAbsolute(ref) && ref !== '..' && !ref.startsWith(`..${sep}`)) throw new Error(`Stale Next output entered compiler membership: ${path}`);
    }
  }
}
