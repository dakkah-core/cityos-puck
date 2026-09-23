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
  install) command=(pnpm install --frozen-lockfile) ;;
  test) command=(pnpm test) ;;
  lint) command=(pnpm lint) ;;
  format) command=(pnpm format:check) ;;
  build) command=(pnpm build) ;;
  *) echo 'Unknown maintained check.' >&2; exit 64 ;;
esac

root="$(git rev-parse --show-toplevel)"
cd "$root"
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
