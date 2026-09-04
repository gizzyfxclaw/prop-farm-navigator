#!/usr/bin/env python3
"""
GizzyFx TradingView Analyzer
Opens TradingView headless, captures screenshots, returns them as JSON to stdout.

Usage:
  python3 tradingview_analyzer.py <pair> <timeframe>

Outputs JSON to stdout:
  {"screenshots": ["data:image/png;base64,...", ...], "steps": [...], "elapsed": 33}
"""

import sys, os, json, time, base64, tempfile
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# TradingView pair symbol mapping
TV_SYMBOLS = {
    "EURUSD": "FX:EURUSD", "GBPUSD": "FX:GBPUSD", "USDJPY": "FX:USDJPY",
    "AUDUSD": "FX:AUDUSD", "XAUUSD": "TVC:GOLD",  "USDCAD": "FX:USDCAD",
    "NZDUSD": "FX:NZDUSD", "USDCHF": "FX:USDCHF",
}

TF_MAP = {
    "1m":"1", "5m":"5", "15m":"15", "30m":"30",
    "1h":"60", "4h":"240", "1d":"D", "1w":"W",
}

def log(msg: str, level: str = "INFO"):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] [{level}] {msg}", file=sys.stderr, flush=True)

def img_to_b64(path: str) -> str:
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()

def analyze(pair: str, timeframe: str) -> dict:
    symbol = TV_SYMBOLS.get(pair.upper(), f"FX:{pair.upper()}")
    tf_val = TF_MAP.get(timeframe.lower(), "60")
    
    start = time.time()
    screenshots = []
    steps = []
    tmp_files = []

    def step(label: str, detail: str):
        t = round(time.time() - start, 1)
        steps.append({"label": label, "detail": detail, "elapsed": t})
        log(f"[{t}s] {label}: {detail}")

    with sync_playwright() as p:
        step("Browser Launch", f"Starting headless Chromium for {pair} {timeframe}")
        
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                  "--window-size=1600,900", "--disable-setuid-sandbox",
                  "--disable-extensions"],
        )
        context = browser.new_context(
            viewport={"width": 1600, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        # ── Load clean chart ─────────────────────────────────────────
        step("Loading TradingView", f"Navigating to {symbol} {tf_val}min chart")
        tv_url = (f"https://www.tradingview.com/chart/?symbol={symbol}"
                  f"&interval={tf_val}&theme=dark&style=1&hide_side_toolbar=0")
        
        try:
            page.goto(tv_url, wait_until="domcontentloaded", timeout=30000)
        except PWTimeout:
            step("Partial Load", "Page timeout — chart may still be rendering")
        
        time.sleep(6)
        
        # Dismiss popups
        step("Clearing Popups", "Dismissing cookie banners and login prompts")
        for sel in ["button[data-name='accept-all']", "button:has-text('Accept all')",
                    "button:has-text('Accept')", ".tv-dialog__close",
                    "[data-role='toast-close-button']", "button[aria-label='Close']"]:
            try:
                loc = page.locator(sel).first
                if loc.is_visible(timeout=800):
                    loc.click()
                    time.sleep(0.4)
            except Exception:
                pass
        
        time.sleep(2)

        # Screenshot 1: Clean chart
        step("Capturing Clean Chart", "Taking baseline screenshot before adding indicators")
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            p1 = f.name
        tmp_files.append(p1)
        page.screenshot(path=p1, full_page=False)
        screenshots.append(img_to_b64(p1))

        # Get current price from DOM
        step("Reading Price Data", "Extracting current price and market data from chart DOM")
        price_info = page.evaluate("""() => {
            const result = {};
            // Try multiple selectors for current price
            for (const sel of [
                '.tv-symbol-price-quote__value',
                '[data-field="close"]',
                '.js-symbol-last',
                '[class*="priceWrapper"] [class*="price"]',
                '.chart-markup-table .price'
            ]) {
                const el = document.querySelector(sel);
                if (el && el.textContent.trim()) {
                    result.price = el.textContent.trim();
                    result.priceSelector = sel;
                    break;
                }
            }
            // Get change
            const changeEl = document.querySelector('.tv-symbol-price-quote__change-value, [class*="changeValue"]');
            if (changeEl) result.change = changeEl.textContent.trim();
            return result;
        }""")
        log(f"Price data: {price_info}")

        # ── Load chart with EMA indicators ───────────────────────────
        step("Applying Indicators", "Loading EMA 20/50/200 and Volume via TradingView studies URL")
        tv_indicator_url = (
            f"https://www.tradingview.com/chart/?symbol={symbol}"
            f"&interval={tf_val}&theme=dark&style=1"
            f"&studies[]=MASimple%401%2F%7B%22length%22%3A20%7D"
            f"&studies[]=MASimple%401%2F%7B%22length%22%3A50%7D"
            f"&studies[]=MASimple%401%2F%7B%22length%22%3A200%7D"
            f"&studies[]=Volume%401"
        )
        
        try:
            page.goto(tv_indicator_url, wait_until="domcontentloaded", timeout=25000)
            time.sleep(7)
        except PWTimeout:
            step("Indicator Load Partial", "Continuing with available data")
        
        # Dismiss popups again
        for sel in ["button[data-name='accept-all']", "button:has-text('Accept')"]:
            try:
                if page.locator(sel).first.is_visible(timeout=600):
                    page.locator(sel).first.click()
            except Exception:
                pass
        
        time.sleep(2)

        # Screenshot 2: With indicators
        step("Capturing Indicator Chart", "Recording EMA 20/50/200 + Volume overlay screenshot")
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            p2 = f.name
        tmp_files.append(p2)
        page.screenshot(path=p2, full_page=False)
        screenshots.append(img_to_b64(p2))

        # Read indicator legend values
        step("Reading Indicator Values", "Extracting EMA values and volume from chart legend")
        indicator_data = page.evaluate("""() => {
            const vals = {};
            // Legend values
            const legendItems = document.querySelectorAll(
                '.pane-legend-item-value, .tv-legend-item__value, [class*="legendText"], [class*="valueValue"]'
            );
            const legendList = [];
            legendItems.forEach(el => {
                const txt = el.textContent.trim();
                if (txt && txt !== '' && !txt.includes('{')) legendList.push(txt);
            });
            vals.legendValues = legendList.slice(0, 12);
            
            // Price axis values
            const priceLabels = document.querySelectorAll('[class*="priceLabel"], [class*="price-axis-label"]');
            const prices = [];
            priceLabels.forEach(el => prices.push(el.textContent.trim()));
            vals.priceAxis = prices.slice(0, 8);
            
            return vals;
        }""")
        log(f"Indicator data: {json.dumps(indicator_data)[:200]}")

        # Screenshot 3: Final full chart
        step("Final Analysis Screenshot", "Capturing complete chart for strategy analysis")
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            p3 = f.name
        tmp_files.append(p3)
        page.screenshot(path=p3, full_page=False)
        screenshots.append(img_to_b64(p3))

        browser.close()

    # Cleanup
    for path in tmp_files:
        try: os.unlink(path)
        except: pass

    elapsed = round(time.time() - start, 1)
    step("Analysis Complete", f"Browser session finished in {elapsed}s — {len(screenshots)} screenshots captured")

    return {
        "screenshots": screenshots,
        "steps": steps,
        "elapsed": elapsed,
        "price_info": price_info,
        "indicator_data": indicator_data,
        "pair": pair,
        "timeframe": timeframe,
        "symbol": symbol,
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <pair> <timeframe>", file=sys.stderr)
        sys.exit(1)

    pair      = sys.argv[1]
    timeframe = sys.argv[2]

    try:
        result = analyze(pair, timeframe)
        # Output JSON to stdout — caller reads this
        print(json.dumps(result, separators=(",", ":")))
        sys.exit(0)
    except Exception as e:
        log(f"FATAL: {e}", "ERROR")
        print(json.dumps({"error": str(e), "screenshots": [], "steps": []}))
        sys.exit(1)
