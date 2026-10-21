import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Inert registration input. The parent supplies a real generated package root
// and node:test registrar in its serialized qualification window.
// The parent must also run acceptance.json's original 4.6.1 retired-API control;
// candidate assertions alone do not establish that the negative control passed.
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

  for (const { form, source, display } of [
    { form: "inline", source: "Inline $x^2$.", display: false },
    { form: "display", source: "$$\ny = \\frac{1}{2}\n$$", display: true },
    { form: "fenced", source: "```math\nz^2\n```", display: true },
  ]) {
    test(`existing KaTeX path renders ${form} math independently for default and explicit renderer settings`, async () => {
      const { compileMdx } = await load("dist/server/compile.js");
      for (const latex of [true, { renderer: "katex", options: {} }]) {
        const compiled = await compileMdx(source, { latex, codeHighlight: false, mdxOptions: { jsx: true } });
        // Match emitted JSX, not sourceCode or another math form's markers.
        assert.match(compiled, /<_components\.span\s+className="katex">/u);
        assert.match(compiled, /encoding="application\/x-tex"/u);
        if (display) assert.match(compiled, /<_components\.span\s+className="katex-display">/u);
        else assert.doesNotMatch(compiled, /className="katex-display"/u);
        assert.doesNotMatch(compiled, /className="(?:katex-error|language-math|math-inline|math-display)"/u);
        assert.doesNotMatch(compiled, /MathJax|better-react-mathjax|<script/u);
      }
    });
  }

  test("existing KaTeX options retain macros and invalid-input fallback", async () => {
    const { compileMdx } = await load("dist/server/compile.js");
    const macros = await compileMdx("$\\RR$", {
      latex: { renderer: "katex", options: { macros: { "\\RR": "\\mathbb{R}" } } }, codeHighlight: false,
    });
    assert.match(macros, /katex/u);
    assert.doesNotMatch(macros, /katex-error/u);
    const invalid = await compileMdx("$\\cityosUndefinedMacro$", { latex: true, codeHighlight: false });
    assert.match(invalid, /katex-error/u);
  });

  for (const { form, source, preserved } of [
    {
      form: "inline", source: "Literal $x$",
      preserved: /<_components\.p>\s*\{["']Literal \$x\$["']\}\s*<\/_components\.p>/u,
    },
    {
      form: "display", source: "$$\ny^2\n$$",
      preserved: /<_components\.p>\s*\{["']\$\$\\ny\^2\\n\$\$["']\}\s*<\/_components\.p>/u,
    },
    {
      form: "fenced", source: "```math\nz^2\n```",
      preserved: /<_components\.code\s+className="language-math">\s*\{["']z\^2\\n["']\}\s*<\/_components\.code>/u,
    },
  ]) {
    test(`disabled math preserves actual unrendered ${form} output`, async () => {
      const { compileMdx } = await load("dist/server/compile.js");
      const compiled = await compileMdx(source, { latex: false, codeHighlight: false, mdxOptions: { jsx: true } });
      // A sourceCode export alone cannot satisfy the content assertion.
      assert.match(compiled, preserved);
      if (form === "fenced") assert.match(compiled, /<_components\.pre\b/u);
      assert.doesNotMatch(compiled, /katex|MathJax|better-react-mathjax|<script/u);
    });
  }

  test("real compileMetadata parses math unconditionally and retains only metadata", async () => {
    const { compileMetadata } = await load("dist/server/compile-metadata.js");
    for (const { form, body } of [
      { form: "inline", body: String.raw`Body $\frac{1}{2\pi}$.` },
      { form: "display", body: "$$\n" + String.raw`\frac{1}{2\pi}` + "\n$$" },
      { form: "fenced", body: "```math\n" + String.raw`\frac{1}{2\pi}` + "\n```" },
    ]) {
      const filePath = `acceptance/math-${form}.mdx`;
      const lastCommitTime = 1700000000000;
      // The TeX braces in inline/display math are invalid MDX expressions if
      // unconditional remark-math parsing is lost, even though the body is removed.
      const compiled = await compileMetadata(
        `---\ntitle: Math metadata\ndescription: Retained description\n---\n\n# Metadata heading\n\n${body}\n`,
        { filePath, lastCommitTime },
      );
      const declaration = compiled.match(/export const metadata = (\{[\s\S]*?\n\});/u);
      assert.ok(declaration, `${form} math must retain the metadata export`);
      assert.deepEqual(JSON.parse(declaration[1]), {
        title: "Math metadata", description: "Retained description", filePath, timestamp: lastCommitTime,
      });
      assert.equal((compiled.match(/\bexport\b/gu) || []).length, 1);
      assert.doesNotMatch(compiled, /Metadata heading|Body|frac|sourceCode|_createMdxContent|katex|MathJax/u);
    }
  });

  test("configuration entrypoint reports retired MathJax without a provider or children stub", async () => {
    const { default: nextra } = await load("dist/server/index.js");
    assert.throws(() => nextra({ latex: { renderer: "mathjax" } }), /NEXTRA_MATHJAX_UNSUPPORTED/u);
    assert.equal(typeof nextra({ latex: false }), "function");
  });
}
