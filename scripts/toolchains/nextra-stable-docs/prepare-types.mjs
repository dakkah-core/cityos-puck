// Adapt the exact upstream ambient source before TS7 checks or declarations.
// Public Pagefind, SVG and MDX declarations retain their original providers.
export function prepareAmbientTypes(source) {
  const replacements = [
    [
      "  import type { PagefindSearchOptions } from './types.js'",
      "  type PagefindSearchOptions = import('./types.js').PagefindSearchOptions",
    ],
    [
      "  export { ReactComponent } from './icon.js'",
      "  const ReactComponent: typeof import('./icon.js').ReactComponent\n  export { ReactComponent }",
    ],
  ];
  let result = source;
  for (const [before, after] of replacements) {
    const offset = result.indexOf(before);
    if (offset < 0 || offset !== result.lastIndexOf(before)) {
      throw new Error('NEXTRA_AMBIENT_SOURCE_CHANGED: expected one exact upstream declaration');
    }
    result = result.replace(before, after);
  }
  return result;
}
