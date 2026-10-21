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
3. Applies the authored source overlays and canonical manifest delta to the
   published metadata. The generated manifest preserves the original package
   identity, version, exports and theme peer compatibility. Its compiler
   runtime selection follows the existing catalog. No upstream lifecycle
   script or retained workspace manifest is executed.
4. Generates SVG TSX intermediates while retaining the original public icon
   type contract. It runs upstream `setup-files.ts` as the owner of
   schema-derived types, checks source with TS7 and emits declarations through
   TS7. Catalog esbuild emits ESM using the retained React compiler transform.
   No TypeScript compiler API import or additional TS6 binding is introduced.
5. Compares the complete source-built package with the integrity-verified
   published npm baseline. `package-patch.mjs` emits deterministic complete-file
   unified hunks covering the physical manifest, every changed JS/declaration,
   additions and deletions. The candidate retains its MIT license and a
   generated `dist/OWNED_VARIANT.json` notice. The patch receives complete
   baseline/candidate inventories and matching sibling provenance. No Git,
   install, package publication, provider binding or active patch copy occurs.

For a later authorized generation window, first select Node with the owning
shell selector, set `NODE_ENV=production`, then call the producer with
`--work-dir` and an explicit new directory below `.build/nextra-stable-docs`.
All tool versions come from the owning catalogs. Current missing selections
are recorded in `acceptance-inputs/preparation-observations.json`; no ambient
tool or upstream prerelease fallback is supplied. Two clean builds and the
prepared acceptance must precede provider integration.

## Prepared integration choice

The preferred integration keeps the published stable `nextra: 4.6.1` catalog
selection and theme peer unchanged. A complete generated patch updates the
physical package; an exact registered `readPackage` retirement removes the
original `better-react-mathjax: ^2.3.0` edge before graph resolution. There is
no local provider protocol, package identity change or provider workspace.

`registered-retirement.cjs` reuses the existing dependency-free catalog reader
supplied by its caller and native pnpm's parsed canonical `patchedDependencies`
settings. `proposed-pnpmfile.cjs.source` prepares the additions for parent merge
after Nash; it is not an active hook. The native source shares the same lazy
Node worker for `updateConfig` and `readPackage`, and passes loaded hook objects
onward. Hash-bound native sources and their license are retained. Real install,
frozen-reuse and physical patch application still need parent qualification.

Retirement requires the exact selector/path, existing complete generated patch
and sibling provenance, matching source/packet/patch hashes, complete package
inventories, and all coordinated retirement paths. Wrong ranges, versions,
registration or artifacts fail closed. Unregistered files never enable it.
Fresh workers must initialize from native canonical metadata; there is no
file-presence fallback, additional enable flag or second YAML parser.

File/workspace catalog alternatives were inspected and superseded by this
existing patch/hook mechanism. Native source supports them, but the bootstrap
materializer copies scalars unchanged and rejects `workspace:`. None of the
four current recipes consumes Nextra. Their prepared proof prevents this patch
registration or hook from leaking into active standalone workspaces. The CLI's
existing snapshot packer copies registered patches, not their source-provenance
closure; a future standalone Nextra consumer would require that complete closure
before use. The inert retained inputs must never become an active workspace.

`integration-inputs.json` and `acceptance-inputs/acceptance.json` contain the
concrete generation, provider, content, type, portability and promotion gates.
`provider-input.mjs` and `hook-input.mjs` export opt-in registrations against
real generated package/registered-patch fixtures. `exports.type-input.ts`
supplies TS7 positive and retired-API negative cases. No test is automatically
registered by these inputs.
