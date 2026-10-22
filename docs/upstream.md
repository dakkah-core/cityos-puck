# Maintaining the CityOS fork

`dakkah-core/cityos-puck` remains a GitHub fork of `puckeditor/puck`.
`origin/main` is the maintained CityOS branch; the `upstream` remote tracks
`https://github.com/puckeditor/puck.git`. Updates flow from upstream into CityOS.
An upstream contribution or pull request is not required to maintain this fork.

## Updating upstream

Fetch upstream, resolve its exact commit, and inspect the incoming changes:

```sh
git fetch --no-tags upstream main
git rev-parse upstream/main
git log --oneline HEAD..upstream/main
git diff HEAD...upstream/main
```

Merge that exact SHA using `git merge --no-ff --no-commit <upstream-sha>`.
Resolve each conflict with both upstream behavior and CityOS behavior in view.
Keep the real merge parent so Git can identify already integrated changes on
the next update. Do not replace CityOS main with an upstream tree or resolve
every conflict by selecting one side.

Preserve the implementation under `extensions/cityos`, the small core bridges,
custom-field editor context, permission transitions, registration contracts,
and CMS/Studio integration. Keep the package name `@cityos-core/puck`, canonical
toolchain and dependency catalogs, current docs routing, and CityOS release
workflows. Upstream dependency upgrades need an explicit catalog migration.

Set `config/upstream/integration.json#upstream.commit` to the integrated SHA.
Declare any new fork-specific paths with their invariants and regression checks.
Adapt incoming docs to the current content directory and client example boundary;
capture changed and added preservation inputs through
`scripts/toolchains/capture-docs-preservation.mjs`, then regenerate the formatting
projection. Keep the original migration fixture as historical evidence.

Select the canonical runtime before running repository commands. Use only
`node scripts/toolchains/run-pinned-pnpm.mjs` for package-manager operations.
Run source-boundary checks, CityOS registration tests, compiler checks, core
tests, formatting, lint, and the complete consumer build before committing
the resolved merge. Push the validated merge to `origin/main`.

## Integration evidence and npm releases

Run `qualify-cityos.yml` against the new fork main commit with a separately
pinned authoritative CMS/Studio commit. Keep all four required checks:
`source-boundary`, `core-tests`, `packed-consumers`, and `cms-host`.
Local editor checks supplement actual CMS host qualification.

A merge does not change an already published npm package. A later publication
needs an unused CityOS package version and qualification for the exact source
commit. Follow [the publishing workflow](publishing.md) to publish the qualified
tarball with the `cityos` tag and provenance. Consumer adoption is a separate step.
