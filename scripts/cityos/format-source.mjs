export async function formatSource(prettier, source, path) {
  const options = (await prettier.resolveConfig(path)) ?? {};
  return await prettier.format(source, { ...options, filepath: path });
}
