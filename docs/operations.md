# GizzyFx Operations Guide

> Complete reference for running, debugging, and rebuilding the GizzyFx
> Terminal + GizzyFx Co-Pilot (Hermes) stack.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE (survives VPS loss)              │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Worker     │  │     D1       │  │     KV       │              │
│  │  (Nitro/     │  │  Database    │  │  Namespace   │              │
│  │   TanStack)  │  │              │  │              │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│  ┌──────┴─────────────────┴─────────────────┴───────┐              │
│  │                 Secrets (env vars)                │              │
│  │  NOUS_API_KEY, AUTH_*, TVREMIX_*, FINNHUB_*     │              │
│  └──────────────────────────────────────────────────┘              │
│                                                                     │
│  Domain: gizzyfxstrategy.dpdns.org                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ cloudflared tunnel (optional)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          VPS (Ubuntu)                              │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
│  │  smc-processor.sh │  │  hermes-webui    │  │  Python venv   │   │
│  │  (cron: */5min)  │  │  (systemd)       │  │  (Playwright)  │   │
│  └──────────────────┘  └──────────────────┘  └────────────────┘   │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐                       │
│  │  auth.json       │  │  .env            │                       │
│  │  (Nous key)      │  │  (GIZZYFX_API_KEY)│                       │
│  └──────────────────┘  └──────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Creation Guide

This section explains **how each key was created**, **what it does**, and
**how to recreate it** if lost.

---

### 1. Nous API Key (for GizzyFx Co-Pilot LLM)

**Purpose:** Authenticates LLM calls to `inference-api.nousresearch.com`
**Used by:** `smc-upgrade-chat.ts`, `smc-chat.ts`, `analyze-with-hermes.ts`
**Stored as:** Cloudflare secret `NOUS_API_KEY` + local `auth.json`

**How it was created:**
1. Signed up at https://inference-api.nousresearch.com
2. Created an API key from the account dashboard
3. Key is a JWT token (starts with `eyJ...`) — 1825 characters long
4. Set as Cloudflare secret via `npx wrangler secret put NOUS_API_KEY`
5. Also saved locally to `/home/ubuntu/.hermes/auth.json` for VPS scripts

**What it does:**
- Powers the GizzyFx Co-Pilot chat (strategy upgrade discussions)
- Powers the SMC analysis feedback (verdict, grade, levels)
- Powers the chat-about-review feature (ask questions about analysis)
- Model used: `meituan/longcat-2.0:free` (free tier)

**How to recreate:**
```bash
# 1. Go to https://inference-api.nousresearch.com → Account → API Keys
# 2. Create new key
# 3. Set in Cloudflare
npx wrangler secret put NOUS_API_KEY

# 4. Set on VPS
mkdir -p /home/ubuntu/.hermes
cat > /home/ubuntu/.hermes/auth.json << 'EOF'
{
  "providers": {
    "nous": {
      "access_token": "eyJ..."
    }
  }
}
EOF
```

---

### 2. GIZZYFX_API_KEY (Hermes Shared Secret)

**Purpose:** Authenticates VPS scripts → Cloudflare Worker
**Used by:** `smc-processor.sh`, `process_reviews.py`, `self_learn.py`
**Stored as:** D1 table `hermes_auth` (key=`shared_secret`) + local `.env`

**How it was created:**
1. Generated via `openssl rand -hex 32` — a random 64-character hex string
2. Original value: `33d1d4fe788bdddc3af35dac80ae8dff132be97c7e95dec47309e1df592e693f`
3. Inserted into D1: `INSERT INTO hermes_auth (key, value) VALUES ('shared_secret', '...')`
4. Added to `/home/ubuntu/.hermes/.env` as `GIZZYFX_API_KEY=...`
5. Scripts read it from `.env` and send as `x-hermes-key` header

**What it does:**
- VPS scripts (process_reviews.py, self_learn.py) send this key in the
  `x-hermes-key` header when calling `/api/hermes/*` endpoints
- Cloudflare Worker checks it against the `hermes_auth` D1 table
- If mismatch → 401 Unauthorized
- This is the **only** key that the VPS needs to authenticate with Cloudflare

**How to recreate:**
```bash
# 1. Generate new key
openssl rand -hex 32
# Output: 4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5

# 2. Update D1 (from any machine with wrangler)
npx wrangler d1 execute prop-farm-navigator-db --remote \
  --command "UPDATE hermes_auth SET value='NEW_KEY' WHERE key='shared_secret'"

# 3. Update .env on VPS
sed -i "s/GIZZYFX_API_KEY=.*/GIZZYFX_API_KEY=NEW_KEY/" /home/ubuntu/.hermes/.env

# 4. Restart scripts (they read .env on startup)
pkill -f process_reviews
```

---

### 3. Cloudflare Auth Secrets (AUTH_EMAIL, AUTH_PASSWORD, AUTH_SECRET)

**Purpose:** Protects the site with a login page
**Used by:** `server.ts` auth gate
**Stored as:** Cloudflare secrets

**How it was created:**
1. `AUTH_EMAIL` — your Gmail address (gizzyfxclawaiagent@gmail.com)
2. `AUTH_PASSWORD` — a secure password you chose
3. `AUTH_SECRET` — generated via `openssl rand -hex 16` (32-char hex)
4. All three set via `npx wrangler secret put`

**What it does:**
- When you visit gizzyfxstrategy.dpdns.org, you're redirected to `/login`
- You enter email + password
- Server verifies against `AUTH_EMAIL` + `AUTH_PASSWORD` secrets
- On success, creates a session cookie signed with `AUTH_SECRET` (HMAC-SHA256)
- Cookie is sent on subsequent requests — no need to log in again
- Session persists until you close the browser

**How to recreate:**
```bash
npx wrangler secret put AUTH_EMAIL
# Enter: your@email.com

npx wrangler secret put AUTH_PASSWORD
# Enter: your_secure_password

npx wrangler secret put AUTH_SECRET
# Enter: generate with openssl rand -hex 16
```

---

### 4. TVREMIX_API_KEY (TradingView Data)

**Purpose:** Fetches real-time OHLCV, indicators, SMC structure from TradingView
**Used by:** `smc-analyze.ts`, `ohlcv.ts`, `smc.ts`
**Stored as:** Cloudflare secret

**How it was created:**
1. Subscribed to tvremix (the TradingView data service)
2. Got a bearer token from the dashboard
3. Set via `npx wrangler secret put TVREMIX_API_KEY`

**What it does:**
- Fetches real-time OHLCV bars for EURUSD, USDJPY, GBPUSD
- Fetches technical indicators (RSI, MACD, EMA, Bollinger Bands)
- Fetches SMC structure (swing highs/lows, order blocks, FVGs)
- Powers the SMC Analysis page data
- Powers the live charts on the Hermes page

**How to recreate:**
```bash
# 1. Go to tvremix.com → Dashboard → API Keys
# 2. Copy bearer token
npx wrangler secret put TVREMIX_API_KEY
```

---

### 5. FINNHUB_API_KEY (Economic Calendar)

**Purpose:** Fetches economic events (NFP, CPI, FOMC, etc.)
**Used by:** `fetch-events.ts`, scheduled cron
**Stored as:** Cloudflare secret

**How it was created:**
1. Registered at https://finnhub.io (free tier: 60 calls/min)
2. Got API key from dashboard
3. Set via `npx wrangler secret put FINNHUB_API_KEY`

**What it does:**
- Fetches upcoming economic events (GDP, CPI, FOMC, NFP, etc.)
- Events stored in D1, displayed on the Calendar page
- Used by the trading agent to avoid trading during high-impact news
- Cron job runs every 15 minutes to refresh events

**How to recreate:**
```bash
# 1. Go to https://finnhub.io → Dashboard
# 2. Copy API key
npx wrangler secret put FINNHUB_API_KEY
```

---

### 6. HONCHO_API_KEY (Agent Memory)

**Purpose:** Powers the Honcho agent memory system
**Used by:** `honcho_profile`, `honcho_search`, `honcho_reasoning` tools
**Stored in:** `/home/ubuntu/.hermes/.env`

**How it was created:**
1. Signed up at https://honcho.ai (or the Honcho service)
2. Created an API key from the dashboard
3. Added to `/home/ubuntu/.hermes/.env` as `HONCHO_API_KEY=...`

**What it does:**
- Stores persistent memory about the user (preferences, corrections, patterns)
- Powers the `honcho_profile` tool (read/write peer card)
- Powers the `honcho_search` tool (search past conversations)
- Powers the `honcho_reasoning` tool (synthesized answers about the user)
- Memory persists across sessions — Hermes remembers what you taught it

**How to recreate:**
```bash
# 1. Go to honcho.ai → Account → API Keys
# 2. Create new key
echo "HONCHO_API_KEY=hch-v3-..." >> /home/ubuntu/.hermes/.env
```

---

### Summary Table

| Key | Service | Location | Created By |
|-----|---------|----------|------------|
| `NOUS_API_KEY` | inference-api.nousresearch.com | Cloudflare secret + auth.json | Nous dashboard |
| `GIZZYFX_API_KEY` | Cloudflare Worker auth | D1 `hermes_auth` + .env | `openssl rand -hex 32` |
| `AUTH_EMAIL` | Site login | Cloudflare secret | Your email |
| `AUTH_PASSWORD` | Site login | Cloudflare secret | Your password |
| `AUTH_SECRET` | Session signing | Cloudflare secret | `openssl rand -hex 16` |
| `TVREMIX_API_KEY` | tvremix.com | Cloudflare secret | TV dashboard |
| `FINNHUB_API_KEY` | finnhub.io | Cloudflare secret | FH dashboard |
| `HONCHO_API_KEY` | honcho.ai | .env local only | Honcho dashboard |

---

## Common Fixes

### "Connection error: LLM API error: 401"

**Cause:** `NOUS_API_KEY` is missing or invalid in Cloudflare secrets.

**Fix:**
```bash
# Check if secret exists
npx wrangler secret list | grep NOUS_API_KEY

# If missing or wrong, re-set it
npx wrangler secret put NOUS_API_KEY
# Paste your Nous API key

# Verify by calling the API
curl -s "https://gizzyfxstrategy.dpdns.org/api/hermes/smc-upgrade-chat" \
  -X POST -H "Content-Type: application/json" \
  -d '{"current_config":{"atr_period":14},"message":"start"}'
```

### "Page Error: Cannot read properties of undefined (reading 'toFixed')"

**Cause:** API returned undefined values that the UI tried to format.

**Fix:** Already patched with `safeNum()` / `fmt()` helpers. If it recurs:
1. Hard refresh (Ctrl+Shift+R)
2. Check browser console for the exact line
3. Add optional chaining (`?.`) to the offending access path

### "Hermes Analyzing..." stuck forever

**Cause:** `smc-processor.sh` timed out (180s) before completing.

**Fix:**
```bash
# Kill stale processes
pkill -f "process_reviews\|tradingview"
rm -f /tmp/smc-processor.lock

# Reset D1 status
curl -s "https://gizzyfxstrategy.dpdns.org/api/hermes/smc-status" \
  -X PATCH -H "Content-Type: application/json" \
  -d '{"is_processing":"false"}'

# Delete stuck review
curl -s "https://gizzyfxstrategy.dpdns.org/api/hermes/analyze-with-hermes?id=REVIEW_ID" \
  -X DELETE
```

### "SmcStrategyConfig is not defined"

**Cause:** Missing import or default export in the component file.

**Fix:**
```bash
# Verify the import exists in smc.tsx
grep "import SmcStrategyConfig" src/routes/smc.tsx

# Verify the export exists in the component
grep "export default SmcStrategyConfig" src/components/terminal/SmcStrategyConfig.tsx
```

### Price showing as `1.16` instead of `1.16077`

**Cause:** LightweightCharts auto-formats tight price ranges to ~2 decimals.

**Fix:** Already patched with `priceFormat` on `rightPriceScale` and
`candlestickSeries` in `lwchart.tsx`. If it recurs:
1. Hard refresh
2. Check that `pairSpec(pair).pipSize` returns the correct value
3. Verify `priceFormat: { type: "price", precision: 5, minMove: 0.00001 }` is set

### SMC Analysis not real-time

**Cause:** UI was estimating phase from elapsed time instead of polling D1.

**Fix:** Already patched — the UI now polls `/api/hermes/smc-status` every
1 second and maps `currentStep` to phase indices. If it recurs:
1. Check that `smc-status.ts` returns `stepUpdatedAt`
2. Verify the processor is writing steps: `tail -f /home/ubuntu/.hermes/smc-processor.log`

---

## VPS Recovery (Full Steps)

See [`vps-recovery.md`](vps-recovery.md) for the complete disaster recovery
playbook. Quick version:

```bash
# 1. New Ubuntu VPS
sudo apt update && sudo apt install -y python3 python3-venv python3-pip nodejs npm git curl build-essential
curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH"

# 2. Clone repos
git clone https://github.com/gizzyfxclaw/prop-farm-navigator.git
git clone https://github.com/gizzyfxclaw/gizzyfx-skills.git

# 3. Recreate secrets
mkdir -p /home/ubuntu/.hermes
cat > /home/ubuntu/.hermes/auth.json << 'EOF'
{
  "providers": {
    "nous": {
      "access_token": "<YOUR_NOUS_API_KEY>"
    }
  }
}
EOF

cat > /home/ubuntu/.hermes/.env << 'EOF'
GIZZYFX_BASE_URL=https://gizzyfxstrategy.dpdns.org
GIZZYFX_API_KEY=<YOUR_HERMES_KEY>
EOF

# 4. Python venv
python3 -m venv /home/ubuntu/.hermes/hermes-agent/venv
source /home/ubuntu/.hermes/hermes-agent/venv/bin/activate
pip install requests playwright Pillow
playwright install chromium

# 5. Cron
cp prop-farm-navigator/scripts/smc-processor.sh /home/ubuntu/bin/
chmod +x /home/ubuntu/bin/smc-processor.sh
crontab -e
# Add: */5 * * * * /home/ubuntu/bin/smc-processor.sh >> /home/ubuntu/.hermes/smc-processor.log 2>&1

# 6. GitHub SSH
ssh-keygen -t ed25519 -C "gizzyfxclaw"
cat ~/.ssh/id_ed25519.pub  # Add to GitHub → Settings → SSH Keys
```

---

## File Locations Reference

| File | Location | Purpose |
|------|----------|---------|
| `smc-processor.sh` | `/home/ubuntu/bin/` | Cron wrapper for review processing |
| `process_reviews.py` | `prop-farm-navigator/scripts/` | Main review processor |
| `tradingview_analyzer.py` | `prop-farm-navigator/scripts/` | TV screenshot + annotation |
| `auth.json` | `/home/ubuntu/.hermes/` | Nous API key |
| `.env` | `/home/ubuntu/.hermes/` | GIZZYFX_API_KEY + other env vars |
| `hermes-agent/venv` | `/home/ubuntu/.hermes/` | Python virtual environment |
| `smc-processor.log` | `/home/ubuntu/.hermes/` | Processor log output |
| `wrangler.toml` | `prop-farm-navigator/` | Cloudflare Worker config |
| `hermes_auth` table | D1 | Shared secret for /api/hermes/* |
| `hermes_smc_reviews` table | D1 | SMC analysis reviews + chat |
| `hermes_processor_status` table | D1 | Live processor step tracking |
| `smc_strategy_config` table | D1 | SMC parameter overrides |

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/hermes/analyze-with-hermes` | POST | Submit analysis request |
| `/api/hermes/analyze-with-hermes` | GET | Poll for reviews |
| `/api/hermes/analyze-with-hermes` | PATCH | Post feedback (Hermes) |
| `/api/hermes/analyze-with-hermes` | DELETE | Delete review(s) |
| `/api/hermes/smc-chat` | POST | Chat about a review |
| `/api/hermes/smc-chat` | GET | Get chat history |
| `/api/hermes/smc-upgrade-chat` | POST | Strategy upgrade discussion |
| `/api/hermes/smc-upgrade-config` | POST | Get upgrade suggestions |
| `/api/hermes/smc-status` | GET | Live processor status |
| `/api/hermes/smc-status` | PATCH | Update processor status |
| `/api/smc-strategy-config` | GET | Read SMC config |
| `/api/smc-strategy-config` | PATCH | Update SMC config |
| `/api/smc-strategy-config` | DELETE | Reset to defaults |
| `/api/smc-analyze` | GET | Run SMC analysis on demand |

---

## Monitoring

```bash
# Watch processor logs in real-time
tail -f /home/ubuntu/.hermes/smc-processor.log

# Check if processor is running
ps aux | grep -E "process_reviews|tradingview"

# Check crontab
crontab -l

# Check D1 status
curl -s "https://gizzyfxstrategy.dpdns.org/api/hermes/smc-status" | python3 -m json.tool

# Check Cloudflare Worker logs
npx wrangler tail
```

---

## Security Notes

- **Never commit `auth.json` or `.env`** — they contain live secrets
- **Never commit `secrets/` directory** — add to `.gitignore`
- **Rotate keys annually** or if compromised
- **Use `wrangler secret put`** — never hardcode secrets in code
- **The `hermes_auth` table** is the source of truth for the shared secret
- **All Cloudflare secrets** are encrypted at rest and never logged
