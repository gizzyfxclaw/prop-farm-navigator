#!/usr/bin/env python3
"""
GizzyFx SMC Review Processor
Runs every 5 minutes via cron. Picks up pending SMC reviews, opens TradingView
in headless Chromium, captures screenshots, runs strategy analysis, and PATCHes
the result back to D1. No LLM in the loop — deterministic.
"""

import os, sys, json, time, requests
from datetime import datetime, timezone

# ── Config ───────────────────────────────────────────────────────────────────
BASE_URL   = os.environ.get("GIZZYFX_BASE_URL", "https://gizzyfxstrategy.dpdns.org")
API_KEY    = os.environ.get("GIZZYFX_API_KEY", "")
ANALYZER   = os.path.join(os.path.dirname(__file__), "tradingview_analyzer.py")
PYTHON     = "/home/ubuntu/.hermes/hermes-agent/venv/bin/python3"
MAX_REVIEWS = 2
BROWSER_TIMEOUT = 90  # seconds for TradingView browser session

def log(msg):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)

def get_pending():
    try:
        r = requests.get(f"{BASE_URL}/api/hermes/analyze-with-hermes?status=pending", timeout=10)
        if r.ok:
            return r.json().get("reviews", [])
    except Exception as e:
        log(f"ERROR fetching pending: {e}")
    return []

def run_browser(pair: str, timeframe: str) -> dict:
    """Run TradingView headless browser and return {screenshots, steps, price_info}."""
    import subprocess
    env = {**os.environ, "GIZZYFX_API_KEY": API_KEY}
    try:
        result = subprocess.run(
            [PYTHON, ANALYZER, pair, timeframe],
            capture_output=True, text=True,
            timeout=BROWSER_TIMEOUT, env=env
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
        else:
            log(f"Browser script failed (exit {result.returncode}): {result.stderr[-200:]}")
    except subprocess.TimeoutExpired:
        log(f"Browser timeout after {BROWSER_TIMEOUT}s")
    except Exception as e:
        log(f"Browser error: {e}")
    return {"screenshots": [], "steps": [], "elapsed": 0}

def analyze_smc(review: dict, browser_data: dict) -> dict:
    """Apply GizzyFx Channel Breakout Strategy to the SMC data. Returns PATCH payload."""
    smc = json.loads(review["smc_data"]) if isinstance(review["smc_data"], str) else review["smc_data"]
    structure = smc.get("structure", {})
    debate    = smc.get("debate", {})
    levels    = smc.get("levels", {})
    last_price = smc.get("lastPrice", 0)
    pair      = review["pair"]
    timeframe = review["timeframe"]
    user_notes = review.get("user_notes") or ""

    bias      = structure.get("bias", "neutral")
    bos       = structure.get("bos")
    obs       = structure.get("orderBlocks", [])
    bull_obs  = [o for o in obs if o.get("kind") == "bullish"]
    bear_obs  = [o for o in obs if o.get("kind") == "bearish"]
    swing_h   = structure.get("lastSwingHigh", 0)
    swing_l   = structure.get("lastSwingLow", 0)
    confidence = debate.get("confidence", 0)
    verdict_raw = debate.get("finalVerdict", "NEUTRAL")
    entry     = levels.get("entry", str(last_price))
    sl        = levels.get("stopLoss", "")
    tp1       = levels.get("takeProfit1", "")
    tp2       = levels.get("takeProfit2", "")
    rr        = levels.get("riskReward", "1.0")

    # Price from TradingView browser (more reliable)
    tv_price  = browser_data.get("price_info", {}).get("price", str(last_price))
    tv_emas   = browser_data.get("indicator_data", {}).get("legendValues", [])

    # ── GizzyFx Channel Breakout checklist ─────────────────────────────────
    checks = []
    score = 0

    # 1. BOS required
    if bos:
        checks.append(f"✓ BOS confirmed — {bos} break detected")
        score += 30
    else:
        checks.append("✗ BOS — MISSING (non-negotiable requirement)")

    # 2. Directional bias
    if confidence >= 0.6 and bias != "neutral":
        checks.append(f"✓ Directional bias {bias} at {confidence*100:.0f}% confidence")
        score += 20
    else:
        checks.append(f"✗ Directional bias — too weak ({confidence*100:.0f}%, need ≥60%)")

    # 3. Order blocks
    if bias == "bullish" and bull_obs:
        nearest = bull_obs[-1]
        checks.append(f"✓ Bullish OB at {nearest['low']:.5f}-{nearest['high']:.5f} ({nearest['impulseMag']:.1f}× ATR)")
        score += 20
    elif bias == "bearish" and bear_obs:
        nearest = bear_obs[-1]
        checks.append(f"✓ Bearish OB at {nearest['low']:.5f}-{nearest['high']:.5f} ({nearest['impulseMag']:.1f}× ATR)")
        score += 20
    else:
        checks.append("✗ No aligned order blocks on breakout side")

    # 4. Entry quality
    try:
        entry_f = float(entry)
        if bias == "bullish" and bull_obs:
            ob = bull_obs[-1]
            dist = abs(entry_f - ob["high"])
            if dist < abs(swing_h - swing_l) * 0.15:
                checks.append(f"✓ Entry {entry} near OB boundary (within 15% of range)")
                score += 15
            else:
                checks.append(f"~ Entry {entry} not near OB boundary (dist {dist:.5f})")
        elif bias == "bearish" and bear_obs:
            ob = bear_obs[-1]
            dist = abs(entry_f - ob["low"])
            if dist < abs(swing_h - swing_l) * 0.15:
                checks.append(f"✓ Entry {entry} near OB boundary")
                score += 15
            else:
                checks.append(f"~ Entry {entry} not near OB boundary")
    except Exception:
        checks.append(f"~ Entry {entry} — could not validate proximity")

    # 5. EMA context from TradingView
    if tv_emas:
        checks.append(f"✓ TradingView EMA values: {', '.join(str(v) for v in tv_emas[:4])}")
    checks.append(f"✓ Live TradingView price: {tv_price}")

    # ── Verdict ────────────────────────────────────────────────────────────
    if score >= 70:
        verdict     = "match"
        grade       = "HIGH"
        direction   = "long" if bias == "bullish" else "short"
    elif score >= 40:
        verdict     = "partial"
        grade       = "STANDARD"
        direction   = "long" if bias == "bullish" else "short"
    else:
        verdict     = "neutral"
        grade       = "NONE"
        direction   = None

    # ── Feedback text ───────────────────────────────────────────────────────
    missing = [c for c in checks if c.startswith("✗")]
    passing = [c for c in checks if c.startswith("✓")]

    if grade == "NONE":
        summary = (
            f"{pair} {timeframe} — No Valid Setup (Score: {score}/100)\n\n"
            f"The GizzyFx Channel Breakout Strategy requires all key conditions to be met before entry. "
            f"This setup is missing critical requirements:\n"
            + "\n".join(f"  {c}" for c in missing) + "\n\n"
            f"Current price from TradingView: {tv_price}. "
            f"Swing High: {swing_h:.5f} | Swing Low: {swing_l:.5f}. "
            f"{'Wait for a confirmed BOS before considering any entry.' if not bos else 'Wait for directional confluence before entry.'}"
        )
        if user_notes:
            summary += f"\n\nYour analysis: \"{user_notes}\" — "
            if not bos:
                summary += "Agreed that caution is warranted, but BOS must be confirmed first."
            else:
                summary += "The key issue is directional confidence, which is currently insufficient."
    else:
        action = "LONG (BUY)" if direction == "long" else "SHORT (SELL)"
        summary = (
            f"{pair} {timeframe} — {grade} Setup ({action}, Score: {score}/100)\n\n"
            f"The GizzyFx Channel Breakout Strategy conditions are {'fully' if grade == 'HIGH' else 'partially'} met:\n"
            + "\n".join(f"  {c}" for c in passing) + "\n\n"
            f"TradingView confirms price at {tv_price}. "
            f"Entry: {entry} | Stop Loss: {sl} | TP1: {tp1} | R:R {rr}. "
            f"The setup {'has clear confluence and is actionable.' if grade == 'HIGH' else 'has partial confluence — reduce position size or wait for stronger confirmation.'}"
        )
        if user_notes:
            summary += f"\n\nYour analysis: \"{user_notes}\" — "
            if verdict == "match":
                summary += "Your read aligns well with the strategy. Good analysis."
            elif verdict == "partial":
                summary += "Your analysis is partially correct but some conditions are not fully met."
            else:
                summary += "There is some divergence from the taught strategy rules."

    strategy_notes = "\n".join(checks)

    payload = {
        "request_id": review["id"],
        "verdict": verdict,
        "feedback": summary,
        "strategy_notes": strategy_notes,
        "accuracy_grade": grade,
    }

    # Add levels only if there's a valid setup
    if direction and entry:
        try:
            payload["entry"]        = float(entry)
            payload["direction"]    = direction
            if sl:  payload["stop_loss"]    = float(sl)
            if tp1: payload["take_profit_1"] = float(tp1)
            if tp2: payload["take_profit_2"] = float(tp2)
        except Exception:
            pass

    # Add screenshots if available
    shots = browser_data.get("screenshots", [])
    if shots:
        payload["chart_screenshots"] = shots
        log(f"  Attaching {len(shots)} TradingView screenshots")

    return payload

def patch_review(payload: dict) -> bool:
    try:
        r = requests.patch(
            f"{BASE_URL}/api/hermes/analyze-with-hermes",
            json=payload,
            timeout=30
        )
        if r.ok:
            log(f"  PATCH OK: verdict={payload['verdict']} grade={payload['accuracy_grade']}")
            return True
        else:
            log(f"  PATCH failed: {r.status_code} {r.text[:100]}")
    except Exception as e:
        log(f"  PATCH error: {e}")
    return False

def main():
    if not API_KEY:
        log("ERROR: GIZZYFX_API_KEY not set")
        sys.exit(1)

    pending = get_pending()
    if not pending:
        log("No pending reviews.")
        return

    log(f"Found {len(pending)} pending review(s). Processing up to {MAX_REVIEWS}.")

    for review in pending[:MAX_REVIEWS]:
        rid   = review["id"][:8]
        pair  = review["pair"]
        tf    = review.get("timeframe", "1h")
        log(f"Processing {rid}: {pair} {tf}")

        # Step 1: Run TradingView browser analysis
        log(f"  Starting TradingView browser for {pair} {tf}...")
        t0 = time.time()
        browser_data = run_browser(pair, tf)
        elapsed = round(time.time() - t0, 1)
        shots = len(browser_data.get("screenshots", []))
        log(f"  Browser done in {elapsed}s — {shots} screenshots")

        # Step 2: Apply strategy analysis
        log("  Applying GizzyFx Channel Breakout Strategy...")
        payload = analyze_smc(review, browser_data)

        # Step 3: PATCH result back
        log("  Posting feedback to D1...")
        patch_review(payload)

    log("Done.")

if __name__ == "__main__":
    main()
