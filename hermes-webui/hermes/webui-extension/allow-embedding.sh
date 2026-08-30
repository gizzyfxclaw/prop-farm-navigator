#!/usr/bin/env bash
#
# Let the GizzyFx engine embed the Hermes console in an iframe.
#
# Upstream hardcodes `frame-ancestors 'none'` plus `X-Frame-Options: DENY`, so
# the console refuses to render inside any page but its own. That default is
# deliberate — the console can drive the agent, which can run commands on this
# box, so being framed by a hostile page is a real clickjacking risk.
#
# This narrows the rule rather than removing it: exactly one extra origin, your
# own engine, is allowed to frame the console. Every other site is still
# refused. Read WHAT THIS COSTS below before running it.
#
#   WHAT THIS COSTS
#   Anyone able to inject markup into https://gizzyfxstrategy.dpdns.org could
#   then frame the console and try to trick you into clicking inside it. On a
#   single-user deployment where you control both origins that is a small,
#   contained risk. It is NOT appropriate if the engine is ever shared with
#   people you would not hand the agent to.
#
# Re-runnable. Writes a timestamped backup, and `--revert` restores upstream.
set -euo pipefail

WEBUI_DIR="${HERMES_WEBUI_DIR:-/opt/hermes-webui}"
HELPERS="$WEBUI_DIR/api/helpers.py"
ENGINE_ORIGIN="${GIZZYFX_ORIGIN:-https://gizzyfxstrategy.dpdns.org}"

[[ -f "$HELPERS" ]] || { echo "ERROR: $HELPERS not found. Set HERMES_WEBUI_DIR." >&2; exit 1; }

# ── Revert ──────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--revert" ]]; then
  # The OLDEST backup is the pristine one; a newer backup may itself be patched.
  original=$(ls -1tr "$HELPERS".gizzyfx-bak.* 2>/dev/null | head -1 || true)
  [[ -n "$original" ]] || { echo "No backup found; nothing to revert." >&2; exit 1; }
  cp "$original" "$HELPERS"
  echo "Restored $HELPERS from $original"
  systemctl --user restart hermes-webui 2>/dev/null && echo "Service restarted."
  exit 0
fi

if grep -q "_gizzyfx_origin" "$HELPERS"; then
  echo "  backup: skipped (already patched — keeping the pristine copy)"
else
  cp "$HELPERS" "$HELPERS.gizzyfx-bak.$(date +%Y%m%d%H%M%S)"
  echo "  backup: written alongside the file"
fi

GIZZYFX_ORIGIN="$ENGINE_ORIGIN" python3 - "$HELPERS" <<'PY'
import os, re, sys

path = sys.argv[1]
origin = os.environ["GIZZYFX_ORIGIN"]
src = open(path).read()

# 1. Widen frame-ancestors to this one extra origin.
want = f"frame-ancestors 'self' {origin}; "
if want in src:
    print("  frame-ancestors: already allows the engine")
elif "frame-ancestors 'none'; " in src:
    src = src.replace("frame-ancestors 'none'; ", want, 1)
    print(f"  frame-ancestors: now 'self' {origin}")
else:
    sys.exit("  ERROR: could not find the frame-ancestors directive to patch")

# 2. X-Frame-Options has no allowlist form that browsers still honour, and a
#    bare DENY would veto the iframe before CSP is consulted. Send it only when
#    the request is not the framed engine — every other client keeps DENY.
old_xfo = "    handler.send_header('X-Frame-Options', 'DENY')\n"
new_xfo = (
    "    # X-Frame-Options has no working allowlist form, and DENY would block\n"
    "    # the engine's iframe before CSP frame-ancestors is evaluated. Keep\n"
    "    # sending it to everyone else so non-CSP clients stay protected.\n"
    "    if getattr(handler, '_gizzyfx_embeddable', False):\n"
    "        pass\n"
    "    else:\n"
    "        handler.send_header('X-Frame-Options', 'DENY')\n"
)
if "_gizzyfx_embeddable" in src:
    print("  X-Frame-Options: already conditional")
elif old_xfo in src:
    src = src.replace(old_xfo, new_xfo, 1)
    print("  X-Frame-Options: now conditional")
else:
    sys.exit("  ERROR: could not find the X-Frame-Options header to patch")

# 3. Mark requests that arrive from the engine, so the branch above can fire.
marker = "def _security_headers(handler):\n    \"\"\"Add security headers to every response.\"\"\"\n"
inject = (
    marker
    + "    # Only the configured engine origin may frame us; everyone else keeps DENY.\n"
    + f"    _gizzyfx_origin = {origin!r}\n"
    + "    _ref = (handler.headers.get('Referer') or '') if getattr(handler, 'headers', None) else ''\n"
    + "    _sfd = (handler.headers.get('Sec-Fetch-Dest') or '') if getattr(handler, 'headers', None) else ''\n"
    + "    handler._gizzyfx_embeddable = _sfd == 'iframe' and _ref.startswith(_gizzyfx_origin)\n"
)
if "_gizzyfx_origin =" in src:
    print("  request marker: already present")
elif marker in src:
    src = src.replace(marker, inject, 1)
    print("  request marker: added")
else:
    sys.exit("  ERROR: could not find _security_headers to patch")

open(path, "w").write(src)
PY

python3 -c "import ast,sys; ast.parse(open('$HELPERS').read())" \
  && echo "  syntax: OK" \
  || { echo "  ERROR: patched file does not parse — restoring backup" >&2
       cp "$(ls -1tr "$HELPERS".gizzyfx-bak.* | head -1)" "$HELPERS"; exit 1; }

if systemctl --user is-active --quiet hermes-webui 2>/dev/null; then
  systemctl --user restart hermes-webui
  echo "  service: restarted"
else
  echo "  service: not under 'systemctl --user' — restart it yourself"
fi

cat <<DONE

Done. The console can now be framed by $ENGINE_ORIGIN and nothing else.
Open the engine and use the Console tab; hard-reload if it was already open.

To undo:  bash allow-embedding.sh --revert
DONE
