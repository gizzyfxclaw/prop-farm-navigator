#!/usr/bin/env bash
# ── GizzyFx ↔ Hermes Agent bootstrap ─────────────────────────────────────
# One-time setup for a fresh VPS running hermes-webui at /opt/hermes-webui.
# Run it AFTER hermes-webui-sync has deployed this hermes-webui/ tree there:
#   bash /opt/hermes-webui/hermes/setup.sh
#
# What it does:
#   1. Creates a venv at /opt/hermes-webui/hermes/venv and installs deps into it
#   2. Asks for your x-hermes-key (the shared secret from the hermes_auth D1
#      table — see hermes-webui/hermes/SETUP.md for how to read/rotate it)
#   3. Writes/patches the gizzyfx MCP server block in ~/.hermes/config.yaml
#   4. Reminds you about the /opt/hermes-webui/.env additions and restart
#
# Full walkthrough, including things this script does NOT automate (the
# hermes-webui-sync cron, the Cloudflare deploy secrets, finding the shared
# secret): see SETUP.md next to this script.
# ──────────────────────────────────────────────────────────────────────────
set -e

HERMES_DIR="/opt/hermes-webui/hermes"
VENV_DIR="$HERMES_DIR/venv"
MCP_SCRIPT="$HERMES_DIR/gizzyfx_mcp.py"
CONFIG_YAML="$HOME/.hermes/config.yaml"

if [[ ! -f "$MCP_SCRIPT" ]]; then
    echo "ERROR: $MCP_SCRIPT not found."
    echo "hermes-webui-sync deploys this from the prop-farm-navigator repo's"
    echo "hermes-webui/ folder on every push to main — make sure that's run"
    echo "at least once first (see SETUP.md, step 3)."
    exit 1
fi

echo ""
echo "=== GizzyFx MCP server setup ==="
echo ""

# 1. Create venv + install dependencies (isolated from the main hermes-agent venv)
echo "▶ Setting up venv at $VENV_DIR ..."
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet "mcp>=1.28,<2" httpx
echo "  ✓ venv ready"
echo ""

# 2. Ask for the API key
echo "▶ Enter your x-hermes-key (the shared secret from the hermes_auth D1 table)."
echo "  See SETUP.md for the exact query to read or rotate it."
read -rsp "  API key: " API_KEY
echo ""
echo ""

if [[ -z "$API_KEY" ]]; then
    echo "  ERROR: API key cannot be empty."
    exit 1
fi

# 3. Ask for the tvremix key (used by get_ohlcv_data / run_deterministic_backtest)
read -rsp "▶ Enter your TVREMIX_API_KEY (leave blank to skip/add later): " TVREMIX_KEY
echo ""
echo ""

# 4. Patch or create config.yaml
echo "▶ Patching $CONFIG_YAML ..."
mkdir -p "$HOME/.hermes"

GIZZYFX_BLOCK=$(cat <<YAML
  gizzyfx:
    command: $VENV_DIR/bin/python3
    args:
      - $MCP_SCRIPT
    env:
      GIZZYFX_API_URL: https://gizzyfxstrategy.dpdns.org
      GIZZYFX_API_KEY: $API_KEY
      TVREMIX_URL: https://tvremix.xyz/api/mcp/v1
      TVREMIX_API_KEY: ${TVREMIX_KEY:-\${env:TVREMIX_API_KEY}}
YAML
)

if [[ ! -f "$CONFIG_YAML" ]] || ! grep -q "^mcp_servers:" "$CONFIG_YAML"; then
    {
        echo ""
        echo "mcp_servers:"
        echo "$GIZZYFX_BLOCK"
    } >> "$CONFIG_YAML"
    echo "  ✓ Added mcp_servers block to $CONFIG_YAML"
elif grep -q "^  gizzyfx:" "$CONFIG_YAML"; then
    echo "  ⚠ A 'gizzyfx' block already exists under mcp_servers — not overwriting."
    echo "    Update it manually to match the block below if needed:"
    echo ""
    echo "mcp_servers:"
    echo "$GIZZYFX_BLOCK"
else
    echo "  ⚠ mcp_servers: already exists but has no gizzyfx entry."
    echo "    Add this block manually, indented under your existing mcp_servers: key:"
    echo ""
    echo "$GIZZYFX_BLOCK"
fi

echo ""
echo "=== Done! ==="
echo ""
echo "Next steps:"
echo "  1. Make sure /opt/hermes-webui/.env has the three HERMES_WEBUI_* lines"
echo "     from SETUP.md (bot name, prefill script path, CSP)."
echo "  2. Restart: systemctl --user restart hermes-webui.service"
echo "  3. Open the Hermes console and start a new session."
echo "  4. Ask Hermes: 'check for pending trading analysis requests'"
echo "  5. Go to the GizzyFx Engine → Trading Agent page and click 'Request Analysis'."
echo ""
echo "  GizzyFx Engine:    https://gizzyfxstrategy.dpdns.org"
echo "  Hermes console:    https://hermes.gizzyfxstrategy.dpdns.org"
echo ""
