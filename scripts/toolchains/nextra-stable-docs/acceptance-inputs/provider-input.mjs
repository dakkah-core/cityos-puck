import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Inert registration input. The parent supplies a real generated package root
// and node:test registrar in its serialized qualification window.
export function registerProviderAcceptanceInputs({ test, packageRoot }) {
  const load = (path) => import(pathToFileURL(join(packageRoot, path)).href);

  test("owned Nextra schemas retain disabled/default/KaTeX settings and explicitly reject MathJax", async () => {
    const { NextraConfigSchema } = await load("dist/server/schemas.js");
    for (const input of [{}, { latex: false }, { latex: true }, { latex: { renderer: "katex", options: {} } }]) {
      assert.equal(NextraConfigSchema.safeParse(input).success, true);
    }
    const rejected = NextraConfigSchema.safeParse({ latex: { renderer: "mathjax" } });
    assert.equal(rejected.success, false);
    assert.match(JSON.stringify(rejected.error), /NEXTRA_UNSUPPORTED_MATH_RENDERER/u);
    const generated = readFileSync(join(packageRoot, "dist/types.generated.d.ts"), "utf8");
    assert.doesNotMatch(generated, /better-react-mathjax|MathJaxOptions|renderer:\s*["']mathjax/u);
  });

  test("real compileMdx rejects retired renderer before compiler creation or cache reuse", async () => {
    const { compileMdx } = await load("dist/server/compile.js");
    const mdxOptions = { outputFormat: "program" };
    await compileMdx("# Cache warmup", { latex: false, codeHighlight: false, useCachedCompiler: true, mdxOptions });
    for (const useCachedCompiler of [false, true]) {
      await assert.rejects(compileMdx("$x$", {
        latex: { renderer: "mathjax", options: { src: "https://invalid.example/never-load.js" } },
        codeHighlight: false, useCachedCompiler, mdxOptions,
      }), /NEXTRA_MATHJAX_UNSUPPORTED/u);
    }
    await assert.rejects(compileMdx("$x$", { latex: { renderer: "unknown" }, codeHighlight: false }), /NEXTRA_UNSUPPORTED_MATH_RENDERER/u);
  });

  test("existing KaTeX path renders inline, display, fenced math, macros and invalid-input fallback", async () => {
    const { compileMdx } = await load("dist/server/compile.js");
    const source = "Inline $x^2$.\n\n$$\ny = \\frac{1}{2}\n$$\n\n```math\nz^2\n```\n";
    for (const latex of [true, { renderer: "katex", options: {} }]) {
      const compiled = await compileMdx(source, { latex, codeHighlight: false });
      assert.match(compiled, /katex/u);
      assert.match(compiled, /katex-display/u);
      assert.doesNotMatch(compiled, /MathJax|better-react-mathjax|<script/u);
    }
    const macros = await compileMdx("$\\RR$", {
      latex: { renderer: "katex", options: { macros: { "\\RR": "\\mathbb{R}" } } }, codeHighlight: false,
    });
    assert.match(macros, /katex/u);
    assert.doesNotMatch(macros, /katex-error/u);
    const invalid = await compileMdx("$\\cityosUndefinedMacro$", { latex: true, codeHighlight: false });
    assert.match(invalid, /katex-error/u);
    const disabled = await compileMdx("Literal $x$", { latex: false, codeHighlight: false });
    assert.doesNotMatch(disabled, /className:\s*["']katex/u);
  });

  test("configuration entrypoint reports retired MathJax without a provider or children stub", async () => {
    const { default: nextra } = await load("dist/server/index.js");
    assert.throws(() => nextra({ latex: { renderer: "mathjax" } }), /NEXTRA_MATHJAX_UNSUPPORTED/u);
    assert.equal(typeof nextra({ latex: false }), "function");
  });
}
