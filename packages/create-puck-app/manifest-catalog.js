// Pure catalog resolution shared by local scaffolding and the packed CLI.
export function resolveCatalog(name, reference, workspace) {
  if (!reference.startsWith("catalog:")) return reference;
  const catalogName = reference.slice("catalog:".length);
  const catalog = catalogName ? workspace.catalogs?.[catalogName] : workspace.catalog;
  const version = catalog?.[name];
  if (typeof version !== "string" || version.startsWith("catalog:")) {
    throw new Error(`Missing concrete catalog entry: ${catalogName || "default"}/${name}`);
  }
  return version;
}

export function materializeManifest(manifest, workspace) {
  const result = structuredClone(manifest);
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (!result[field]) continue;
    for (const [name, reference] of Object.entries(result[field])) {
      result[field][name] = resolveCatalog(name, reference, workspace);
      if (result[field][name].startsWith("workspace:")) {
        throw new Error(`Standalone template cannot resolve workspace dependency: ${name}`);
      }
    }
  }
  return result;
}
