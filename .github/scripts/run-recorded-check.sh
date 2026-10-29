#!/usr/bin/env bash
# Preserve the actual command status and exact output for the maintained checks.
# This script neither publishes a package nor changes a repository reference.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'Expected one maintained check name.' >&2
  exit 64
fi
check="$1"
case "$check" in
  install) command=(node scripts/toolchains/run-pinned-pnpm.mjs install --frozen-lockfile) ;;
  compatibility) command=(node scripts/toolchains/run-pinned-pnpm.mjs exec node --test scripts/toolchains/core-build.test.mjs scripts/toolchains/installed-compatibility.test.mjs scripts/toolchains/e2e-smoke.test.mjs scripts/cityos/resolver-stable.test.mjs scripts/cityos/react-resolver-stable.test.mjs) ;;
  # These suites exercise generated output, temporary packages and shared toolchains.
  generated-types) command=(node --test --test-concurrency=1 packages/create-puck-app/pinned-pnpm.test.mjs scripts/cityos/generated-types-ci.test.mjs scripts/toolchains/generated-types-policy/generated-types-policy.test.mjs scripts/toolchains/generated-types-policy/generated-type-check-evidence.test.mjs scripts/toolchains/generated-types-policy/resolution-namespace-v2.test.mjs scripts/toolchains/verify-generated-types-policy.test.mjs scripts/toolchains/next-generated-types.test.mjs scripts/toolchains/next-effective-config.test.mjs scripts/toolchains/next-build-guard.test.mjs scripts/toolchains/next-source-fingerprint.test.mjs scripts/toolchains/next-output-lock.test.mjs scripts/toolchains/next-project-config.test.mjs scripts/toolchains/next-typecheck-cache.test.mjs scripts/toolchains/next-typecheck-overlay.test.mjs scripts/toolchains/next-typegen-fixture.test.mjs scripts/toolchains/react-router-typecheck-cache.test.mjs packages/create-puck-app/scripts/copy-recipes.test.mjs packages/create-puck-app/scripts/clean-pack.test.mjs packages/create-puck-app/scripts/next-standalone.test.mjs packages/create-puck-app/scripts/react-router-standalone.test.mjs) ;;
  test) command=(node scripts/toolchains/run-pinned-pnpm.mjs test) ;;
  lint) command=(node scripts/toolchains/run-pinned-pnpm.mjs lint) ;;
  format) command=(node scripts/toolchains/run-pinned-pnpm.mjs format:check) ;;
  # Next/Vite native workers must not exhaust the runner while all consumers build.
  # Serial scheduling retains every build target and the normal task graph.
  build) command=(node scripts/toolchains/run-pinned-pnpm.mjs build --concurrency=1) ;;
  *) echo 'Unknown maintained check.' >&2; exit 64 ;;
esac

root="$(git rev-parse --show-toplevel)"
cd "$root"
source scripts/toolchains/select-workspace-node.sh
source_sha="$(git rev-parse HEAD)"
output='.build/cityos-ci'
mkdir -p "$output"
printf 'CITYOS_CHECK_START source=%s check=%s\n' "$source_sha" "$check"

# Capture both statuses immediately: tee must never turn a failing check green.
set +e
"${command[@]}" 2>&1 | tee "$output/$check.log"
statuses=("${PIPESTATUS[@]}")
set -e
command_status="${statuses[0]}"
logging_status="${statuses[1]}"
log_digest="$(sha256sum "$output/$check.log" | cut -d ' ' -f 1)"
printf '{"schemaVersion":1,"sourceSha":"%s","check":"%s","commandExitCode":%s,"loggingExitCode":%s,"logSha256":"%s"}\n' \
  "$source_sha" "$check" "$command_status" "$logging_status" "$log_digest" \
  > "$output/$check.json"
printf 'CITYOS_CHECK_RESULT source=%s check=%s command_exit=%s logging_exit=%s log_sha256=%s\n' \
  "$source_sha" "$check" "$command_status" "$logging_status" "$log_digest"

if [[ "$command_status" -ne 0 ]]; then
  exit "$command_status"
fi
exit "$logging_status"
