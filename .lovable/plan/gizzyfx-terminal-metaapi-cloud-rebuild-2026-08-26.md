# GizzyFx Terminal — MetaApi Cloud Rebuild

Rebuild the uploaded single-file terminal as the real app (TanStack Start + React), with the math engine rewritten exactly to the spec, live MetaApi Cloud data, saved prop accounts, and one-click Exness pending-order execution.

## 1. Terminal shell

- Port the existing dark near-black / royal-blue design system into `src/styles.css` as semantic tokens (Geist + JetBrains Mono via a `<link>` in the root route).
- Tabs: Engine, Validator, Journal, Live (MT5), Strategy — same structure and access gate as the current file.
- Everything becomes typed React components, no `document.getElementById` wiring.

## 2. Math engine (rewritten to spec, real-time)

All inputs recalculate instantly through one pure calculation module (unit-tested), so no field can drift:

- Pip values: 10 (EURUSD/GBPUSD), 9 (USDJPY); pip size 0.0001 / 0.01; SL-TP prices to 5 dp (3 dp for JPY).
- Inverted mirror: Prop TP = SL x R:R; Exness SL = Prop TP; Exness TP = Prop SL.
- Lots: prop = risk / (SL pips x pip value); Exness = win target / (TP pips x pip value); cent-account conversion shown separately.
- Losses to blow = maxDD / propRisk; wins to pass = target / reward-per-trade.
- Capital math always uses worst-case R:R = 2, as specified.
- Phase 1: totalRecovery = fee + desired profit; winTarget = totalRecovery / lossesToBlow; lossTarget = winTarget x 2; pure capital = lossTarget x winsToPass; buffered = x1.20; phase1TotalSpent = fee + buffered; phase1Leftover = buffered − (lossTarget x winsToPass).
- Phase 2: totalRecovery = phase1TotalSpent + desired profit (no second fee); same chain; phase2RefillRequired = buffered − phase1Leftover; totalRequiredCapital = phase1TotalSpent + phase2RefillRequired.
- Phase 1 -> Phase 2 carry-over is automatic (computed values are handed forward, editable if needed) so the doubling / leftover errors cannot recur.
- Final P&L: payout = propTarget x split; netProfitIfPassed = payout + leftoverExnessBalance − totalRequiredCapital.
- Verdict: trailing DD -> red "Strategy Broken"; net < $20 -> red "Not Profitable"; else green with net figure.
- A "Total Capital Needed" panel breaks out prop fee, Exness fuel, buffer, phase-2 refill and the grand total for the selected account.

## 3. Prop account manager

- New "Accounts" section: add/edit/delete prop accounts — firm name, size, fee, profit target %, DD %, DD type (static/trailing), profit split, phase, optional linked MetaApi account id.
- The Engine and Validator both get an account selector; picking an account drives every number (target USD, max DD USD, fee, split, DD type) instead of hand-typed values.
- Seeded with the existing preset ladder (50 -> 200k) as starting accounts.

## 4. MetaApi Cloud integration

- Settings panel: MetaApi token + Exness account id (and optional prop account id), entered in the UI per your choice, kept in browser storage only.
- All MetaApi traffic goes through thin server-function proxies (`metaapi.functions.ts`) that take the token per call — avoids browser CORS/SDK issues, no token is stored on the server.
- Live price: symbol dropdown + Fetch, auto-fills entry price and recalculates.
- Live account panel: Exness cent account balance, equity, margin, open positions and pending orders, plus fuel remaining vs required capital.
- Trade history: pulls closed deals to reconcile journal entries (open -> win/loss with real P&L).
- Execution: `executeExnessTrade` picks BUY_LIMIT / BUY_STOP / SELL_LIMIT / SELL_STOP from direction vs live price, submits volume, price, SL, TP; shows MT5 ticket or the exact broker error, and auto-logs the trade as OPEN.
- Guardrails before sending: verdict must be green, lots > broker minimum, SL/TP sane distance, confirm dialog with the full order summary.

## 5. Journal + analytics

- Journal keeps automatic P&L from live engine values: win -> prop +target/trade, Exness −(winTarget x R:R); loss -> prop −risk, Exness +winTarget; net = sum.
- Stats cards (trades, win rate, net P&L, profit factor), equity curve, win/loss doughnut, consistency radar, CSV export — all updating instantly.
- Storage goes through a single journal-storage adapter. Default stays browser storage now, so when you connect your Cloudflare database only that adapter is swapped — no rewrite of the journal UI.

## Technical notes

- Routes: `/` (Engine), `/validator`, `/journal`, `/live`, `/accounts`, `/settings`, each with its own head metadata.
- `src/lib/engine/` holds pure calculation + pip/price helpers with vitest coverage for every formula above, including the Phase 1 -> 2 carry-over and the worst-case R:R rule.
- `src/lib/metaapi.functions.ts` (server functions) wraps MetaApi REST: quote, account information, positions, orders, history deals, create pending order. Errors return typed `{ ok, error }` shapes surfaced in the status box.
- Charts stay hand-rolled SVG (as in your file) to keep the terminal look and avoid a chart dependency.
