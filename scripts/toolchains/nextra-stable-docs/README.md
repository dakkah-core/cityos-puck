# Owned Nextra docs source packet

This packet prepares a modified Nextra 4.6.1 docs variant. It is inert: no
provider binding, patch registration, workspace package or root catalog change
is present. No generator, install, build, typecheck or test was run during
preparation.

The exact upstream tag resolves to commit
`9c33703b305bf9a8ed5daa40d0ad826dbb921684`. `provenance.json` records the source
archive, published npm comparison archive, original source hashes and MIT
license. The archives are retained inputs. Their manifests and lockfiles are
never enrolled as active packages. The separate manifest observation ends in
`.json.source`; no `package.json` exists in this packet.

The authored TypeScript overlays remove MathJax component exports, schema and
option types, compiler dispatch and the rehype barrel export. The generator
also excludes the exact retired rehype source and removes
`better-react-mathjax` from the generated manifest. Configuration and direct
`compileMdx` calls reject MathJax explicitly before compilation or cache reuse.
There is no renderer fallback or children-only provider. This intentionally
narrows the upstream Nextra API; it does not claim upstream compatibility for
MathJax consumers.

No first-party MathJax capability was found in the inspected content or public
Puck/CityOS boundary. `acceptance-inputs/preservation.json` captures all 117 MDX
routes, 44 extracted examples and ten public boundary sources with LF-normalized
hashes, plus the public Puck export map. The appended source tests also require
exact route-set equality against the existing migration fixture. Runtime and
public behavior preservation still require the prepared acceptance inputs.

KaTeX remains on its current family. The existing boolean and explicit KaTeX
renderer paths, metadata compiler's unconditional `remark-math`, Mermaid and
the existing rehype/micromark consumers are retained. No KaTeX 0.19 override or
range change is prepared. `producer-inputs.json` records the consumer API seams
that a separate migration would need to qualify.

## Prepared producer

`generate.mjs` is an executable source producer, authored but unexecuted. It:

1. Verifies the selected canonical Node, stable catalog-selected installed
   tools, upstream/archive hashes, packet hashes and first-party preservation
   inputs before creating output.
2. Requires a new child of `.build/nextra-stable-docs`, rejects existing output
   or linked ancestors, and materializes only the Nextra sources/styles/loader
   and the exact upstream React compiler plugin. It does not install tools,
   execute upstream package lifecycle scripts or overwrite an earlier build.
3. Applies the authored source overlays and manifest delta. The generated
   manifest preserves the original package identity, version, exports and
   theme peer compatibility. Its compiler runtime selection follows the
   existing catalog. Build-only upstream scripts/manifests are not activated.
4. Generates SVG TSX intermediates while retaining the original public icon
   type contract. It runs upstream `setup-files.ts` as the owner of
   schema-derived types, checks source with TS7 and emits declarations through
   TS7. Catalog esbuild emits ESM using the retained React compiler transform.
   No TypeScript compiler API import or additional TS6 binding is introduced.
5. Uses the existing pinned native pnpm runner to pack the preserved public
   package layout. The candidate includes its MIT license and a generated
   `dist/OWNED_VARIANT.json` notice identifying modified source and tools.
   It records a complete candidate file inventory without activating it.

For a later authorized generation window, first select Node with the owning
shell selector, set `NODE_ENV=production`, then call the producer with
`--work-dir` and an explicit new directory below `.build/nextra-stable-docs`.
All tool versions come from the owning catalogs. Current missing selections
are recorded in `acceptance-inputs/preparation-observations.json`; no ambient
tool or upstream prerelease fallback is supplied. Two clean builds and the
prepared acceptance must precede provider integration.

## Prepared integration choice

The preferred candidate is a standard source-built tarball through the
existing default catalog. Native pnpm 12.14.0 sources, retained with hashes and
license under `canonical-source/pnpm-12.14.0`, implement both `file:` and
`workspace:` catalog values. They re-anchor relative files from the workspace
to nested consumers and contain frozen-install and packing cases. Those are
inspected upstream sources, not locally executed integration evidence.

Native packing re-anchors a file dependency but does not embed that tarball.
A durable, copied artifact layout and moved-checkout/frozen-install proof are
therefore required. The generator's `.build` output is not a final catalog
binding. This packet adds no protocol adapter, registry package or package hook.

The existing bootstrap materializer returns catalog scalars unchanged and
rejects `workspace:`. Its snapshot packer copies catalog inputs and registered
patches, without copying file-catalog tarballs. None of the four current recipe
templates consumes Nextra, so the prepared proof checks that all four active
standalone manifests remain free of Nextra/local-file references. Introducing
a standalone Nextra consumer would require an explicit artifact transport
change before use. The inert packet must never become an active workspace.

`integration-inputs.json` and `acceptance-inputs/acceptance.json` contain the
concrete generation, provider, content, type, portability and promotion gates.
`provider-input.mjs` exports opt-in registration against a real generated
package; `exports.type-input.ts` supplies TS7 positive and retired-API negative
cases. Neither executes on its own.
