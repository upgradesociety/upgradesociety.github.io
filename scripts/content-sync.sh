#!/usr/bin/env bash
set -Eeuo pipefail

CMD="${1:-status}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/content-manager.project.json"

find_content_manager() {
  if [[ -n "${CONTENT_MANAGER_ROOT:-}" && -f "$CONTENT_MANAGER_ROOT/scripts/sync-content-project.js" ]]; then
    printf '%s\n' "$CONTENT_MANAGER_ROOT"
    return 0
  fi
  for candidate in \
    "$HOME/AI-System/Projects/content-manager" \
    "$HOME/Documents/AI-System/Projects/content-manager" \
    "$HOME/Documents/projects/AI-System/Projects/content-manager"
  do
    if [[ -f "$candidate/scripts/sync-content-project.js" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

CM_ROOT="$(find_content_manager || true)"
if [[ -z "$CM_ROOT" ]]; then
  echo "ERROR: Content Manager was not found." >&2
  echo "Set CONTENT_MANAGER_ROOT to the Content Manager project directory." >&2
  exit 1
fi

exec bash "$ROOT/scripts/content-manager-node.sh" "$CM_ROOT/scripts/sync-content-project.js" "$CMD" "$MANIFEST" "${@:2}"
