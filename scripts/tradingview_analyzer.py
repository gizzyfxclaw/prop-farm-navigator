#!/usr/bin/env python3
"""
GizzyFx TradingView Analyzer — hardened edition
Opens TradingView in headless Chromium, applies indicators, captures screenshots.
Outputs JSON to stdout. Never crashes — all errors caught and reported.

Usage:
  python3 tradingview_analyzer.py <pair> <timeframe>
"""

import sys, os, json, time, base64, tempfile, traceback
from datetime import datetime, timezone

TV_SYMBOLS = {
    "EURUSD":"FX:EURUSD","GBPUSD":"FX:GBPUSD","USDJPY":"FX:USDJPY",
    "AUDUSD":"FX:AUDUSD","XAUUSD":"TVC:GOLD","USDCAD":"FX:USDCAD",
    "NZDUSD":"FX:NZDUSD","USDCHF":"FX:USDCHF",
}
TF_MAP = {"1m":"1","5m":"5","15m":"15","30m":"30","1h":"60","4h":"240","1d":"D","1w":"W"}

def log(msg, lvl="INFO"):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] [{lvl}] {msg}", file=sys.stderr, flush=True)

def safe_screenshot(page, path, quality=70):
    """Take JPEG screenshot with error handling."""
    try:
        page.screenshot(path=path, full_page=False, type="jpeg", quality=quality)
        return True
    except Exception as e:
        log(f"Screenshot failed: {e}", "WARN")
        return False

def img_to_b64(path):
    """Read file as base64. Returns empty string on error."""
    try:
        with open(path, "rb") as f:
            return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
    except Exception:
        return ""

def dismiss_popups(page, max_tries=3):
    """Dismiss any cookie/login banners. Silent fail."""
    selectors = [
        "button[data-name='accept-all']",
        "button:has-text('Accept all')",
        "button:has-text('Accept')",
        ".tv-dialog__close",
        "[data-role='toast-close-button']",
        "button[aria-label='Close']",
    ]
    for _ in range(max_tries):
        dismissed = False
        for sel in selectors:
            try:
                loc = page.locator(sel).first
                if loc.is_visible(timeout=500):
                    loc.click(timeout=500)
                    time.sleep(0.3)
                    dismissed = True
            except Exception:
                pass
        if not dismissed:
            break

def analyze(pair: str, timeframe: str) -> dict:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    symbol = TV_SYMBOLS.get(pair.upper(), f"FX:{pair.upper()}")
    tf_val = TF_MAP.get(timeframe.lower(), "60")
    start  = time.time()
    screenshots = []
    steps = []
    tmp_files = []
    price_info = {}
    indicator_data = {}

    def step(label, detail):
        t = round(time.time() - start, 1)
        steps.append({"label": label, "detail": detail, "elapsed": t})
        log(f"[{t}s] {label}: {detail}")

    with sync_playwright() as p:
        step("Browser Launch", f"Starting headless Chromium for {pair} {tf_val}")

        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
                  "--window-size=1600,900","--disable-setuid-sandbox",
                  "--disable-background-networking","--disable-extensions",
                  "--disable-background-timer-throttling",
                  "--disable-renderer-backgrounding"],
        )
        context = browser.new_context(
            viewport={"width": 1600, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.set_default_timeout(15000)

        # ── 1. Load clean chart ─────────────────────────────────────
        step("Loading TradingView", f"Navigating to {symbol} chart")
        tv_url = (f"https://www.tradingview.com/chart/?symbol={symbol}"
                  f"&interval={tf_val}&theme=dark&style=1&hide_side_toolbar=0")
        try:
            page.goto(tv_url, wait_until="domcontentloaded", timeout=25000)
        except PWTimeout:
            step("Partial Load", "Timeout — chart still rendering")
        except Exception as e:
            step("Load Error", str(e)[:80])

        time.sleep(5)
        step("Clearing Popups", "Dismissing banners")
        dismiss_popups(page)
        time.sleep(2)

        # Screenshot 1: clean
        step("Clean Chart Screenshot", "Baseline before indicators")
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            p1 = f.name
        tmp_files.append(p1)
        if safe_screenshot(page, p1):
            b64 = img_to_b64(p1)
            if b64:
                screenshots.append(b64)

        # ── 2. Extract price ────────────────────────────────────────
        step("Reading Price Data", "Extracting current price from DOM")
        try:
            price_info = page.evaluate("""() => {
                const result = {};
                for (const sel of [
                    '[class*="priceWrapper"] [class*="price"]',
                    '.tv-symbol-price-quote__value',
                    '.js-symbol-last',
                    '[data-field="close"]'
                ]) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent.trim()) {
                        result.price = el.textContent.trim();
                        result.selector = sel;
                        break;
                    }
                }
                const changeEl = document.querySelector('.tv-symbol-price-quote__change-value,[class*="changeValue"]');
                if (changeEl) result.change = changeEl.textContent.trim();
                return result;
            }""")
        except Exception as e:
            log(f"Price extract error: {e}", "WARN")
            price_info = {}

        # ── 3. Load with indicators ─────────────────────────────────
        step("Applying Indicators", "Loading EMA 20/50/200 + Volume")
        tv_ind_url = (f"https://www.tradingview.com/chart/?symbol={symbol}"
                      f"&interval={tf_val}&theme=dark&style=1"
                      f"&studies[]=MASimple@1/%7B%22length%22%3A20%7D"
                      f"&studies[]=MASimple@1/%7B%22length%22%3A50%7D"
                      f"&studies[]=MASimple@1/%7B%22length%22%3A200%7D"
                      f"&studies[]=Volume@1")
        try:
            page.goto(tv_ind_url, wait_until="domcontentloaded", timeout=20000)
            time.sleep(6)
        except PWTimeout:
            step("Indicator Load Partial", "Continuing with partial data")
        except Exception as e:
            step("Indicator Error", str(e)[:80])

        dismiss_popups(page)
        time.sleep(2)

        # Screenshot 2: indicators
        step("Indicator Screenshot", "EMA + Volume overlay")
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            p2 = f.name
        tmp_files.append(p2)
        if safe_screenshot(page, p2):
            b64 = img_to_b64(p2)
            if b64:
                screenshots.append(b64)

        # Read indicator values
        step("Reading Indicator Values", "Extracting EMA values from legend")
        try:
            indicator_data = page.evaluate("""() => {
                const vals = {};
                const items = document.querySelectorAll(
                    '.pane-legend-item-value,.tv-legend-item__value,[class*="legendText"],[class*="valueValue"]'
                );
                const list = [];
                items.forEach(el => {
                    const t = el.textContent.trim();
                    if (t && t.length > 0 && !t.includes('{')) list.push(t);
                });
                vals.legendValues = list.slice(0, 12);
                return vals;
            }""")
        except Exception as e:
            log(f"Indicator read error: {e}", "WARN")
            indicator_data = {}

        # Screenshot 3: final
        step("Final Screenshot", "Complete analysis view")
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            p3 = f.name
        tmp_files.append(p3)
        if safe_screenshot(page, p3):
            b64 = img_to_b64(p3)
            if b64:
                screenshots.append(b64)

        try:
            browser.close()
        except Exception:
            pass

    # Cleanup temp files
    for path in tmp_files:
        try:
            os.unlink(path)
        except Exception:
            pass

    elapsed = round(time.time() - start, 1)
    step("Analysis Complete", f"Done in {elapsed}s — {len(screenshots)} screenshots")

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
        print(json.dumps({"error": "Usage: tradingview_analyzer.py <pair> <timeframe>", "screenshots": [], "steps": []}))
        sys.exit(1)

    pair      = sys.argv[1]
    timeframe = sys.argv[2]

    try:
        result = analyze(pair, timeframe)
        print(json.dumps(result, separators=(",", ":")))
        sys.exit(0)
    except Exception as e:
        err = traceback.format_exc()
        log(f"FATAL: {e}\n{err}", "ERROR")
        # Return empty result — processor will still PATCH with text analysis
        print(json.dumps({
            "error": str(e),
            "screenshots": [],
            "steps": [{"label": "Error", "detail": str(e)[:100], "elapsed": 0}],
            "elapsed": 0,
            "price_info": {},
            "indicator_data": {},
            "pair": pair,
            "timeframe": timeframe,
        }))
        sys.exit(0)  # Exit 0 so processor still runs text analysis
