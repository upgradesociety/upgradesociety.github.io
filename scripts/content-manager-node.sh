#!/usr/bin/env bash
set -Eeuo pipefail

# Delegate runtime selection to Content Studio itself whenever possible. This
# keeps Upgrade Society and every other project on the exact same Node binary
# as content-studio.service and its native modules.
find_content_manager_launcher() {
  local candidate
  for candidate in \
    "${CONTENT_MANAGER_ROOT:-}" \
    "$HOME/AI-System/Projects/content-manager" \
    "$HOME/Documents/AI-System/Projects/content-manager" \
    "$HOME/Documents/projects/AI-System/Projects/content-manager"
  do
    [[ -n "$candidate" ]] || continue
    if [[ -x "$candidate/scripts/content-studio-node.sh" ]]; then
      printf '%s\n' "$candidate/scripts/content-studio-node.sh"
      return 0
    fi
  done
  return 1
}

LAUNCHER="$(find_content_manager_launcher || true)"
if [[ -n "$LAUNCHER" ]]; then
  exec "$LAUNCHER" "$@"
fi

# Compatibility fallback for a pre-v1.8.2 Content Studio install.
resolve_content_manager_node() {
  if [[ -n "${CONTENT_MANAGER_NODE:-}" && -x "${CONTENT_MANAGER_NODE}" ]]; then
    printf '%s\n' "$CONTENT_MANAGER_NODE"
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1; then
    local pid service_node
    pid="$(systemctl show content-studio.service -p MainPID --value 2>/dev/null || true)"
    if [[ "$pid" =~ ^[1-9][0-9]*$ ]] && [[ -e "/proc/$pid/exe" ]]; then
      service_node="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
      if [[ -n "$service_node" && -x "$service_node" ]]; then
        printf '%s\n' "$service_node"
        return 0
      fi
    fi

    service_node="$(systemctl show content-studio.service -p ExecStart --value 2>/dev/null \
      | sed -n 's/.*path=\([^ ;}]*\).*/\1/p' \
      | head -1 || true)"
    if [[ -n "$service_node" && -x "$service_node" ]]; then
      printf '%s\n' "$service_node"
      return 0
    fi
  fi

  command -v node
}

NODE_BIN="$(resolve_content_manager_node || true)"
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "ERROR: Could not resolve a Node runtime for Content Studio." >&2
  echo "Set CONTENT_MANAGER_NODE to the Node binary used by content-studio.service." >&2
  exit 1
fi

exec "$NODE_BIN" "$@"
