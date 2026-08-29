#!/usr/bin/env bash
# ── GizzyFx ↔ Hermes Agent setup script ──────────────────────────────────
# Run this on your VPS from inside /opt/hermes-webui (or wherever you cloned it):
#   bash hermes/setup.sh
#
# What it does:
#   1. Installs the Python dependencies for the MCP server
#   2. Prints the block to add to ~/.hermes/config.yaml
#   3. Prints the commands to set your API key in the config
# ──────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_SCRIPT="$SCRIPT_DIR/gizzyfx_mcp.py"
CONFIG_YAML="$HOME/.hermes/config.yaml"

echo ""
echo "=== GizzyFx MCP server setup ==="
echo ""

# 1. Install dependencies
echo "▶ Installing Python dependencies (mcp, httpx)..."
if command -v pip3 &>/dev/null; then
    pip3 install --quiet "mcp>=1.28,<2" httpx
elif command -v pip &>/dev/null; then
    pip install --quiet "mcp>=1.28,<2" httpx
else
    echo "  ERROR: pip not found. Install it first then re-run this script."
    exit 1
fi
echo "  ✓ Dependencies installed"
echo ""

# 2. Ask for the API key
echo "▶ Enter your x-hermes-key (the shared secret from D1)."
echo "  You can find it / reset it via the GizzyFx app Settings page."
read -rsp "  API key: " API_KEY
echo ""
echo ""

if [[ -z "$API_KEY" ]]; then
    echo "  ERROR: API key cannot be empty."
    exit 1
fi

# 3. Patch or create config.yaml
echo "▶ Patching ~/.hermes/config.yaml..."
mkdir -p "$HOME/.hermes"

if [[ ! -f "$CONFIG_YAML" ]]; then
    cat > "$CONFIG_YAML" <<YAML
# Hermes Agent config — auto-created by GizzyFx setup
mcp_servers:
  gizzyfx:
    command: python3
    args:
      - $MCP_SCRIPT
    env:
      GIZZYFX_API_URL: "https://gizzyfxstrategy.dpdns.org"
      GIZZYFX_API_KEY: "$API_KEY"
YAML
    echo "  ✓ Created $CONFIG_YAML"
else
    # Append if gizzyfx block doesn't already exist
    if grep -q "gizzyfx" "$CONFIG_YAML"; then
        echo "  ⚠ 'gizzyfx' block already found in $CONFIG_YAML — not overwriting."
        echo "    Update the GIZZYFX_API_KEY value there manually."
    else
        cat >> "$CONFIG_YAML" <<YAML

# GizzyFx trading terminal integration (added by setup.sh)
mcp_servers:
  gizzyfx:
    command: python3
    args:
      - $MCP_SCRIPT
    env:
      GIZZYFX_API_URL: "https://gizzyfxstrategy.dpdns.org"
      GIZZYFX_API_KEY: "$API_KEY"
YAML
        echo "  ✓ Appended gizzyfx MCP block to $CONFIG_YAML"
    fi
fi

echo ""
echo "=== Done! ==="
echo ""
echo "Next steps:"
echo "  1. Restart your Hermes agent (./ctl.sh restart  or  ./start.sh)"
echo "  2. Open the Hermes console and start a new session"
echo "  3. Ask Hermes to 'check for pending trading analysis requests'"
echo "  4. Go to the GizzyFx Engine → Trading Agent page and click 'Request Analysis'"
echo "  5. Watch the chart — drawings appear live as Hermes works"
echo ""
echo "  GizzyFx Engine:    https://gizzyfxstrategy.dpdns.org"
echo "  Hermes console:    https://hermes.gizzyfxstrategy.dpdns.org"
echo ""
