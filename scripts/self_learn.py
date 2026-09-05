#!/usr/bin/env python3
"""
GizzyFx Self-Learning Engine
Runs every 30 minutes. Reads fulfilled reviews, compares Hermes's prediction
to actual market outcome, upserts a durable outcome row per review (so a
real win-rate can be computed across all history), and writes a summary to
the knowledge base.

This is how Hermes learns from its own analysis.
"""

import os, sys, json, time, requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("GIZZYFX_BASE_URL", "https://gizzyfxstrategy.dpdns.org")
API_KEY = os.environ.get("GIZZYFX_API_KEY", "")

# Mirrors src/lib/engine/pairs.ts PAIR_SPECS — pip size differs for JPY/gold.
PIP_SIZE = {
    "EURUSD": 0.0001, "GBPUSD": 0.0001, "AUDUSD": 0.0001,
    "USDJPY": 0.01, "XAUUSD": 0.01,
}

def pip_size(pair: str) -> float:
    return PIP_SIZE.get((pair or "").upper(), 0.0001)

def log(msg):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)

def get_fulfilled_reviews():
    """Get fulfilled reviews with a resolved entry/direction (most recent 50)."""
    try:
        r = requests.get(f"{BASE_URL}/api/hermes/analyze-with-hermes?status=fulfilled", timeout=10)
        if r.ok:
            return r.json().get("reviews", [])
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
        # Row fields are snake_case (stop_loss, take_profit_1) — NOT the
        # camelCase names used inside the nested smc_data.levels JSON blob.
        sl = float(review.get("stop_loss") or 0)
        tp = float(review.get("take_profit_1") or 0)
        direction = review["direction"]
    except (ValueError, TypeError):
        return None

    if current_price == 0 or sl == 0:
        return None

    psize = pip_size(review.get("pair", ""))
    sl_pips = abs(entry - sl) / psize
    if direction == "long":
        pips_moved = (current_price - entry) / psize
    else:
        pips_moved = (entry - current_price) / psize

    if pips_moved >= sl_pips * 1.5:
        outcome = "WIN"
    elif pips_moved <= -sl_pips:
        outcome = "LOSS"
    else:
        outcome = "PENDING"

    return {
        "review_id": review["id"],
        "pair": review["pair"],
        "timeframe": review.get("timeframe", "?"),
        "direction": direction,
        "entry": entry,
        "stop_loss": sl,
        "take_profit": tp if tp else None,
        "accuracy_grade": review.get("accuracy_grade"),
        "current_price": current_price,
        "pips_moved": round(pips_moved, 1),
        "sl_pips": round(sl_pips, 1),
        "outcome": outcome,
    }

def post_outcome(ev):
    """Upsert one durable outcome row, keyed on review_id."""
    try:
        r = requests.post(
            f"{BASE_URL}/api/hermes/outcomes",
            json={k: v for k, v in ev.items() if k not in ("current_price",)},
            headers={"X-Hermes-Key": API_KEY, "Content-Type": "application/json"},
            timeout=10,
        )
        if not r.ok:
            log(f"  Outcome POST failed for {ev['review_id'][:8]}: {r.status_code}")
    except Exception as e:
        log(f"  Outcome POST error: {e}")

def get_winrate_stats():
    """Read back the durable, all-time stats this run just contributed to."""
    try:
        r = requests.get(f"{BASE_URL}/api/hermes/outcomes?limit=200", timeout=10)
        if r.ok:
            return r.json().get("stats") or {}
    except Exception as e:
        log(f"Error fetching win-rate stats: {e}")
    return {}

def save_learning(evaluations, stats):
    """Save conclusions to the knowledge base, using durable all-time stats
    (not just this run's batch) so the summary reflects real performance."""
    total = stats.get("total", 0)
    if total == 0:
        return

    wins = stats.get("wins", 0)
    losses = stats.get("losses", 0)
    pending = stats.get("pending", 0)
    win_rate = stats.get("winRate")

    lines = [
        f"# Self-Learning Update {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"",
        f"## Performance Summary (all-time, last {total} evaluated)",
        f"- Wins: {wins} | Losses: {losses} | Pending: {pending}",
        f"- Win rate: {win_rate:.0f}%" if win_rate is not None else "- Win rate: not enough decided trades yet",
        f"",
        f"## This Run",
    ]

    for e in evaluations:
        lines.append(f"- {e['pair']} {e['timeframe']} {e['direction'].upper()}: {e['outcome']} ({e['pips_moved']:+} pips, SL={e['sl_pips']}pips) — graded {e['accuracy_grade']}")

    lines.extend(["", "## Conclusions"])
    if win_rate is None:
        lines.append("- Not enough decided trades yet to judge performance.")
    elif win_rate >= 60:
        lines.append(f"- Current strategy performing well ({win_rate:.0f}% win rate). Continue with current rules.")
    elif win_rate >= 40:
        lines.append(f"- Strategy performing moderately ({win_rate:.0f}% win rate). Consider tightening entry criteria.")
    else:
        lines.append(f"- Strategy underperforming ({win_rate:.0f}% win rate). Review entry timing and SL placement.")

    hr = stats.get("highGradeWinRate")
    if hr is not None:
        lines.append(f"- HIGH grade setups win rate: {hr:.0f}% ({stats.get('highGradeTotal', '?')} evaluated)")

    content = "\n".join(lines)

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

    reviews = get_fulfilled_reviews()
    if not reviews:
        log("No fulfilled reviews to evaluate.")
        return

    log(f"Evaluating {len(reviews)} fulfilled review(s)...")

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
            post_outcome(ev)
            log(f"  {pair}: {ev['outcome']} ({ev['pips_moved']:+} pips)")

    if evaluations:
        stats = get_winrate_stats()
        save_learning(evaluations, stats)
    else:
        log("No evaluations possible (missing price/SL data).")

    log("Done.")

if __name__ == "__main__":
    main()
