#!/usr/bin/env python3
"""
GizzyFx SMC Review Processor — with real Hermes AI analysis.

Flow per review:
  1. PATCH /api/hermes/smc-status — mark as_processing=true
  2. Run TradingView browser → 3 screenshots
  3. Fetch Hermes knowledge base from /api/hermes/knowledge
  4. Call Hermes LLM (via configured provider) for real AI analysis
  5. PATCH review with AI feedback + screenshots
  6. POST screenshots to separate table
  7. PATCH smc-status — mark is_processing=false, record timing
"""

import os, sys, json, time, subprocess, traceback
from datetime import datetime, timezone
import requests

# ── Config ───────────────────────────────────────────────────────────────────
BASE_URL   = os.environ.get("GIZZYFX_BASE_URL", "https://gizzyfxstrategy.dpdns.org")
API_KEY    = os.environ.get("GIZZYFX_API_KEY", "")
ANALYZER   = os.path.join(os.path.dirname(__file__), "tradingview_analyzer.py")
PYTHON     = "/home/ubuntu/.hermes/hermes-agent/venv/bin/python3"
MAX_REVIEWS = 2
BROWSER_TIMEOUT = 90

def log(msg):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)

def patch_status(**kwargs):
    """Write processor status to D1 so the UI can show live state."""
    try:
        requests.patch(f"{BASE_URL}/api/hermes/smc-status", json=kwargs, timeout=8)
    except Exception:
        pass

def get_pending():
    try:
        r = requests.get(f"{BASE_URL}/api/hermes/analyze-with-hermes?status=pending", timeout=10)
        if r.ok:
            return r.json().get("reviews", [])
    except Exception as e:
        log(f"ERROR fetching pending: {e}")
    return []

def get_knowledge_base():
    """Fetch Hermes strategy knowledge docs."""
    try:
        r = requests.get(
            f"{BASE_URL}/api/hermes/knowledge",
            headers={"X-Hermes-Key": API_KEY},
            timeout=10
        )
        if r.ok:
            docs = r.json().get("docs", [])
            return "\n\n".join(
                f"=== {d.get('title', 'Doc')} ===\n{d.get('content', '')}"
                for d in docs[:5]  # max 5 docs to keep prompt small
            )
    except Exception as e:
        log(f"Knowledge fetch error: {e}")
    return ""

def get_past_verdicts():
    """Get recent fulfilled reviews for context (self-learning)."""
    try:
        r = requests.get(f"{BASE_URL}/api/hermes/analyze-with-hermes?status=fulfilled", timeout=10)
        if r.ok:
            reviews = r.json().get("reviews", [])
            # Last 3 fulfilled reviews as context
            lines = []
            for rv in reviews[:3]:
                lines.append(
                    f"Past: {rv.get('pair')} {rv.get('timeframe')} → "
                    f"verdict={rv.get('verdict')} grade={rv.get('accuracy_grade')} "
                    f"direction={rv.get('direction','?')}"
                )
            return "\n".join(lines)
    except Exception:
        pass
    return ""

def call_hermes_llm(prompt: str) -> str:
    """Call the Hermes LLM for real AI analysis using the configured auth."""
    try:
        import json as _json
        auth = _json.load(open(os.path.expanduser("~/.hermes/auth.json")))
        nous_token = auth.get("providers", {}).get("nous", {}).get("access_token", "")
        if not nous_token:
            return ""

        # Cap prompt size to avoid timeouts. IMPORTANT: this must stay large
        # enough to never truncate the "Respond EXACTLY in this format"
        # instructions at the END of the prompt — a front-anchored slice
        # that cuts those off breaks response parsing entirely, silently.
        trimmed = prompt[:6000] if len(prompt) > 6000 else prompt

        r = requests.post(
            "https://inference-api.nousresearch.com/v1/chat/completions",
            json={
                "model": "meituan/longcat-2.0:free",
                "messages": [
                    {"role": "system", "content": "You are the GizzyFx Trading Agent. Analyze forex setups using the GizzyFx Parallel Channel Breakout Strategy. Be concise and specific with price levels."},
                    {"role": "user", "content": trimmed}
                ],
                "max_tokens": 600,
                "temperature": 0.2,
            },
            headers={"Authorization": f"Bearer {nous_token}", "Content-Type": "application/json"},
            timeout=20
        )
        if r.ok:
            data = r.json()
            if "choices" in data and data["choices"]:
                return data["choices"][0].get("message", {}).get("content", "")
            elif "content" in data and data["content"]:
                return data["content"][0].get("text", "")
        else:
            log(f"  LLM error: {r.status_code}")

    except requests.Timeout:
        log("  LLM timeout — falling back")
    except Exception as e:
        log(f"  LLM error: {e}")

    return ""

def run_browser(pair: str, timeframe: str) -> dict:
    """Run TradingView headless browser."""
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
            log(f"Browser script failed: {result.stderr[-150:]}")
    except subprocess.TimeoutExpired:
        log(f"Browser timeout after {BROWSER_TIMEOUT}s")
    except Exception as e:
        log(f"Browser error: {e}")
    return {"screenshots": [], "steps": [], "elapsed": 0}

def analyze_with_hermes_ai(review: dict, browser_data: dict) -> dict:
    """Run real Hermes AI analysis using LLM + knowledge base."""
    smc = json.loads(review["smc_data"]) if isinstance(review["smc_data"], str) else review["smc_data"]
    structure = smc.get("structure", {})
    channel   = smc.get("channel", {})
    debate    = smc.get("debate", {})
    levels    = smc.get("levels", {})
    pair      = review["pair"]
    timeframe = review["timeframe"]
    user_notes = review.get("user_notes") or ""

    obs         = structure.get("orderBlocks", [])
    channel_type = channel.get("type", "none")
    retest_count = levels.get("retestCount", 0)
    confirmed_5m = levels.get("breakoutConfirmed5m", False)
    nearby_conflict = levels.get("nearbyConflict", False)
    confidence  = debate.get("confidence", 0)
    bull_conf   = debate.get("bullCase", {}).get("overallConfidence", 0)
    bear_conf   = debate.get("bearCase", {}).get("overallConfidence", 0)
    verdict_raw = debate.get("finalVerdict", "NEUTRAL")
    entry       = levels.get("entry", "")
    sl          = levels.get("stopLoss", "")
    tp1         = levels.get("takeProfit1", "")
    tp2         = levels.get("takeProfit2", "")
    rr          = levels.get("riskReward", "1:1.5")
    last_price  = smc.get("lastPrice", 0)
    mtf         = smc.get("timeframeAlignment", {})
    mtf_aligned = mtf.get("aligned", False)
    mtf_summary = ", ".join(f"{tf.upper()}={b}" for tf, b in mtf.get("biasByTf", {}).items())

    tv_price    = browser_data.get("price_info", {}).get("price", str(last_price))
    tv_emas     = browser_data.get("indicator_data", {}).get("legendValues", [])

    # Fetch knowledge base and past verdicts
    knowledge = get_knowledge_base()
    past_verdicts = get_past_verdicts()

    # Build LLM prompt
    obs_summary = "; ".join(
        f"{o.get('kind','?')} OB at {o.get('low',0):.5f}-{o.get('high',0):.5f} ({o.get('impulseMag',0):.1f}x ATR)"
        for o in obs[:3]
    )
    ema_summary = ", ".join(str(v) for v in tv_emas[:4]) if tv_emas else "not available"
    bull_pts = "; ".join(p.get("claim","") for p in debate.get("bullCase",{}).get("points",[])[:3])
    bear_pts = "; ".join(p.get("claim","") for p in debate.get("bearCase",{}).get("points",[])[:3])

    prompt = f"""Analyze {pair} {timeframe} for GizzyFx Parallel Channel Breakout Strategy.

MARKET DATA:
- Live price (TradingView): {tv_price}
- EMA values: {ema_summary}
- Channel: {channel_type} — {retest_count} retest(s) of the breakout boundary, 5M breakout {"CONFIRMED" if confirmed_5m else "not yet confirmed"}
- Boundary: {channel.get('breakoutBoundary', 0):.5f}
- Order Blocks: {obs_summary[:150] if obs_summary else 'none'}
- Conflicting level near 1:2 target: {"YES" if nearby_conflict else "no"}
- For ({bull_conf*100:.0f}%): {bull_pts[:100]}
- Against ({bear_conf*100:.0f}%): {bear_pts[:100]}
- Verdict: {verdict_raw} | Suggested: Entry={entry} SL={sl} TP1={tp1} RR={rr}
- Multi-timeframe alignment (Daily→5M): {"ALIGNED" if mtf_aligned else "CONFLICTING"} — {mtf_summary if mtf_summary else "not available"}
{f"- User's analysis: {user_notes[:200]}" if user_notes else ""}

PAST CONTEXT:
{past_verdicts if past_verdicts else "none"}

STRATEGY KNOWLEDGE (from the taught GizzyFx strategy docs — ground your analysis in this, not generic SMC theory):
{knowledge[:1500] if knowledge else "none taught yet"}

STRATEGY RULES (GizzyFx Parallel Channel Breakout):
- Requires: valid ascending/descending channel + 2 or more retests of the breakout boundary + Daily→5M timeframes aligned
- SL is always fixed 30 pips. R:R is 1:2 only when the 5M breakout is already confirmed AND there are 3+ clean retests AND no conflicting level near the target; otherwise 1:1.5.
- HIGH grade: channel valid + 2+ retests + MTF aligned + (3+ retests or 5M confirmed). STANDARD: channel valid + 2+ retests, but MTF conflicts or setup is still anticipatory. NONE: no valid channel, or fewer than 2 retests.

Give your own honest point of view. Respond EXACTLY in this format (no other text):
VERDICT: match|diverge|partial|neutral
DIRECTION: long|short|none
GRADE: HIGH|STANDARD|NONE
ENTRY: (price or none)
STOP_LOSS: (price or none)
TP1: (price or none)
TP2: (price or none)
FEEDBACK: (your analysis — 2 paragraphs, what you see, do you agree with user notes, specific levels)
STRATEGY_NOTES: (checklist ✓/✗ for each rule)"""

    log("  Calling Hermes LLM for real AI analysis...")
    ai_response = call_hermes_llm(prompt)

    if not ai_response:
        log("  LLM not available — falling back to rule-based analysis")
        return analyze_rule_based(review, browser_data)

    log(f"  LLM responded ({len(ai_response)} chars)")

    # Parse structured response
    result = {
        "verdict": "neutral", "direction": None, "accuracy_grade": "NONE",
        "entry": None, "stop_loss": None, "take_profit_1": None, "take_profit_2": None,
        "feedback": ai_response, "strategy_notes": "",
    }

    for line in ai_response.split("\n"):
        line = line.strip()
        if line.startswith("VERDICT:"):
            v = line.split(":", 1)[1].strip().lower()
            if v in ("match", "diverge", "partial", "neutral"):
                result["verdict"] = v
        elif line.startswith("DIRECTION:"):
            d = line.split(":", 1)[1].strip().lower()
            if d in ("long", "short"):
                result["direction"] = d
        elif line.startswith("GRADE:"):
            g = line.split(":", 1)[1].strip().upper()
            if g in ("HIGH", "STANDARD", "NONE"):
                result["accuracy_grade"] = g
        elif line.startswith("ENTRY:"):
            try:
                v = line.split(":", 1)[1].strip()
                if v.lower() != "none":
                    result["entry"] = float(v)
            except Exception:
                pass
        elif line.startswith("STOP_LOSS:"):
            try:
                v = line.split(":", 1)[1].strip()
                if v.lower() != "none":
                    result["stop_loss"] = float(v)
            except Exception:
                pass
        elif line.startswith("TP1:"):
            try:
                v = line.split(":", 1)[1].strip()
                if v.lower() != "none":
                    result["take_profit_1"] = float(v)
            except Exception:
                pass
        elif line.startswith("TP2:"):
            try:
                v = line.split(":", 1)[1].strip()
                if v.lower() != "none":
                    result["take_profit_2"] = float(v)
            except Exception:
                pass
        elif line.startswith("FEEDBACK:"):
            result["feedback"] = line.split(":", 1)[1].strip()
        elif line.startswith("STRATEGY_NOTES:"):
            result["strategy_notes"] = line.split(":", 1)[1].strip()

    # If feedback is just the structured fields, extract the actual text
    if len(result["feedback"]) < 100:
        # Try to extract FEEDBACK section from multi-line response
        in_feedback = False
        feedback_lines = []
        notes_lines = []
        in_notes = False
        for line in ai_response.split("\n"):
            if line.startswith("FEEDBACK:"):
                in_feedback = True
                rest = line.split(":", 1)[1].strip()
                if rest:
                    feedback_lines.append(rest)
            elif line.startswith("STRATEGY_NOTES:"):
                in_feedback = False
                in_notes = True
                rest = line.split(":", 1)[1].strip()
                if rest:
                    notes_lines.append(rest)
            elif in_feedback:
                feedback_lines.append(line)
            elif in_notes:
                notes_lines.append(line)

        if feedback_lines:
            result["feedback"] = "\n".join(feedback_lines).strip()
        if notes_lines:
            result["strategy_notes"] = "\n".join(notes_lines).strip()

    return result

def analyze_rule_based(review: dict, browser_data: dict) -> dict:
    """Fallback rule-based analysis if LLM unavailable."""
    smc = json.loads(review["smc_data"]) if isinstance(review["smc_data"], str) else review["smc_data"]
    channel   = smc.get("channel", {})
    levels    = smc.get("levels", {})
    channel_type = channel.get("type", "none")
    retest_count = levels.get("retestCount", 0)
    confirmed_5m = levels.get("breakoutConfirmed5m", False)
    nearby_conflict = levels.get("nearbyConflict", False)
    entry     = levels.get("entry", "")
    sl        = levels.get("stopLoss", "")
    tp1       = levels.get("takeProfit1", "")
    tp2       = levels.get("takeProfit2", "")
    mtf       = smc.get("timeframeAlignment", {})
    mtf_aligned = mtf.get("aligned", False)
    mtf_conflicts = mtf.get("conflictingTfs", [])

    tv_price  = browser_data.get("price_info", {}).get("price", "")
    tv_emas   = browser_data.get("indicator_data", {}).get("legendValues", [])

    score = 0
    checks = []

    if channel_type != "none" and retest_count >= 2:
        score += 40
        checks.append(f"✓ {channel_type} channel confirmed — {retest_count} retest(s)")
    elif channel_type != "none":
        checks.append(f"✗ Channel found but only {retest_count} retest(s) — needs 2+")
    else:
        checks.append("✗ No valid channel — market too choppy/ranging")

    if confirmed_5m:
        score += 20
        checks.append("✓ 5M breakout already confirmed")
    else:
        checks.append("✗ 5M breakout not yet confirmed — still anticipatory")

    if nearby_conflict:
        checks.append("✗ Conflicting order block near the 1:2 target")
    elif channel_type != "none":
        score += 15
        checks.append("✓ No conflicting level near target")

    if mtf_aligned:
        score += 25
        checks.append(f"✓ Multi-timeframe aligned ({mtf.get('agreeCount','?')}/{mtf.get('totalCount','?')} Daily→5M)")
    else:
        checks.append(f"✗ Timeframes conflict: {', '.join(t.upper() for t in mtf_conflicts) if mtf_conflicts else 'alignment unavailable'}")

    if tv_emas:
        checks.append(f"✓ TradingView EMA: {', '.join(str(v) for v in tv_emas[:3])}")
    if tv_price:
        checks.append(f"✓ Live price: {tv_price}")

    # The backend's own `levels.direction` is already the authoritative
    # channel-gated signal (neutral unless a valid channel + 2+ retests
    # exist) — no need to re-derive it here. MTF conflict is a hard gate on
    # HIGH regardless of raw score.
    direction = levels.get("direction") if levels.get("direction") in ("long", "short") else None

    if direction and score >= 65 and mtf_aligned:
        verdict = "match"
        grade   = "HIGH"
    elif direction and score >= 40:
        verdict = "partial"
        grade   = "STANDARD"
    else:
        verdict = "neutral"
        grade   = "NONE"
        direction = None

    feedback = (
        f"{review['pair']} {review['timeframe']} — Rule-based analysis (AI offline).\n\n"
        f"Channel: {channel_type} ({retest_count} retest(s)). "
        f"5M breakout: {'confirmed' if confirmed_5m else 'not yet confirmed'}. "
        f"MTF: {'aligned' if mtf_aligned else 'conflicting (' + ', '.join(mtf_conflicts) + ')' if mtf_conflicts else 'unavailable'}. "
        f"Live price: {tv_price}. "
        f"Score: {score}/100.\n\n"
        f"{'Valid setup — entry ' + str(entry) + ' SL ' + str(sl) + ' TP ' + str(tp1) if direction else levels.get('reason', 'No valid setup. Wait for a channel breakout with 2+ retests.')}"
    )

    result = {
        "verdict": verdict, "direction": direction, "accuracy_grade": grade,
        "feedback": feedback, "strategy_notes": "\n".join(checks),
    }
    if direction and entry:
        try:
            result["entry"] = float(entry)
            if sl:  result["stop_loss"] = float(sl)
            if tp1: result["take_profit_1"] = float(tp1)
            if tp2: result["take_profit_2"] = float(tp2)
        except Exception:
            pass
    return result

def post_screenshots(review_id: str, screenshots: list):
    """Post screenshots one at a time (each ~180KB)."""
    labels = ["Clean Chart", "EMA Indicators", "Final Analysis"]
    ok = 0
    for i, data in enumerate(screenshots):
        try:
            r = requests.post(
                f"{BASE_URL}/api/hermes/smc-screenshots",
                json={"review_id": review_id, "step": i, "label": labels[i] if i < len(labels) else f"Screenshot {i+1}", "data": data},
                timeout=30
            )
            if r.ok:
                ok += 1
            else:
                log(f"  Screenshot {i+1} failed: {r.status_code}")
        except Exception as e:
            log(f"  Screenshot {i+1} error: {e}")
    log(f"  Posted {ok}/{len(screenshots)} screenshots")

def patch_review(payload: dict) -> bool:
    """PATCH the review result back to D1."""
    clean = {k: v for k, v in payload.items() if k not in ("chart_screenshots",) and v is not None}
    try:
        r = requests.patch(f"{BASE_URL}/api/hermes/analyze-with-hermes", json=clean, timeout=30)
        if r.ok:
            log(f"  PATCH OK: verdict={payload.get('verdict')} grade={payload.get('accuracy_grade')}")
            return True
        else:
            log(f"  PATCH failed: {r.status_code} {r.text[:80]}")
    except Exception as e:
        log(f"  PATCH error: {e}")
    return False

def main():
    if not API_KEY:
        log("ERROR: GIZZYFX_API_KEY not set")
        sys.exit(1)

    # Calculate next cron run time
    now = datetime.now(timezone.utc)
    next_min = (now.minute // 5 + 1) * 5
    next_run = now.replace(minute=next_min % 60, second=0, microsecond=0)
    if next_min >= 60:
        import datetime as dt
        next_run = next_run + dt.timedelta(hours=1)

    patch_status(
        is_processing="false",
        last_run=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        next_run_at=next_run.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )

    pending = get_pending()
    if not pending:
        log("No pending reviews.")
        return

    log(f"Found {len(pending)} pending review(s). Processing up to {MAX_REVIEWS}.")

    for review in pending[:MAX_REVIEWS]:
        rid   = review["id"][:8]
        pair  = review["pair"]
        tf    = review.get("timeframe", "1h")

        # Update status — show user what's happening
        patch_status(
            is_processing="true",
            current_pair=f"{pair} {tf}",
            last_run=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

        log(f"Processing {rid}: {pair} {tf}")

        # Step 1: Browser
        log(f"  Opening TradingView for {pair} {tf}...")
        t0 = time.time()
        browser_data = run_browser(pair, tf)
        elapsed = round(time.time() - t0, 1)
        shots = len(browser_data.get("screenshots", []))
        log(f"  Browser done in {elapsed}s — {shots} screenshots")

        # Step 2: Hermes AI analysis
        log("  Running Hermes AI analysis...")
        payload = analyze_with_hermes_ai(review, browser_data)
        payload["request_id"] = review["id"]

        # Step 3: PATCH result
        log("  Posting to D1...")
        if patch_review(payload):
            patch_status(
                last_verdict=payload.get("verdict", ""),
                last_grade=payload.get("accuracy_grade", ""),
            )

        # Step 4: Screenshots
        shots_data = browser_data.get("screenshots", [])
        if shots_data:
            log(f"  Posting {len(shots_data)} screenshots...")
            post_screenshots(review["id"], shots_data)

    # Mark done
    patch_status(
        is_processing="false",
        current_pair="",
        last_run=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        next_run_at=next_run.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    log("Done.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"FATAL: {e}\n{traceback.format_exc()}")
        patch_status(is_processing="false", current_pair="", last_run=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
        sys.exit(0)
