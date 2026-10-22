import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, findPackageJSON } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  patchPath,
  themeLayoutPatch,
} from "../toolchains/nextra-theme-layout.mjs";
import { repositoryRoot } from "../toolchains/toolchain.mjs";

test("the installed theme validates and renders real children during prerendering", async () => {
  const owner = new URL("../../apps/docs/package.json", import.meta.url);
  const require = createRequire(owner);
  const theme = dirname(findPackageJSON("nextra-theme-docs", owner));
  const layoutSource = readFileSync(resolve(theme, "dist/layout.js"), "utf8");
  assert.equal(
    readFileSync(resolve(repositoryRoot, patchPath), "utf8"),
    themeLayoutPatch(layoutSource),
  );
  const url = (source) =>
    "data:text/javascript;base64," + Buffer.from(source).toString("base64");
  const absolute = (name) => pathToFileURL(require.resolve(name)).href;
  // Router/client providers are outside this regression's boundary. Keep the
  // installed layout, schema, Zod, React compiler hooks and React renderer real.
  const providers = url(`
    export const ThemeProvider = ({children}) => children;
    export const ConfigProvider = ({children}) => children;
    export const ThemeConfigProvider = ({children}) => children;
    export const SkipNavLink = () => null;
    export const MobileNav = () => null;
    export const Search = () => null;
    export const LastUpdated = () => null;
  `);
  const rewrite = (source, replacements) =>
    source.replace(
      /from "([^"]+)"/gu,
      (_, name) =>
        `from ${JSON.stringify(replacements[name] ?? absolute(name))}`,
    );
  const schema = url(
    rewrite(readFileSync(resolve(theme, "dist/schemas.js"), "utf8"), {
      "nextra/components": providers,
      "nextra/schemas": import.meta.resolve("nextra/schemas"),
      zod: pathToFileURL(
        createRequire(resolve(theme, "package.json")).resolve("zod"),
      ).href,
      "./components": providers,
    }),
  );
  const substitutions = {
    "next-themes": providers,
    "nextra/components": providers,
    "./components/sidebar": providers,
    "./stores": providers,
    "./schemas": schema,
  };
  const { Layout } = await import(url(rewrite(layoutSource, substitutions)));
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const baseline = layoutSource.replace(
    "LayoutPropsSchema.safeParse({ ...themeConfig, children })",
    "LayoutPropsSchema.safeParse(themeConfig)",
  );
  const { Layout: Baseline } = await import(
    url(rewrite(baseline, substitutions))
  );
  assert.throws(
    () =>
      renderToStaticMarkup(
        React.createElement(Baseline, { pageMap: [] }, "docs content"),
      ),
    /children/u,
  );
  const rendered = renderToStaticMarkup(
    React.createElement(
      Layout,
      { pageMap: [] },
      React.createElement("span", null, "retained docs content"),
    ),
  );
  assert.match(rendered, /<span>retained docs content<\/span>/u);
  assert.throws(() =>
    renderToStaticMarkup(
      React.createElement(Layout, { pageMap: [], children: {} }),
    ),
  );
});
