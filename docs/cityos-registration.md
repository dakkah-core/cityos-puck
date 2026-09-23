# CityOS compiler registration boundary

Status: implemented source with maintained verification; not a published-package or full Unified Studio acceptance claim. Accountable maintainer assignment remains unrecorded. This is bounded CXD-006/ST-C04/ST-C30 infrastructure; it does not narrow the complete Expanded Studio specification.

## Ownership

The CityOS Compiler and accepted owner definitions remain in `dakkah-core/dakkah-cityos-cms`. This fork owns editor implementation and target binding. A registration manifest is a derived target artifact, not another system registry, permission store or business authority. Existing `@cityos-core/puck@0.23.0-cityos.2` consumers do not automatically receive new source exports. Source commits do not publish packages or update the CMS lockfile.

## API and versions

The `@cityos-core/puck/cityos` entrypoint exports `parseCityOSPuckRegistration`, `digestCityOSPuckRegistration` and `bindCityOSPuckRegistration`.

A manifest identifies its data profile, source owner, registry revision, source-definition digest, component types, labels, fields, slots, and exact renderer keys/versions/digests. The binder requires an independently supplied expected manifest digest and an installed-renderer resolver. It never imports modules, fetches arbitrary URLs, fills withheld properties, grants permissions, saves data, or invokes an owner command.

`cityos.puck.registration.v1` retains its existing field vocabulary and hashing semantics: text, textarea, bounded number, scalar select and top-level slot. It still rejects new field semantics. Existing V1 inputs are not rewritten as V2.

`cityos.puck.registration.v2` additionally admits the implemented Puck `object`, bounded object-item `array`, and scalar `radio` fields. Use `CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION` explicitly. Both versions use the unchanged native-screen slots data profile; this extends target registration, not the persisted CityOS document contract.

For V2:

- Object fields declare a nonempty `objectFields` map; array fields declare a nonempty `arrayFields` map and explicit integer `min`/`max` between zero and 1,000.
- Nested object/array schemas may reach four levels, with at most 128 fields per map and 512 total fields per component/root entry. The general data-only, input-size and cycle checks still apply.
- Field names are identifier segments, not dotted or bracketed paths. Node-level `id`, `type`, `puck` and `editMode` remain reserved. Nested `id` and `type` are ordinary data properties, not component identities. Prototype keys remain forbidden everywhere.
- Slots inside nested objects or repeated data are rejected. They require a separately qualified CityOS structural mapping rather than confusing ordinary data with canonical node slots.
- Rich text, external/reference fields, executable custom fields and provider behavior remain unsupported by this registration version. They never downgrade silently to text.
- No `defaultItemProps`, callback, field renderer, permission grant or executable hook may come from registration metadata. Binding clones field schemas into actual typed Puck controls and does not manufacture authored values.
- Array/number limits configure editor controls; the canonical owner still validates submitted data, permissions, represented parties and business invariants. This binder is not a replacement validation or authorization service.

Labels can be compiled for the selected locale; the host must invalidate/rebind the projection when locale or authority changes. This is not a complete translated Puck interface or a locale-value storage implementation.

## Configuration-only extension example

An accepted target definition can describe a previously unnamed component using an already installed renderer and fields such as:

```json
{
  "profile": {
    "type": "object",
    "label": "Profile",
    "objectFields": {
      "name": { "type": "text", "label": "Name" }
    }
  },
  "rows": {
    "type": "array",
    "label": "Rows",
    "min": 0,
    "max": 20,
    "arrayFields": {
      "value": { "type": "textarea", "label": "Value" }
    }
  }
}
```

No handwritten component-name switch or new field implementation is needed for another combination of these installed primitives. A genuinely new semantic primitive still requires an implemented and versioned compiler/target/runtime extension with independent tests. The platform compiler must emit the new version deliberately; this fork does not silently extend the upstream definition language or register a system owner.

## Renderer and session boundaries

Metadata using installed compatible renderers can bind new component names without a handwritten component list. New renderer semantics still need a verified implementation and build. Renderer disablement or replacement is checked again when a previously bound render function is called. The host must also react to authorization/tenant changes by invalidating sessions and projections; integrity checks are not caller authorization.

The returned Puck configuration is an editing projection. The native owner, change kernel, revisions, review and publication remain in CityOS. Puck field controls are not permission grants. Source changes here do not by themselves complete the CMS application's property or structural-edit adapter.

## Verification and release

Run `node --experimental-strip-types --test scripts/cityos/registration.test.mjs` for the original data-only, hash, schema, slot and revocation regressions. The maintained core Jest suite includes the structured-schema positive/negative cases, prepared public package exports, actual Puck field editing and actual Puck `Render` output.

The structured tests exercise nested edits, identity/value preservation, array capacity, typed radio values, read-only controls and a newly named config-only component without a second editor implementation. This is editor/component acceptance, not authenticated Next.js Studio, CMS persistence, publication, live provider or browser-engine proof.

Existing CI remains responsible for declaration builds, tests, lint, formatting and complete package/application builds. The explicit CityOS publication workflow remains manual and requires verification. Never describe a source commit, metadata digest or green unit suite as a published and consumed package. Exact CI results, including failures, must be reported against their commit.

## Cross-repository handoff and remaining work

Platform Engineering: emit the versioned target artifact from canonical component/contribution definitions, pin its digest, and independently validate owner admission. Studio/BFF: return authorized contributions, resolve admitted module builds, preserve the real proxy/session/CSRF boundary, and consume the actual editor configuration. Complete structural operations through the CityOS change kernel before retiring the native canvas.

All 32 Studio capability families and 64 scenarios in the expansion reference, the separately preserved original Studio register and v2.1 overlay, four backend behavior kinds, six Studio flow classes, L0-L9 composition, Studio A/B/C, core/shared E01-E08 and vertical A-I remain in scope. This field implementation does not mark their full capability obligations complete.

The platform [expansion index](https://github.com/dakkah-core/dakkah-cityos-cms/blob/main/docs/delivery/cityos-expansion/README.md), [owner handoffs](https://github.com/dakkah-core/dakkah-cityos-cms/blob/main/docs/delivery/cityos-expansion/owner-notes.md) and [coordination issue #256](https://github.com/dakkah-core/dakkah-cityos-cms/issues/256) retain programme tracking. Work directly on each repository's main branch, preserve concurrent changes, publish non-forced updates, and record the exact verified source/package pair. No owner acknowledgement, operational activation or release approval is implied by this note.
