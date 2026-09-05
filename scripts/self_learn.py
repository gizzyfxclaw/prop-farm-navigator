#!/usr/bin/env python3
"""
GizzyFx Self-Learning Engine
Runs every 30 minutes. Reads recent fulfilled reviews, compares Hermes's
prediction to actual market outcome, and saves conclusions to the knowledge base.

This is how Hermes learns from its own analysis.
"""

import os, sys, json, time, requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("GIZZYFX_BASE_URL", "https://gizzyfxstrategy.dpdns.org")
API_KEY = os.environ.get("GIZZYFX_API_KEY", "")

def log(msg):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)

def get_recent_fulfilled(hours=2):
    """Get fulfilled reviews from the last N hours."""
    try:
        r = requests.get(f"{BASE_URL}/api/hermes/analyze-with-hermes?status=fulfilled", timeout=10)
        if r.ok:
            reviews = r.json().get("reviews", [])
            cutoff = (datetime.now(timezone.utc).timestamp() - hours * 3600)
            return [
                rv for rv in reviews
                if datetime.fromisoformat(rv.get("fulfilled_at", "2020-01-01T00:00:00Z").replace("Z", "+00:00")).timestamp() > cutoff
            ]
    except Exception as e:
        log(f"Error fetching reviews: {e}")
    return []

def get_current_price(pair):
    """Get current price from the SMC analysis endpoint."""
    try:
        r = requests.get(f"{BASE_URL}/api/smc-analyze?pair={pair}&interval=1h&limit=50", timeout=10)
        if r.ok:
            return r.json().get("lastPrice", 0)
    except Exception:
        pass
    return 0

def evaluate_prediction(review, current_price):
    """Compare Hermes's prediction to current market."""
    if not review.get("entry") or not review.get("direction"):
        return None

    try:
        entry = float(review["entry"])
        sl = float(review.get("stopLoss", 0))
        tp = float(review.get("takeProfit1", 0))
        direction = review["direction"]
    except (ValueError, TypeError):
        return None

    if current_price == 0:
        return None

    sl_pips = abs(entry - sl) * 10000
    if direction == "long":
        pips_moved = (current_price - entry) * 10000
    else:
        pips_moved = (entry - current_price) * 10000

    if pips_moved >= sl_pips * 1.5:
        outcome = "WIN"
    elif pips_moved <= -sl_pips:
        outcome = "LOSS"
    else:
        outcome = "PENDING"

    return {
        "pair": review["pair"],
        "timeframe": review.get("timeframe", "?"),
        "direction": direction,
        "entry": entry,
        "current_price": current_price,
        "pips_moved": round(pips_moved, 1),
        "sl_pips": round(sl_pips, 1),
        "outcome": outcome,
        "verdict": review.get("verdict"),
        "grade": review.get("accuracy_grade"),
    }

def save_learning(evaluations):
    """Save conclusions to the knowledge base."""
    wins = sum(1 for e in evaluations if e["outcome"] == "WIN")
    losses = sum(1 for e in evaluations if e["outcome"] == "LOSS")
    total = len(evaluations)

    if total == 0:
        return

    win_rate = (wins / total * 100) if total > 0 else 0

    # Build learning content
    lines = [
        f"# Self-Learning Update {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"",
        f"## Performance Summary",
        f"- Total setups evaluated: {total}",
        f"- Wins: {wins} | Losses: {losses} | Pending: {total - wins - losses}",
        f"- Win rate: {win_rate:.0f}%",
        f"",
        f"## Detailed Outcomes",
    ]

    for e in evaluations:
        lines.append(f"- {e['pair']} {e['timeframe']} {e['direction'].upper()}: {e['outcome']} ({e['pips_moved']:+} pips, SL={e['sl_pips']}pips) — was graded {e['grade']}")

    lines.extend([
        f"",
        f"## Conclusions",
    ])

    if win_rate >= 60:
        lines.append(f"- Current strategy performing well ({win_rate:.0f}% win rate). Continue with current rules.")
    elif win_rate >= 40:
        lines.append(f"- Strategy performing moderately ({win_rate:.0f}% win rate). Consider tightening entry criteria.")
    else:
        lines.append(f"- Strategy underperforming ({win_rate:.0f}% win rate). Review entry timing and SL placement.")

    # Add specific patterns
    high_grade_wins = sum(1 for e in evaluations if e["outcome"] == "WIN" and e["grade"] == "HIGH")
    high_grade_total = sum(1 for e in evaluations if e["grade"] == "HIGH")
    if high_grade_total > 0:
        hr = high_grade_wins / high_grade_total * 100
        lines.append(f"- HIGH grade setups win rate: {hr:.0f}% ({high_grade_wins}/{high_grade_total})")

    content = "\n".join(lines)

    # POST to knowledge base
    try:
        r = requests.post(
            f"{BASE_URL}/api/hermes/knowledge",
            json={
                "title": f"Self-Learning {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
                "content": content,
                "source": "self-learning-engine",
            },
            headers={"X-Hermes-Key": API_KEY, "Content-Type": "application/json"},
            timeout=15
        )
        if r.ok:
            log(f"  Saved learning to knowledge base ({len(content)} chars)")
        else:
            log(f"  Knowledge POST failed: {r.status_code}")
    except Exception as e:
        log(f"  Knowledge save error: {e}")

def main():
    if not API_KEY:
        log("ERROR: GIZZYFX_API_KEY not set")
        sys.exit(1)

    log("Starting self-learning evaluation...")

    # Get recent reviews
    reviews = get_recent_fulfilled(hours=2)
    if not reviews:
        log("No recent fulfilled reviews to evaluate.")
        return

    log(f"Evaluating {len(reviews)} recent reviews...")

    evaluations = []
    for rv in reviews:
        pair = rv.get("pair", "")
        if not pair:
            continue

        current_price = get_current_price(pair)
        if current_price == 0:
            continue

        ev = evaluate_prediction(rv, current_price)
        if ev:
            evaluations.append(ev)
            log(f"  {pair}: {ev['outcome']} ({ev['pips_moved']:+} pips)")

    if evaluations:
        save_learning(evaluations)
    else:
        log("No evaluations possible (missing price data).")

    log("Done.")

if __name__ == "__main__":
    main()
