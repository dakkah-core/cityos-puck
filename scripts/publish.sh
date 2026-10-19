#!/usr/bin/env bash
set -euo pipefail
puck_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$puck_root"
source scripts/toolchains/select-workspace-node.sh

cd packages/core && node ../../scripts/toolchains/run-pinned-pnpm.mjs publish --access public --tag $1 --no-git-checks
cd ../../

cd packages/field-contentful && node ../../scripts/toolchains/run-pinned-pnpm.mjs publish --access public --tag $1 --no-git-checks
cd ../../

cd packages/plugin-emotion-cache && node ../../scripts/toolchains/run-pinned-pnpm.mjs publish --access public --tag $1 --no-git-checks
cd ../../

cd packages/plugin-heading-analyzer && node ../../scripts/toolchains/run-pinned-pnpm.mjs publish --access public --tag $1 --no-git-checks
cd ../../

cd packages/create-puck-app && node ../../scripts/toolchains/run-pinned-pnpm.mjs run removeGitignore && node ../../scripts/toolchains/run-pinned-pnpm.mjs publish --access public --tag $1 --no-git-checks && node ../../scripts/toolchains/run-pinned-pnpm.mjs run restoreGitignore
cd ../../
