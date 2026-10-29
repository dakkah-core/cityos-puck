// Pure policy: callers discover ownership and perform all filesystem operations.
function portablePath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/u.test(value)) throw new Error('Expected a portable relative path');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('Expected a portable relative path');
  return value;
}

function inside(path, root) { return root === '.' || path === root || path.startsWith(`${root}/`); }

function validateOwner(owner) {
  if (!owner || !['next', 'expo', 'react-router'].includes(owner.framework)) throw new Error('Unknown framework owner');
  if (owner.path !== '.') portablePath(owner.path);
  if (owner.distDir !== undefined) portablePath(owner.distDir);
  if (owner.cacheLifeEnabled !== undefined && (owner.framework !== 'next' || typeof owner.cacheLifeEnabled !== 'boolean')) throw new Error('Invalid Next cacheLifeEnabled descriptor');
  return owner;
}

export function classifyGeneratedTypePath({ path, owners = [], trackedGenerated = [], preserved = [] }) {
  path = portablePath(path);
  if (preserved.map(portablePath).includes(path)) return 'preserved-evidence';
  if (trackedGenerated.map(portablePath).includes(path)) return 'tracked-generated-artifact';
  const owner = owners.map(validateOwner).filter(candidate => inside(path, candidate.path))
    .sort((a, b) => (b.path === '.' ? 0 : b.path.length) - (a.path === '.' ? 0 : a.path.length))[0];
  if (!owner) return 'authored-source';
  const local = owner.path === '.' ? path : path.slice(owner.path.length + 1);
  const output = owner.framework === 'next'
    ? local === 'next-env.d.ts' || inside(local, owner.distDir ?? '.next')
    : owner.framework === 'expo'
      ? local === 'expo-env.d.ts' || inside(local, '.expo')
      : inside(local, '.react-router');
  return output ? 'transient-framework-output' : 'authored-source';
}

export function requiredFrameworkOutputs(owner) {
  validateOwner(owner);
  if (owner.framework === 'expo' && typeof owner.typedRoutes !== 'boolean') throw new Error('Expo typedRoutes must be resolved');
  const owned = value => owner.path === '.' ? value : `${owner.path}/${value}`;
  const dist = owned(owner.distDir ?? '.next');
  return owner.framework === 'next'
    ? [owned('next-env.d.ts'), `${dist}/types/routes.d.ts`, `${dist}/types/root-params.d.ts`, `${dist}/types/validator.ts`, ...(owner.cacheLifeEnabled ? [`${dist}/types/cache-life.d.ts`] : [])]
    : owner.framework === 'expo' && owner.typedRoutes ? [owned('.expo/types/router.d.ts')] : [];
}

export function planGeneratedTypePreparation({ owner, projects, toolchain, inputDigests, requiredOutputs: observedOutputs }) {
  validateOwner(owner);
  if (!Array.isArray(projects) || !projects.length) throw new Error('At least one project is required');
  const selectedProjects = projects.map(portablePath);
  if (new Set(selectedProjects).size !== selectedProjects.length) throw new Error('Duplicate project');
  for (const field of ['node', 'compiler', 'generator']) if (!toolchain || typeof toolchain[field] !== 'string' || !toolchain[field]) throw new Error(`Missing toolchain ${field}`);
  for (const field of ['routes', 'config', 'lock']) if (!inputDigests || !/^[a-f0-9]{64}$/u.test(inputDigests[field] ?? '')) throw new Error(`Missing or invalid input digest ${field}`);
  if (owner.framework === 'expo' && typeof owner.typedRoutes !== 'boolean') throw new Error('Expo typedRoutes must be resolved');
  if (owner.framework === 'react-router' && (!Array.isArray(observedOutputs) || observedOutputs.length === 0)) throw new Error('React Router required output evidence must be supplied');
  const app = owner.path;
  const enabled = owner.framework !== 'expo' || owner.typedRoutes === true;
  const defaults = requiredFrameworkOutputs(owner);
  if (observedOutputs !== undefined && !Array.isArray(observedOutputs)) throw new Error('Required outputs must be an array');
  const requiredOutputs = observedOutputs === undefined ? defaults : observedOutputs.map(portablePath);
  if (!Array.isArray(requiredOutputs) || requiredOutputs.some(path => !inside(path, app))) throw new Error('Required output escapes framework owner');
  if (owner.framework !== 'react-router' && defaults.some(path => !requiredOutputs.includes(path))) throw new Error('Required framework output omitted');
  if (enabled && !requiredOutputs.length) throw new Error('Required output evidence is empty');
  return {
    owner: app, framework: owner.framework, projects: selectedProjects,
    steps: enabled ? ['preflight', 'acquire-locks', 'generate', 'verify-outputs', 'typecheck', 'verify-inputs', 'release-locks'] : ['preflight', 'acquire-locks', 'typecheck', 'verify-inputs', 'release-locks'],
    requiredOutputs, lockScope: app,
    evidence: { toolchain: { node: toolchain.node, compiler: toolchain.compiler, generator: toolchain.generator }, inputDigests: { routes: inputDigests.routes, config: inputDigests.config, lock: inputDigests.lock }, projects: selectedProjects, requiredOutputs },
  };
}

// Adapters supply independently observed digests; this validates their binding to the plan.
export function validateGeneratedTypeEvidence(plan, evidence) {
  const diagnostics = [];
  if (evidence?.success !== true) diagnostics.push('Preparation or typecheck failed');
  for (const field of ['node', 'compiler', 'generator']) if (evidence?.toolchain?.[field] !== plan.evidence.toolchain[field]) diagnostics.push(`Toolchain ${field} differs`);
  for (const field of ['routes', 'config', 'lock']) {
    const expected = plan.evidence.inputDigests[field];
    if (evidence?.inputDigests?.[field] !== expected || evidence?.finalInputDigests?.[field] !== expected) diagnostics.push(`Input digest ${field} differs`);
  }
  if (JSON.stringify(evidence?.projects) !== JSON.stringify(plan.projects)) diagnostics.push('Project scope differs');
  for (const path of plan.requiredOutputs) if (!/^[a-f0-9]{64}$/u.test(evidence?.outputs?.[path] ?? '')) diagnostics.push(`Required output missing or invalid: ${path}`);
  return diagnostics;
}
