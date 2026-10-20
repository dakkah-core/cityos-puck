/** The owned docs variant intentionally narrows upstream renderer support. */
export function assertSupportedLatexRenderer(value: unknown): void {
  if (value === undefined || typeof value === 'boolean') return
  if (value && typeof value === 'object' && 'renderer' in value) {
    if (value.renderer === 'katex') return
    if (value.renderer === 'mathjax') {
      throw new Error(
        'NEXTRA_MATHJAX_UNSUPPORTED: the owned Nextra docs variant retires MathJax. Select KaTeX explicitly after qualifying its content.'
      )
    }
  }
  throw new Error(
    'NEXTRA_UNSUPPORTED_MATH_RENDERER: expected a boolean or an explicit KaTeX renderer.'
  )
}
