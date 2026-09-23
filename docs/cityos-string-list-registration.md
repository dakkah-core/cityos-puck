# CityOS scalar string-list registration

Working implementation and owner handoff for CXD-006/CXD-014, P-04/P-ST02,
WP-05/WP-11, and supporting ST-C02/ST-C04/ST-C14/ST-C30/ST-C32 requirements.
This is not a package-publication, deployed-host, complete Studio, or owner-approval
record. The full 32 capability families, 64 scenarios, Studio A/B/C and all owner
journeys remain independently tracked in the platform expansion programme.

## Explicit v3 contract

`cityos.puck.registration.v3` retains the installed v2 primitives and adds a
`string-list` field with `label`, integer `maxItems` (0–1000) and integer
`maxItemLength` (0–100000). It represents **string[]**, not a newline-separated
string or an array of records. Empty strings, duplicate strings, whitespace and
embedded newlines are preserved. V1/v2 still reject this new vocabulary. The
native-screen data profile does not change; this is not a document migration.

The platform compiler accepts `cityos.compiler.studio-puck-source.v3` and emits
this field from its existing `string-array` schema and `string-list` editor.
The full current native component catalog can therefore be qualified without
omitting the List entry. A newly named supported component still uses an admitted
renderer; neither compiler nor fork obtains authority from an arbitrary folder,
URL, callback or author-provided permission.

The public `@cityos-core/puck/cityos` binder installs the fork-owned list control
through Puck's existing custom-field interface. The data-only registration module
accepts a separately supplied trusted field adapter for tools/hosts that use it
directly; missing adapters fail instead of returning a fake working control.
Executable adapters do not enter serialized manifests. Existing v1/v2 clients
remain compatible and never automatically opt into v3.

## Editing and ownership

The control uses explicit item inputs and add/remove/up/down buttons, existing
styling and dictionary messages. It does not split or trim values. Mutations
respect field read-only and current editor permissions, including event-handler
checks. Malformed retained data produces a diagnostic and is not converted or
silently overwritten. List ordering has keyboard-invocable controls and focus
recovery. No hidden defaults or system/node IDs are added to the scalar values.

These controls improve editing, not server authorization. Native CMS still owns
its value validation, tenant/representation checks, expected revisions, atomic
persistence, audit and publication. Other owners retain their own invariants.
No database, credential, provider, approval or activation is changed by binding.

## Verification

`node --experimental-strip-types --test scripts/cityos/string-list.test.mjs`
checks the actual compiler-produced native catalog, independent artifact/protocol
digests, older-version rejection, missing adapters, tampering, renderer revocation,
per-session isolation and lossless bounded edit primitives. The fixture evidence
pins the exact producer blob; synthetic renderer/owner admission is not runtime
admission. Reproduce through the platform's `nativeCatalogPuckFixture('ar')` and
`compileStringListFixture` rather than hand-editing generated fixture bytes.

`packages/core/__tests__/cityos-string-list-editor.test.tsx` exercises the actual
Puck field and Render paths, scalar fidelity, editing, limits, read-only rejection,
Arabic dictionary controls and invalid retained data. Its jsdom setup models the
existing stylesheet visibility rule; it is not browser-layout or Next.js proof.
Maintained CI also runs existing tests, declarations, lint, formatting and builds.
Do not describe added tests as passed before the exact CI result is recorded.

## Remaining integration and owner actions

Fork maintainers: qualify the complete maintained pipeline and publish a new
immutable package through the existing release procedure. A source commit does
not update existing `0.23.0-cityos.2` consumers.

Platform Engineering: retain one compiler and the versioned artifact/field-policy
sidecars; validate source, owner and admitted renderer digests. Unsupported new
semantics require a separately qualified reusable primitive, not arbitrary code
in configuration. Studio/BFF maintainers: pin the built package, connect authorized
contribution discovery, and replace the manual host projection only after real
save/reload, denial, revocation and publication acceptance. Do not remove the
native canvas or another owner writer on the strength of these tests alone.

All system owners: use supported definitions without hand-built name switches,
retain field-write and resource policies, and link unresolved types or business
rules to the existing owner ledger. Notes published here do not establish owner
acknowledgement. Continue to use the platform expansion index, owner notes and
issue #256; this is not another programme authority or a smaller replacement scope.
