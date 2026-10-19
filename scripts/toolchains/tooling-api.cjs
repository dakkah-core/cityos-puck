// Dependency-free package hook: all selected versions come from the owning catalog.
function adaptToolingApi(pkg, catalog, policy) {
  const compilerBinding = policy.compilerApi.bindings[pkg.name];
  let result = pkg;
  if (compilerBinding && pkg.version === catalog[compilerBinding]) {
    const api = catalog[policy.compilerApi.catalog];
    if (!/^npm:@typescript\/typescript6@6\.\d+\.\d+$/u.test(api ?? "")) {
      throw new Error("PUCK_COMPILER_API_CATALOG_INVALID");
    }
    result = { ...pkg, dependencies: { ...pkg.dependencies, typescript: api } };
    // An API consumer must own its compatibility dependency. A peer otherwise
    // rebinds to the workspace's intentionally separate first-party TS7 CLI.
    if (pkg.peerDependencies?.typescript) {
      result.peerDependencies = { ...pkg.peerDependencies };
      delete result.peerDependencies.typescript;
      if (pkg.peerDependenciesMeta?.typescript) {
        result.peerDependenciesMeta = { ...pkg.peerDependenciesMeta };
        delete result.peerDependenciesMeta.typescript;
      }
    }
  }
  const peerBinding = policy.eslint.peerBindings[pkg.name];
  if (peerBinding && pkg.version === catalog[peerBinding.versionCatalog]) {
    const eslint = catalog[policy.eslint.catalog];
    if (!/^10\.\d+\.\d+$/u.test(eslint ?? "") ||
        !/^2\.\d+\.\d+$/u.test(catalog[policy.eslint.adapterCatalog] ?? "") ||
        pkg.peerDependencies?.eslint !== peerBinding.upstreamRange) {
      throw new Error("PUCK_ESLINT_ADAPTATION_SOURCE_DRIFT");
    }
    result = { ...result, peerDependencies: { ...result.peerDependencies, eslint: `${peerBinding.upstreamRange} || ${eslint}` } };
  }
  return result;
}

module.exports = { adaptToolingApi };
