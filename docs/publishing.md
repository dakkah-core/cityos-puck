# Publishing `@cityos-core/puck`

The package is published from `dakkah-core/cityos-puck` by
`.github/workflows/publish-cityos.yml`.

## Qualification and publication

Run `qualify-cityos.yml` on the selected fork `main` commit and supply the exact
authoritative CMS/Studio commit as `cms_commit`. The source is fetched from
`consumerRepository` in `config/upstream/integration.json`, using that exact
commit without a floating checkout or a substitute from a stale mirror.

Qualification retains source-boundary checks, core tests, packed
ESM/CommonJS/React server/TypeScript consumers, and actual CMS/Studio host
qualification against a separately pinned consumer commit. Mounted fork-local
editor checks supplement the required cross-repository host check.

The successful run uploads `cityos-puck-qualified-<source-sha>`, containing
`package.tgz`, `receipt.json`, and hashed executed-check logs. The receipt binds
the clean source identity, lockfile, package version, required checks, and exact
archive bytes, together with the tested CMS/Studio revision and its relevant
configuration and dependency identities. Missing or failing host qualification
blocks publication. Qualification makes no claim about browser drag geometry or
deployed runtime readiness.

Run `publish-cityos.yml` on the same `main` commit and supply that successful
run's ID as `qualification_run_id`. Publication verifies the receipt and logs
again and publishes the same archive with the `cityos` tag, provenance, and
lifecycle scripts disabled. A subsequent source change requires a new
qualification run.

## npm Trusted Publishing

Configure a GitHub Actions trusted publisher on the npm package settings page:

- Package: `@cityos-core/puck`
- Provider: GitHub Actions
- Organization or user: `dakkah-core`
- Repository: `cityos-puck`
- Workflow filename: `publish-cityos.yml`
- Environment name: empty (the workflow does not use a GitHub environment)
- Allow npm publish: enabled

The workflow requests `id-token: write` and publishes with npm provenance after
Trusted Publishing is configured. No npm token belongs in the repository or
workflow configuration.

## One-time bootstrap

Trusted Publishing requires the package to exist first. If an initial publish
is needed, use a short-lived npm granular token scoped to `@cityos-core` with
read/write access and the required 2FA bypass, then remove the token immediately
after publication. Do not commit the token or place it in `.env` files.

Verify the package and workflow after bootstrap:

```powershell
npm view "@cityos-core/puck" version
gh run view <run-id> --repo dakkah-core/cityos-puck
```

After Trusted Publishing is active, remove any bootstrap secret and use the
normal OIDC/provenance publish command in the workflow.
