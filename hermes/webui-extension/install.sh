#!/usr/bin/env bash
# Install the GizzyFx skin + navigation extension into Hermes WebUI.
#
# Run this from the directory containing gizzyfx.css and gizzyfx.js:
#   bash install.sh
#
# It copies the assets into ~/.hermes/webui-extension/, adds the three
# HERMES_WEBUI_EXTENSION_* settings to the WebUI .env (replacing any previous
# values rather than appending duplicates), and restarts the service.
set -euo pipefail

EXT_DIR="${HOME}/.hermes/webui-extension"
ENV_FILE="${HERMES_WEBUI_ENV:-/opt/hermes-webui/.env}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ Installing GizzyFx WebUI extension"

# 1. Assets ------------------------------------------------------------------
mkdir -p "$EXT_DIR"
cp "$SRC_DIR/gizzyfx.css" "$SRC_DIR/gizzyfx.js" "$EXT_DIR/"
echo "  assets  → $EXT_DIR"

# 2. Environment -------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo "  ERROR: $ENV_FILE not found." >&2
  echo "  Set HERMES_WEBUI_ENV=/path/to/.env and re-run." >&2
  exit 1
fi

cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"

set_env() {
  local key="$1" value="$2"
  # Drop any existing definition, then append the current one.
  sed -i "/^${key}=/d" "$ENV_FILE"
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
}

set_env HERMES_WEBUI_EXTENSION_DIR "$EXT_DIR"
set_env HERMES_WEBUI_EXTENSION_STYLESHEET_URLS "/extensions/gizzyfx.css"
set_env HERMES_WEBUI_EXTENSION_SCRIPT_URLS "/extensions/gizzyfx.js"
echo "  env     → $ENV_FILE (backup written alongside it)"

# 3. Restart -----------------------------------------------------------------
if systemctl --user is-active --quiet hermes-webui 2>/dev/null; then
  systemctl --user restart hermes-webui
  echo "  service → restarted (systemd --user)"
else
  echo "  service → not running under 'systemctl --user'; restart it yourself"
fi

cat <<'DONE'

Installed. To finish:

  1. Hard-reload the Hermes console (Ctrl/Cmd + Shift + R).
  2. Open Settings (gear icon) → Appearance → Skin → pick "GizzyFx".

The skin persists across reloads. A "Engine / Trading Agent" bar now sits in
the bottom-right corner of every page.
DONE
