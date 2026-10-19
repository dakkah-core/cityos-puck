#!/usr/bin/env bash
# Source from bash on Linux, macOS or Git Bash; PATH is process-local.
_puck_select_workspace_node() {
  local puck_root puck_resolver puck_bootstrap puck_node puck_expected puck_directory
  puck_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)" || return 1
  puck_resolver="$puck_root/scripts/toolchains/resolve-workspace-node.mjs"
  # type -P bypasses shell functions and aliases for the bootstrap resolver only.
  puck_bootstrap="$(type -P node)" || return 1
  puck_node="$("$puck_bootstrap" "$puck_resolver")" || return 1
  puck_expected="$("$puck_bootstrap" "$puck_resolver" --version)" || return 1
  if command -v cygpath >/dev/null 2>&1; then puck_node="$(cygpath -u "$puck_node")" || return 1; fi
  [[ "$("$puck_node" --version)" == "$puck_expected" ]] || return 1
  if [[ "$(type -t node)" != file ]]; then
    echo 'Remove the node alias or function shadow before selecting the workspace runtime.' >&2
    return 1
  fi
  puck_directory="$(dirname -- "$puck_node")"
  export PATH="$puck_directory:$PATH"
  hash -r
  [[ "$(node --version)" == "$puck_expected" ]] || return 1
  printf 'Puck selected Node %s (%s).\n' "$puck_expected" "$puck_node"
}
_puck_select_workspace_node
