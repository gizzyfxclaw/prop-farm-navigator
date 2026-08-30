# GizzyFx ↔ Hermes setup (new VPS checklist)

How the Hermes Trading Agent is wired to this app, and everything needed to
stand it up again on a fresh VPS. This file lives in `hermes-webui/hermes/`
so it gets synced to `/opt/hermes-webui/hermes/SETUP.md` automatically —
you can always read it straight off the VPS.

## How it fits together

```
prop-farm-navigator (this repo)
 ├─ Cloudflare Worker + D1 (deployed by GitHub Actions on push)
 │    "gizzyfxstrategy.dpdns.org" — the app, the trading terminal, the
 │    /api/hermes/* endpoints Hermes talks to (auth: x-hermes-key shared
 │    secret, stored in the D1 `hermes_auth` table, NOT an env var)
 │
 └─ hermes-webui/  (the actual Hermes chat app + the gizzyfx MCP integration)
      auto-synced to /opt/hermes-webui on the VPS every 5 minutes by
      hermes-webui-sync, whenever a push to `main` touches this folder
```

Two independent systems, two independent deploy paths. A push doesn't
reach the VPS unless it lands on `main` — pushing a feature branch only
redeploys the Cloudflare Worker.

## What's automatic vs. what's a one-time manual step per VPS

| Step | Automatic? |
|---|---|
| Cloudflare Worker (the app, `/api/*`, D1) redeploying on push | ✅ GitHub Actions (`.github/workflows/deploy.yml`) |
| `hermes-webui/*` (incl. `hermes/gizzyfx_mcp.py`, `hermes/prefill.sh`) landing on the VPS | ✅ `hermes-webui-sync` timer, once installed |
| The gizzyfx MCP server block in `~/.hermes/config.yaml` | ❌ manual, once per VPS (`setup.sh`) |
| The `.env` additions in `/opt/hermes-webui/.env` | ❌ manual, once per VPS |
| Restarting `hermes-webui.service` after a code change | ✅ done by the sync's deploy.sh, but only when it detected a change — restart manually after running `setup.sh` or editing `.env` yourself |
| Console iframe-embedding patch (`api/helpers.py`) surviving a sync | ✅ `deploy.sh` reapplies it after every sync — but only once you've run it manually the first time (step 6) |

## Fresh VPS, step by step

### 1. Cloudflare side (only needed once per Cloudflare account, not per VPS)
Confirm these exist as GitHub Actions repo secrets (Settings → Secrets →
Actions): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AUTH_EMAIL`,
`AUTH_PASSWORD`, `AUTH_SECRET`, `TVREMIX_API_KEY` (same value as
`TVREMIX_API_KEY` in `~/.hermes/.env` on the VPS — lets the site's own
`/api/ohlcv` show the same real tvremix/TradingView data Hermes analyzes,
instead of a separate Yahoo Finance feed; omitting it just falls back to
Yahoo, it doesn't break the deploy). If they're already set, a push to
`main` (or any branch listed in `deploy.yml`) deploys the Worker — nothing
else to do.

### 2. Find the shared secret Hermes needs
Every `/api/hermes/*` call authenticates with `x-hermes-key` checked against
the D1 table `hermes_auth` (not an env var, so it can be rotated without a
redeploy):
```sql
SELECT value FROM hermes_auth WHERE key = 'shared_secret';
```
Run that against the `prop-farm-navigator-db` D1 database (Cloudflare
dashboard → Workers & Pages → D1, or `wrangler d1 execute`). Keep it out of
git — it only ever belongs in `~/.hermes/config.yaml` on the VPS.

### 3. Install `hermes-webui-sync` on the new VPS
This is what keeps `/opt/hermes-webui` (a pre-existing hermes-webui install —
setting *that* up is outside this doc's scope) up to date with this repo's
`hermes-webui/` folder. The real, working script and systemd units are
checked into this repo at [`ops/hermes-webui-sync/`](../../ops/hermes-webui-sync/)
— copy them straight across:
```bash
mkdir -p ~/hermes-webui-sync
cp <this repo>/ops/hermes-webui-sync/deploy.sh ~/hermes-webui-sync/deploy.sh
chmod +x ~/hermes-webui-sync/deploy.sh
echo "<a GitHub PAT with read access to this repo>" > ~/hermes-webui-sync/token
chmod 600 ~/hermes-webui-sync/token

mkdir -p ~/.config/systemd/user
cp <this repo>/ops/hermes-webui-sync/hermes-webui-sync.service ~/.config/systemd/user/
cp <this repo>/ops/hermes-webui-sync/hermes-webui-sync.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now hermes-webui-sync.timer
systemctl --user start hermes-webui-sync.service   # run it once immediately
```
`deploy.sh` does a sparse `git clone --filter=blob:none --sparse` of just
`hermes-webui/`, diffs `OLD_SHA..NEW_SHA` for that path, and if changed,
checks it out and `rsync -a --exclude='VENDORED.md'`s it into
`/opt/hermes-webui/`, then reapplies the console iframe-embedding patch
(step 6 below) — which also restarts `hermes-webui.service`.

> **Gotcha:** the iframe-embedding patch (step 6) lives only in the live
> `/opt/hermes-webui/api/helpers.py` file, not in git — every rsync from a
> pristine upstream `hermes-webui/api/` overwrites it back to
> `frame-ancestors 'none'`, silently breaking the embedded console in the
> GizzyFx app's Console tab. `deploy.sh` now reapplies the patch after every
> sync automatically (fixed 2026-08-29) so this shouldn't recur — but if the
> console ever "was working, now isn't" right after a deploy, this is the
> first thing to check: re-run step 6 below.

### 4. Wire the MCP server
Once the sync has run at least once (`ls /opt/hermes-webui/hermes/` should
show `gizzyfx_mcp.py`, `gizzyfx_backtest_engine.py`, `prefill.sh`, `SETUP.md`):
```bash
bash /opt/hermes-webui/hermes/setup.sh
```
Paste in the shared secret from step 2 when asked. This creates a venv at
`/opt/hermes-webui/hermes/venv` (isolated from the main hermes-agent venv)
and writes the `mcp_servers.gizzyfx` block into `~/.hermes/config.yaml`.

### 5. `.env` additions
Add to `/opt/hermes-webui/.env` (alongside whatever's already there):
```
HERMES_WEBUI_BOT_NAME=Trading Agent
HERMES_WEBUI_PREFILL_MESSAGES_SCRIPT=/opt/hermes-webui/hermes/prefill.sh
HERMES_WEBUI_CSP_CONNECT_EXTRA=https://gizzyfxstrategy.dpdns.org
```

### 6. Allow the embedded console to load
The console ships with `frame-ancestors 'none'` + `X-Frame-Options: DENY` by
design (framing it is a real clickjacking risk otherwise). To let the
GizzyFx app's Console tab embed it:
```bash
bash /opt/hermes-webui/hermes/webui-extension/allow-embedding.sh
```
This patches the live `/opt/hermes-webui/api/helpers.py` (backs it up first)
to allow exactly `https://gizzyfxstrategy.dpdns.org` and restarts the
service. `deploy.sh` reapplies this automatically after every sync (see the
gotcha in step 3) — you should only need to run it by hand the first time,
or if you ever see the Console tab show "Console refused to embed."
Revert with `... allow-embedding.sh --revert`.

### 7. Restart and verify
```bash
systemctl --user restart hermes-webui.service
```
Then either ask Hermes "check for pending trading analysis requests" in a
new session, or verify directly:
```bash
curl -s -H "x-hermes-key: <the shared secret>" \
  https://gizzyfxstrategy.dpdns.org/api/hermes/knowledge
```
This should return real JSON (`{"docs":[...]}`), **not** a 302 redirect to
`/login` and not an empty array unless the knowledge base is genuinely
empty. If you get a 302: something in `src/server.ts`'s human-login gate is
shadowing `/api/hermes/*` or `/api/ohlcv` again — those two must always stay
in the `isPublic` exemption list since they authenticate themselves
(x-hermes-key, or fully public by design) rather than via session cookie.

## Tools Hermes actually has

`gizzyfx_mcp.py` exposes (as of this doc): `get_pending_requests`,
`get_knowledge_docs`, `get_understanding`, `post_understanding`,
`get_ohlcv_data`, `get_strategy_rules`, `save_strategy_from_chat`,
`save_strategy_rule`, `request_backtest`, `run_deterministic_backtest`,
`post_analysis_step`, `render_analysis_chart`, `mark_request_fulfilled`,
`post_analysis_note`, `post_trade_setup`, `post_backtest_result`.
`render_analysis_chart` renders the candles + drawings Hermes has been
building (pure-stdlib SVG, no plotting library) and returns it as an
`ImageContent` the chat shows inline — this is what makes the "show me the
actual chart, not just a description" requirement work; the prompt in
`prefill.sh` requires calling it before every final analysis message.
Market data (`get_ohlcv_data`,
`run_deterministic_backtest`) comes from **tvremix** (TradingView data via
its own MCP server, `TVREMIX_API_KEY`), not this app's own `/api/ohlcv` —
that endpoint exists for the web UI's own chart, not for Hermes.

`prefill.sh` is the only per-session instruction injection point in this
setup (there's no separate per-profile system prompt configured) — keep it
short, and put anything strategy-specific in a knowledge doc via
`save_strategy_from_chat` instead, since that's reloaded fresh every time
via `get_knowledge_docs`/`get_understanding` rather than burning context on
every single session regardless of whether it's needed.

## Honcho memory vs. the D1 knowledge base

Two separate, complementary memory systems, both in play for trading work:

- **`knowledge_docs`/`strategy_rules`/`hermes_understanding`** (D1, via the
  `gizzyfx_*` tools) — the FORMAL, structured strategy. This is what actually
  drives backtests and is what's shown on the GizzyFx site's Trading Agent
  tab. Cross-VPS portable (lives in Cloudflare, not on any one VPS).
- **Honcho** (`honcho_profile`, `honcho_search`, `honcho_reasoning`,
  `honcho_context`, `honcho_conclude`) — the hermes-agent's own built-in
  long-term memory of the user as a peer, enabled globally via
  `memory.provider: honcho` in `~/.hermes/config.yaml` (not gizzyfx-specific,
  not shown on the GizzyFx site, and tied to this Honcho account/workspace —
  moving to a new VPS with a fresh `~/.hermes/config.yaml` but the same
  Honcho credentials carries it forward; a genuinely fresh Honcho workspace
  would not). No extra setup needed beyond what step 2/4 already do — these
  tools are globally available whenever the memory provider is Honcho, not
  gated behind a toolset.

`prefill.sh` instructs Hermes to use both together: the D1 docs for what the
strategy actually says, Honcho for standing preferences/corrections that
haven't (or won't) become a formal knowledge doc, via `honcho_conclude`.
