# CityOS structured compiler conformance

This is a working implementation and owner-handoff note, not runtime admission or a release approval. The fork owns its editor implementation; the platform owns the existing CityOS Compiler, canonical source definitions, owner runtime and Unified Studio host. Do not copy either implementation into the other repository.

## Implemented protocol qualification

The existing `cityos.puck.registration.v2` parser/binder accepts bounded nested objects, arrays of records and radio controls. The platform target now has an explicit `cityos.compiler.studio-puck-source.v2` producer for that contract. V1 remains scalar-only; a version label cannot silently make unsupported structured input valid.

`scripts/cityos/fixtures/compiler-registration.v2.json` is generated conformance data. Its evidence file binds the exact compiler source blob, canonical-hashing and owner-policy dependency blobs, source hash, registration digest and artifact-byte digest. The fixture uses synthetic owner/renderer admission and grants no production capability. The two digests are deliberately different: only the independently admitted registration digest is passed to the binder.

Run `node --experimental-strip-types --test scripts/cityos/compiler-structured-conformance.test.mjs`. The existing CI glob includes this suite. Its eight cases verify the actual generated Arabic object/record-array/Boolean fields, metadata integrity, v1 rejection, per-session mutable field isolation, receiving limits, missing/revoked renderers, and explicit null/false option preservation. No manual field conversion or hidden defaults are introduced.

The data-only snapshot now returns `null` explicitly before narrowing Boolean input. An isolated declaration check reproduced the previous combined branch's error with `strictNullChecks=false`; the correction passed both null-checking profiles without a type assertion. Those local declaration checks used minimal external type stand-ins and are not the actual package DTS build. Full fork/package CI must establish that separately; this note does not attribute every prior CI failure to that branch.

## Reproduction and ownership

The platform guide is `docs/development/compiler-studio-puck-target.md`; its fixture source is exported by `packages/cityos-compiler/tests/engineering-compiler/studio-puck-structured.cases.ts`. Compile that source with its fixture admission options and Arabic locale to regenerate the registration. Copy only the exact generated fixture and provenance, never fork/compiler source. A new fixture must preserve the independent expected field shapes, limits and negative checks.

All system owners may consume admitted generated metadata using installed supported primitives. They must retain owner-side field policy, business rules, scope and migration authority. The fork does not infer schema evolution, arbitrary editor code, pricing, capacity, credentials, approval or runtime authority from a field definition. Future unsupported types remain explicit gaps requiring qualified reusable extensions.

## Remaining work

This supports P-04/P-ST02, WP-05/WP-11 and ST-C04/ST-C14/ST-C30/ST-C32 without closing them. The programme still requires the complete 32 capability families, 64 acceptance scenarios and Studio A/B/C journeys. Missing proof includes reproducible full fork package/build, immutable package publication and platform pinning, real host/catalog adoption, browser document save/reload, authorized discovery, runtime revocation and target-specific rendering. No package version or registry publication is claimed here, and no old editor or owner writer has been removed.
