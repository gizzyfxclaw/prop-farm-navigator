"""Pure deterministic backtest math, shared by the gizzyfx MCP server.

No I/O here — indicators, signal generation, and trade simulation only.
Kept dependency-free (stdlib only) so it's trivial to import from
gizzyfx_mcp.py without adding new requirements.
"""
import statistics as stats

PIP_SIZE = {"EURUSD": 0.0001, "GBPUSD": 0.0001, "USDJPY": 0.01}
TV_SYMBOL = {"EURUSD": "FX:EURUSD", "GBPUSD": "FX:GBPUSD", "USDJPY": "FX:USDJPY"}


def sma(values, period):
    out = [None] * len(values)
    for i in range(period - 1, len(values)):
        out[i] = sum(values[i - period + 1 : i + 1]) / period
    return out


def ema(values, period):
    out = [None] * len(values)
    seed_i = period - 1
    if seed_i >= len(values):
        return out
    k = 2 / (period + 1)
    prev = sum(values[:period]) / period
    out[seed_i] = prev
    for i in range(seed_i + 1, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(values, period):
    out = [None] * len(values)
    if len(values) <= period:
        return out
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = values[i] - values[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    avg_gain, avg_loss = gains / period, losses / period
    out[period] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(period + 1, len(values)):
        d = values[i] - values[i - 1]
        g, l = max(d, 0), max(-d, 0)
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period
        out[i] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    return out


def atr(highs, lows, closes, period):
    n = len(closes)
    tr = [None] * n
    for i in range(1, n):
        tr[i] = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
    out = [None] * n
    if n <= period:
        return out
    prev = sum(tr[1 : period + 1]) / period
    out[period] = prev
    for i in range(period + 1, n):
        prev = (prev * (period - 1) + tr[i]) / period
        out[i] = prev
    return out


def signals(entry_type, params, direction, h, l, c):
    """Signal fires on a CLOSED bar i; simulate() enters at the open of bar i+1."""
    n = len(c)
    sig = {}
    if entry_type in ("sma_cross", "ema_cross"):
        fn = sma if entry_type == "sma_cross" else ema
        fast, slow = fn(c, int(params["fast"])), fn(c, int(params["slow"]))
        for i in range(1, n):
            if None in (fast[i], slow[i], fast[i - 1], slow[i - 1]):
                continue
            if fast[i - 1] <= slow[i - 1] and fast[i] > slow[i] and direction != "short":
                sig[i] = "long"
            elif fast[i - 1] >= slow[i - 1] and fast[i] < slow[i] and direction != "long":
                sig[i] = "short"
    elif entry_type == "rsi":
        r = rsi(c, int(params["period"]))
        oversold, overbought = params["oversold"], params["overbought"]
        for i in range(1, n):
            if r[i] is None or r[i - 1] is None:
                continue
            if r[i - 1] < oversold <= r[i] and direction != "short":
                sig[i] = "long"
            elif r[i - 1] > overbought >= r[i] and direction != "long":
                sig[i] = "short"
    elif entry_type == "breakout":
        lookback = int(params["lookback"])
        for i in range(lookback, n):
            window_h = max(h[i - lookback : i])
            window_l = min(l[i - lookback : i])
            if c[i] > window_h and direction != "short":
                sig[i] = "long"
            elif c[i] < window_l and direction != "long":
                sig[i] = "short"
    return sig


def simulate(rule, o, h, l, c, pip_size):
    """rule: dict with entry_type, entry_params (dict or JSON str), direction,
    sl_type, sl_value, tp_type, tp_value. Returns trade stats."""
    import json as _json

    n = len(c)
    entry_params = rule["entry_params"]
    if isinstance(entry_params, str):
        entry_params = _json.loads(entry_params)
    sig = signals(rule["entry_type"], entry_params, rule["direction"], h, l, c)
    atr14 = atr(h, l, c, 14) if rule["sl_type"] == "atr" else None

    trades = []
    equity = peak = 100.0
    max_dd = 0.0
    open_pos = None

    for i in range(n):
        if open_pos:
            side = open_pos["side"]
            hit_sl = (l[i] <= open_pos["sl"]) if side == "long" else (h[i] >= open_pos["sl"])
            hit_tp = (h[i] >= open_pos["tp"]) if side == "long" else (l[i] <= open_pos["tp"])
            if hit_sl or hit_tp:
                won = hit_tp and not hit_sl  # both hit same bar -> SL assumed (conservative)
                risk = abs(open_pos["entry"] - open_pos["sl"])
                exit_price = open_pos["tp"] if won else open_pos["sl"]
                raw = (exit_price - open_pos["entry"]) if side == "long" else (open_pos["entry"] - exit_price)
                r_mult = raw / risk if risk > 0 else 0.0
                equity *= 1 + 0.01 * r_mult
                peak = max(peak, equity)
                max_dd = max(max_dd, (peak - equity) / peak * 100)
                trades.append({"win": won, "r": r_mult})
                open_pos = None

        if not open_pos and i > 0 and (i - 1) in sig:
            side = sig[i - 1]
            entry = o[i]
            if rule["sl_type"] == "atr":
                a = atr14[i - 1] if atr14 else None
                if not a:
                    continue
                risk_dist = float(rule["sl_value"]) * a
            else:
                risk_dist = float(rule["sl_value"]) * pip_size
            if risk_dist <= 0:
                continue
            sl = entry - risk_dist if side == "long" else entry + risk_dist
            tp_dist = (
                risk_dist * float(rule["tp_value"])
                if rule["tp_type"] == "rr_multiple"
                else float(rule["tp_value"]) * pip_size
            )
            tp = entry + tp_dist if side == "long" else entry - tp_dist
            open_pos = {"side": side, "entry": entry, "sl": sl, "tp": tp}

    wins = sum(1 for t in trades if t["win"])
    losses = len(trades) - wins
    avg_rr = stats.mean([t["r"] for t in trades]) if trades else 0.0
    return {
        "trades_analyzed": len(trades),
        "wins": wins,
        "losses": losses,
        "max_drawdown_pct": round(max_dd, 2),
        "avg_rr": round(avg_rr, 2),
    }


def period_description(pair, timeframe, n, first_iso, last_iso):
    if not first_iso:
        return f"{timeframe}, {n} bars"
    return f"{timeframe}, {n} bars, {first_iso} to {last_iso} (real TradingView history via tvremix)"
