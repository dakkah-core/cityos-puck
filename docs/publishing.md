# Publishing `@cityos-core/puck`

The package is published from `dakkah-core/cityos-puck` by
`.github/workflows/publish-cityos.yml`.

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
