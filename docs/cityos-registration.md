# CityOS compiler registration boundary

Status: implemented source under verification; not a published package or mounted Studio acceptance. Accountable maintainer assignment remains unrecorded. This guide implements bounded CXD-006/ST-C04/ST-C30 infrastructure without narrowing the full Expanded Studio specification.

## Ownership

The CityOS Compiler and accepted owner definitions remain in `dakkah-core/dakkah-cityos-cms`. This fork owns its editor implementation and target binding. A registration manifest is a derived target artifact, not another system registry, permission store or business authority. Existing `@cityos-core/puck@0.23.0-cityos.2` consumers do not automatically receive new source exports.

## API

The `@cityos-core/puck/cityos` source entrypoint exports `parseCityOSPuckRegistration`, `digestCityOSPuckRegistration` and `bindCityOSPuckRegistration`.

A manifest identifies its data profile, source owner, registry revision, source-definition digest, component types, localized labels, fields, slots, and exact renderer keys/versions/digests. The binder requires an independently supplied expected manifest digest and an installed-renderer resolver. It never imports modules, fetches arbitrary URLs, fills withheld properties, grants permissions, saves data, or invokes an owner command.

The initial admitted field vocabulary is text, textarea, bounded number, scalar select, and slot. Unsupported rich-text, array, reference or custom field semantics fail explicitly until their target implementation is qualified. This is not the full Studio field model. Placement and field-value authorization still require the canonical command/server boundary; Puck editor restrictions are not database policy.

Metadata using already installed compatible renderers can bind new component names without a handwritten component list. New renderer semantics still need a verified implementation and build. Renderer disablement or replacement is checked again when a previously bound render function is called. The host must also respond to authorization/tenant changes by invalidating sessions and projections; integrity checks are not caller authorization.

## Verification and release

Run `node --experimental-strip-types --test scripts/cityos/registration.test.mjs` for data-only, hash, schema, slot and revocation regressions. The maintained core Jest suite additionally exercises actual Puck `Render` output and denial. These are separate from full browser editor, Native CMS, publication and multi-document acceptance.

The existing CI workflow remains responsible for tests, lint, formatting and builds. The explicit CityOS publication workflow depends on that verification before publishing. Its manual trigger remains manual. Existing upstream-only automatic canary isolation is preserved. Never describe a source commit, metadata digest or green unit suite as a published and consumed package.

## Cross-repository handoff and remaining work

Platform Engineering: emit this bounded target artifact from canonical component/contribution definitions, pin its digest, and independently validate owner admission. Studio/BFF: return only authorized contributions, resolve admitted module builds, preserve the real proxy/session/CSRF boundary, and bind the actual editor host. Fork maintainers: complete document sessions, shared commands, structural editing, collaboration, specialist editors, RTL and renderer conformance through the same public contracts.

All 32 Studio capability families and 64 scenarios, four backend behavior kinds, six Studio flow classes, L0-L9 composition, Studio A/B/C, core/shared E01-E08 and vertical A-I remain in scope. This binder does not mark them implemented. New business rules, providers, surfaces and compiler primitives require explicit semantics and independent tests rather than plausible defaults.

The platform [expansion index](https://github.com/dakkah-core/dakkah-cityos-cms/blob/main/docs/delivery/cityos-expansion/README.md), [owner handoffs](https://github.com/dakkah-core/dakkah-cityos-cms/blob/main/docs/delivery/cityos-expansion/owner-notes.md) and [coordination issue #256](https://github.com/dakkah-core/dakkah-cityos-cms/issues/256) retain programme tracking. Work directly on each repository's main branch, preserve concurrent changes, publish non-forced updates, and record the exact verified source/package pair. No owner acknowledgement, operational activation or release approval is implied by this note.
