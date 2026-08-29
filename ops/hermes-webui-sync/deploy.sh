#!/usr/bin/env bash
# Polls gizzyfxclaw/prop-farm-navigator for new commits touching hermes-webui/
# and, if found, overlays those files onto /opt/hermes-webui and restarts the
# service. Never deletes files at the destination (so .env, venv, and any
# local-only files are left alone) — only adds/updates tracked files.
set -euo pipefail

SYNC_DIR="$HOME/hermes-webui-sync"
REPO_DIR="$SYNC_DIR/repo"
STATE_FILE="$SYNC_DIR/last_deployed_sha"
TOKEN_FILE="$SYNC_DIR/token"
DEST="/opt/hermes-webui"
REPO_URL="https://github.com/gizzyfxclaw/prop-farm-navigator.git"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

if [ ! -f "$TOKEN_FILE" ]; then
  log "ERROR: $TOKEN_FILE missing — nothing to authenticate with. Skipping."
  exit 0
fi
TOKEN="$(cat "$TOKEN_FILE")"

CRED_HELPER="!f() { echo username=x-access-token; echo password=$TOKEN; }; f"
git() { command git -c credential.helper="$CRED_HELPER" "$@"; }

if [ ! -d "$REPO_DIR/.git" ]; then
  log "Cloning sparse checkout of hermes-webui/ ..."
  git clone --filter=blob:none --sparse --no-checkout "$REPO_URL" "$REPO_DIR"
  git -C "$REPO_DIR" sparse-checkout set hermes-webui
fi

git -C "$REPO_DIR" fetch origin main --quiet

NEW_SHA="$(git -C "$REPO_DIR" rev-parse origin/main)"
OLD_SHA="$(cat "$STATE_FILE" 2>/dev/null || echo "")"

if [ "$NEW_SHA" = "$OLD_SHA" ]; then
  exit 0
fi

if [ -n "$OLD_SHA" ]; then
  CHANGED="$(git -C "$REPO_DIR" diff --name-only "$OLD_SHA" "$NEW_SHA" -- hermes-webui/ || true)"
  if [ -z "$CHANGED" ]; then
    log "New commit $NEW_SHA doesn't touch hermes-webui/ — skipping deploy, updating marker."
    echo "$NEW_SHA" > "$STATE_FILE"
    exit 0
  fi
fi

log "Deploying hermes-webui/ @ $NEW_SHA ..."
git -C "$REPO_DIR" checkout -q "$NEW_SHA" -- hermes-webui
rsync -a --exclude='VENDORED.md' "$REPO_DIR/hermes-webui/" "$DEST/"

echo "$NEW_SHA" > "$STATE_FILE"

# The rsync above overwrites api/helpers.py from pristine upstream source,
# silently wiping the console iframe-embedding patch (frame-ancestors) every
# time — reapply it (it restarts hermes-webui.service itself) instead of
# restarting separately here.
if [ -f "$DEST/hermes/webui-extension/allow-embedding.sh" ]; then
  log "Reapplying console iframe-embedding patch ..."
  bash "$DEST/hermes/webui-extension/allow-embedding.sh" || log "WARNING: allow-embedding.sh failed — console framing may be broken until it's re-run manually."
else
  log "Restarting hermes-webui.service ..."
  systemctl --user restart hermes-webui.service
fi
log "Deploy complete."
