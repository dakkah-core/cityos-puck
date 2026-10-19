import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";

const components = getThemeComponents();

export function useMDXComponents(overrides: Parameters<typeof getThemeComponents>[0] = {}) {
  return { ...components, ...overrides };
}
