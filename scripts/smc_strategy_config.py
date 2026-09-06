#!/usr/bin/env python3
"""
GizzyFx SMC Strategy Configuration — stored in D1 so it persists across deploys.

The strategy parameters are the knobs that control how the SMC engine detects
structure, order blocks, FVGs, and sweeps. Users can tune these manually or
ask Hermes to suggest improvements based on current market behavior.

Parameters:
  atr_period         — ATR lookback (default 14). Higher = smoother, less sensitive.
  swing_window       — Fractal pivot window (default 3). Higher = fewer, more significant swings.
  ob_impulse_mult    — Order block impulse threshold in ATR multiples (default 1.5). Higher = only strongest OB.
  ob_max_age         — Max bars to look back for OB (default 60). Higher = more historical OB.
  fvg_max_age        — Max bars to look back for FVG (default 60).
  sweep_max_age      — Max bars to look back for liquidity sweeps (default 30).
  bos_min_bars       — Min bars before confirming BOS (default 0).
  retest_min_touches — Min touches for valid channel (default 2).
  sl_pips            — Default stop loss in pips (default 30).
  tp1_rr             — TP1 risk:reward multiple (default 1.5).
  tp2_rr             — TP2 risk:reward multiple (default 2.0).
  confluence_weights — Scoring weights for each SMC factor.
"""

import os, json, time
from datetime import datetime, timezone

BASE_URL = os.environ.get("GIZZYFX_BASE_URL", "https://gizzyfxstrategy.dpdns.org")
API_KEY = os.environ.get("GIZZYFX_API_KEY", "")

DEFAULT_CONFIG = {
    "atr_period": 14,
    "swing_window": 3,
    "ob_impulse_mult": 1.5,
    "ob_max_age": 60,
    "fvg_max_age": 60,
    "sweep_max_age": 30,
    "bos_min_bars": 0,
    "retest_min_touches": 2,
    "sl_pips": 30,
    "tp1_rr": 1.5,
    "tp2_rr": 2.0,
    "confluence_weights": {
        "ob_retest": 2.0,
        "sweep": 2.0,
        "choch": 1.5,
        "bos": 1.0,
        "bias": 1.0,
        "fvg": 0.5,
        "zone": 0.5,
    },
}

PARAM_DESCRIPTIONS = {
    "atr_period": "ATR lookback period. Higher = smoother, less sensitive to recent volatility.",
    "swing_window": "Fractal pivot detection window. Higher = fewer but more significant swing points.",
    "ob_impulse_mult": "Order block impulse threshold (ATR multiples). Higher = only the strongest order blocks.",
    "ob_max_age": "Maximum bars to look back for order blocks. Higher = more historical levels.",
    "fvg_max_age": "Maximum bars to look back for fair value gaps.",
    "sweep_max_age": "Maximum bars to look back for liquidity sweeps.",
    "bos_min_bars": "Minimum bars before confirming a break of structure.",
    "retest_min_touches": "Minimum touches of breakout boundary for a valid channel.",
    "sl_pips": "Default stop loss distance in pips.",
    "tp1_rr": "Take profit 1 risk:reward multiple.",
    "tp2_rr": "Take profit 2 risk:reward multiple.",
    "confluence_weights": "Scoring weights for each SMC confluence factor.",
}


def get_config():
    """Read current config from D1."""
    try:
        r = requests.get(f"{BASE_URL}/api/smc-strategy-config", headers={"X-Hermes-Key": API_KEY}, timeout=10)
        if r.ok:
            data = r.json()
            if data.get("config"):
                return data["config"]
    except Exception:
        pass
    return DEFAULT_CONFIG


def save_config(config):
    """Write config to D1."""
    try:
        r = requests.patch(
            f"{BASE_URL}/api/smc-strategy-config",
            headers={"X-Hermes-Key": API_KEY, "Content-Type": "application/json"},
            json=config,
            timeout=10,
        )
        return r.ok
    except Exception:
        return False


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "show":
        cfg = get_config()
        print(json.dumps(cfg, indent=2))
    elif len(sys.argv) > 1 and sys.argv[1] == "reset":
        save_config(DEFAULT_CONFIG)
        print("Reset to defaults")
    else:
        print("Usage: python3 smc_strategy_config.py [show|reset]")
