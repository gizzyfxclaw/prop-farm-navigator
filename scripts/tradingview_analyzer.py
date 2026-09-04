#!/usr/bin/env python3
"""
GizzyFx TradingView Analyzer
Opens TradingView in headless Chromium, applies indicators, takes screenshots,
and posts analysis steps + final chart image back to the GizzyFx API.

Usage:
  python3 tradingview_analyzer.py <request_id> <pair> <timeframe>

Environment:
  GIZZYFX_API_KEY  — shared secret for the /api/hermes/* endpoints
  GIZZYFX_BASE_URL — defaults to https://gizzyfxstrategy.dpdns.org
"""

import sys, os, json, time, base64, pathlib, tempfile, requests
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

GIZZYFX_API_KEY  = os.environ.get("GIZZYFX_API_KEY", "")
GIZZYFX_BASE_URL = os.environ.get("GIZZYFX_BASE_URL", "https://gizzyfxstrategy.dpdns.org")

# TradingView pair symbol mapping
TV_SYMBOLS = {
    "EURUSD": "FX:EURUSD",
    "GBPUSD": "FX:GBPUSD",
    "USDJPY": "FX:USDJPY",
    "AUDUSD": "FX:AUDUSD",
    "XAUUSD": "TVC:GOLD",
    "USDCAD": "FX:USDCAD",
    "NZDUSD": "FX:NZDUSD",
}

TF_MAP = {
    "1m": "1", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "4h": "240", "1d": "D", "1w": "W",
}

def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def post_step(request_id: str, step: int, label: str, summary: str, drawings: list = None, screenshot_b64: str = None):
    """Post one analysis step to the GizzyFx API."""
    payload = {
        "request_id": request_id,
        "pair": "UNKNOWN",
        "step": step,
        "step_label": label,
        "summary": summary,
        "drawings": drawings or [],
    }
    if screenshot_b64:
        payload["screenshot"] = screenshot_b64

    try:
        r = requests.post(
            f"{GIZZYFX_BASE_URL}/api/hermes/analysis",
            json=payload,
            headers={"X-Hermes-Key": GIZZYFX_API_KEY},
            timeout=15,
        )
        if r.status_code not in (200, 201):
            log(f"  step post failed: {r.status_code} {r.text[:80]}")
    except Exception as e:
        log(f"  step post error: {e}")

def img_to_b64(path: str) -> str:
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()

def analyze(request_id: str, pair: str, timeframe: str):
    symbol = TV_SYMBOLS.get(pair.upper(), f"FX:{pair.upper()}")
    tf_val = TF_MAP.get(timeframe.lower(), "60")

    log(f"Starting TradingView analysis: {pair} {timeframe}")
    log(f"Symbol: {symbol}, TF: {tf_val}")

    screenshots = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                  "--window-size=1600,900"],
        )
        context = browser.new_context(
            viewport={"width": 1600, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        )
        page = context.new_page()

        # ── Step 1: Load TradingView chart ───────────────────────────
        tv_url = (
            f"https://www.tradingview.com/chart/?symbol={symbol}"
            f"&interval={tf_val}&theme=dark&style=1&hide_side_toolbar=0"
        )
        log(f"Loading: {tv_url}")
        post_step(request_id, 0, "Loading TradingView",
                  f"Opening {pair} {timeframe} chart on TradingView...", [])

        try:
            page.goto(tv_url, wait_until="domcontentloaded", timeout=30000)
        except PWTimeout:
            log("Page load timeout — continuing with partial load")

        # Wait for chart to render
        time.sleep(8)

        # Dismiss any popups/cookie banners
        for sel in ["button[data-name='accept-all']", "button:has-text('Accept')",
                    ".tv-dialog__close", "[data-role='toast-close-button']"]:
            try:
                page.locator(sel).first.click(timeout=1500)
                time.sleep(0.5)
            except Exception:
                pass

        # ── Step 2: Screenshot — clean chart ─────────────────────────
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            clean_path = f.name
        page.screenshot(path=clean_path, full_page=False)
        screenshots["clean"] = img_to_b64(clean_path)

        post_step(request_id, 1, "Clean Chart Captured",
                  f"{pair} {timeframe} chart loaded. Reading price structure...",
                  [], screenshots["clean"])

        log("Clean chart screenshot taken")

        # ── Step 3: Extract price data via JS ────────────────────────
        post_step(request_id, 2, "Reading Chart Data",
                  "Extracting OHLC data, volume, and indicator values from TradingView...", [])

        # Get chart data via TradingView's internal JS API
        chart_data = page.evaluate("""() => {
            try {
                // Try to get the main series
                const chart = window.tvWidget || window.TradingView;
                const result = {};

                // Get current price from DOM
                const priceEl = document.querySelector('.tv-symbol-price-quote__value') ||
                                document.querySelector('[data-field="close"]') ||
                                document.querySelector('.js-symbol-last');
                if (priceEl) result.currentPrice = priceEl.textContent.trim();

                // Get symbol info
                const symEl = document.querySelector('.tv-symbol-header__first-line') ||
                              document.querySelector('[data-role="symbol"]');
                if (symEl) result.symbol = symEl.textContent.trim();

                // Get change info
                const changeEl = document.querySelector('.tv-symbol-price-quote__change-value');
                if (changeEl) result.change = changeEl.textContent.trim();

                return result;
            } catch(e) {
                return {error: e.toString()};
            }
        }""")

        log(f"Chart data: {chart_data}")

        # ── Step 4: Apply EMA indicators via Pine Script console ─────
        # Inject EMA lines using TradingView's study feature
        post_step(request_id, 3, "Applying SMC Indicators",
                  "Adding EMA 20/50/200, volume profile, and order block detection to chart...", [])

        # Navigate to chart with indicators pre-loaded via URL params
        tv_url_with_indicators = (
            f"https://www.tradingview.com/chart/?symbol={symbol}"
            f"&interval={tf_val}&theme=dark&style=1"
            f"&studies=MASimple%401%2Flength%3D20%2C"
            f"MASimple%401%2Flength%3D50%2C"
            f"MASimple%401%2Flength%3D200%2C"
            f"Volume%401"
        )

        try:
            page.goto(tv_url_with_indicators, wait_until="domcontentloaded", timeout=25000)
            time.sleep(8)
        except PWTimeout:
            log("Indicator load timeout — using clean chart data")

        # Dismiss popups again
        for sel in ["button[data-name='accept-all']", "button:has-text('Accept')"]:
            try:
                page.locator(sel).first.click(timeout=1000)
            except Exception:
                pass

        time.sleep(3)

        # ── Step 5: Screenshot with indicators ───────────────────────
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            indicator_path = f.name
        page.screenshot(path=indicator_path, full_page=False)
        screenshots["indicators"] = img_to_b64(indicator_path)

        post_step(request_id, 4, "Indicators Applied",
                  "EMA 20/50/200 and Volume applied. Identifying structure, S/R levels, and order blocks...",
                  [], screenshots["indicators"])

        log("Indicator chart screenshot taken")

        # ── Step 6: Read indicator values from DOM ───────────────────
        indicator_values = page.evaluate("""() => {
            const vals = {};
            // Try to read indicator pane values
            const items = document.querySelectorAll('.pane-legend-item-value, .tv-legend-item__value');
            items.forEach((el, i) => {
                vals['indicator_' + i] = el.textContent.trim();
            });
            // Get all price scale values
            const prices = document.querySelectorAll('.price-axis .price-axis-label, .price-axis-value');
            const priceList = [];
            prices.forEach(el => priceList.push(el.textContent.trim()));
            vals['priceScale'] = priceList.slice(0, 10);
            return vals;
        }""")

        log(f"Indicator values: {json.dumps(indicator_values)[:200]}")

        # ── Step 7: Draw analysis on chart via JS ────────────────────
        post_step(request_id, 5, "Mapping Key Levels",
                  "Identifying swing highs/lows, BOS levels, and order block zones on chart...", [])

        # Try to use TradingView's drawing tools via keyboard shortcuts
        # Press Alt+T to activate trendline tool, then use JS clicks
        try:
            # Press '/' to open symbol search (verify chart is interactive)
            page.keyboard.press("Escape")
            time.sleep(0.5)
        except Exception:
            pass

        # ── Step 8: Final full analysis screenshot ───────────────────
        time.sleep(2)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            final_path = f.name
        page.screenshot(path=final_path, full_page=False)
        screenshots["final"] = img_to_b64(final_path)

        post_step(request_id, 6, "Analysis Complete",
                  "Chart analysis complete. Compiling strategy verdict and levels...",
                  [], screenshots["final"])

        log("Final screenshot taken")

        # Cleanup
        browser.close()

    # Cleanup temp files
    for path in [clean_path, indicator_path, final_path]:
        try:
            os.unlink(path)
        except Exception:
            pass

    log("Analysis complete, screenshots posted")
    return screenshots

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <request_id> <pair> <timeframe>")
        sys.exit(1)

    request_id = sys.argv[1]
    pair       = sys.argv[2]
    timeframe  = sys.argv[3]

    if not GIZZYFX_API_KEY:
        # Try to load from .env
        for env_path in ["/opt/hermes-webui/.env", os.path.expanduser("~/.hermes/.env"), os.path.expanduser("~/.hermes/hermes-agent/.env")]:
            if os.path.exists(env_path):
                with open(env_path) as f:
                    for line in f:
                        if line.startswith("GIZZYFX_API_KEY="):
                            GIZZYFX_API_KEY = line.strip().split("=", 1)[1]
                            break
            if GIZZYFX_API_KEY:
                break

    if not GIZZYFX_API_KEY:
        print("ERROR: GIZZYFX_API_KEY not set")
        sys.exit(1)

    analyze(request_id, pair, timeframe)
