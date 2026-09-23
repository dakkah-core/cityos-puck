# CityOS compiler and fork conformance

This is a bounded implementation reference, not a package release, deployment or complete Studio acceptance record. Accountable maintainer assignment is not inferred.

## Implemented source pair

The platform's existing CityOS Compiler gained `compileStudioPuckCatalog` at `dakkah-core/dakkah-cityos-cms@6fa123d09ba43d3117f1cb15bed1e4c59d3e45bf`. Its maintained compiler/Drizzle/PostgreSQL profile passed 640 cases with zero failures or skips, including 22 new target cases. The fork's declaration-safe V1 binding correction at `0bd44f0db63e832ec673db51176d1f9195c478c9` passed registration and full build/test CI. Subsequent structured-field work remains preserved; V1 inputs are not silently upgraded to V2.

The compiler consumes a serialized projection of the canonical native component catalog plus independently resolved owner admission and renderer-build bindings. It generates field/slot metadata, retained owner field constraints, and an integrity-bound candidate manifest. It does not register an owner, grant access, install JavaScript, apply a database migration or activate a service.

Read the [platform target guide](https://github.com/dakkah-core/dakkah-cityos-cms/blob/6fa123d09ba43d3117f1cb15bed1e4c59d3e45bf/docs/development/compiler-studio-puck-target.md) and the [versioned fork contract](cityos-registration.md) together.

## Retained cross-repository fixture

`scripts/cityos/fixtures/compiler-registration.v1.json` is the exact generated fixture retained by the compiler profile, not copied compiler or fork implementation. Its UTF-8 byte SHA-256 is `e55e668a4c9a0c7ef6b3838c7a6177bda804ca734ff84a593a69accec77a2933`. Its sorted-compact registration digest is `sha256:b8244096f4aa91b86e80271f574a14341cc2f598e58b2d6d8d6f4404a222010b`. The identities differ deliberately. The source owner, build references and renderer digests inside this file are synthetic acceptance data, never operational admission.

The maintained registration job runs `scripts/cityos/compiler-conformance.test.mjs` through its existing wildcard. The five cases verify exact fixture integrity, compiler/fork digest agreement, Arabic labels and numeric/enum/root-slot binding, rejection of the wrong digest, tamper rejection, and cached-render revocation. The renderer functions in these transport-contract cases are explicit fixtures; actual Puck Render/editor tests remain separate and are not replaced.

Local Node 22 type-stripped execution passed all five cases against the previously verified V1 source. CI on the new commit must establish compatibility with the current fork including concurrent V2 work. No later CI result is presumed by this document.

## Notes to maintainers and system owners

Platform Engineering owns generation, source definitions and the owner-admission boundary. The fork owns versioned editor primitives and binding, not business permissions. Studio/BFF must deliver authorized metadata, resolve installed builds, handle revocation/locale/context changes and enforce the canonical document command boundary.

All system owners should contribute explicit definitions and typed operations instead of a copied Studio or arbitrary executable configuration. Supported combinations of installed primitives can expand through configuration. A new semantic primitive, provider, surface or business rule still needs a qualified implementation and independent acceptance before configuration may use it.

The compiler target currently emits V1. Qualification of V2 fields and mappings is separate; a fork accepting object arrays does not prove native string-array document conversion. Next work includes compatible package publication and exact pinning, the real host field/slot/property integration, authorized contribution discovery, canonical save/reload and denial/recovery, and A/B/C acceptance. None of the 32 Studio families, 64 scenarios, business-behavior requirements or owner workflows is narrowed to this fixture.

Progress remains in the platform [expansion register](https://github.com/dakkah-core/dakkah-cityos-cms/blob/main/docs/delivery/cityos-expansion/progress.json) and [issue 256](https://github.com/dakkah-core/dakkah-cityos-cms/issues/256). Both repositories use non-forced mainline publication with concurrent changes preserved. Handoff publication is not individual owner acknowledgement.
