#!/usr/bin/env python3
"""
GizzyFx TradingView Analyzer — hardened edition
Opens TradingView in headless Chromium, applies indicators, captures screenshots.
Draws analysis levels (hlines, trendlines, zones) on screenshots using PIL.
Outputs JSON to stdout. Never crashes — all errors caught and reported.

Usage:
  python3 tradingview_analyzer.py <pair> <timeframe> [analysis_json]

analysis_json (optional): JSON string with drawings to overlay:
  {
    "price_range": {"min": 1.155, "max": 1.165},
    "hlines": [{"price": 1.16077, "color": "#ef4444", "style": "solid", "label": "Resistance"}],
    "trendlines": [{"p1price": 1.16, "p2price": 1.17, "color": "#3b82f6", "label": "Trend"}],
    "zones": [{"topPrice": 1.162, "bottomPrice": 1.160, "color": "#f59e0b", "label": "OB"}],
    "markers": [{"x_pct": 0.5, "y_pct": 0.3, "color": "#22c55e", "label": "Entry"}]
  }
"""

import sys, os, json, time, base64, tempfile, traceback
from datetime import datetime, timezone

TV_SYMBOLS = {
    "EURUSD": "FX:EURUSD", "GBPUSD": "FX:GBPUSD", "USDJPY": "FX:USDJPY",
    "AUDUSD": "FX:AUDUSD", "XAUUSD": "TVC:GOLD", "USDCAD": "FX:USDCAD",
    "NZDUSD": "FX:NZDUSD", "USDCHF": "FX:USDCHF",
}
TF_MAP = {"1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D", "1w": "W"}

PAIR_DECIMALS = {"EURUSD": 5, "GBPUSD": 5, "USDJPY": 3, "AUDUSD": 5, "XAUUSD": 2, "USDCAD": 5, "NZDUSD": 5, "USDCHF": 5}

# Typical visible range per pair (for estimating Y-axis)
PAIR_RANGE = {
    "EURUSD": 0.005, "GBPUSD": 0.005, "USDJPY": 0.5, "AUDUSD": 0.005,
    "XAUUSD": 10.0, "USDCAD": 0.005, "NZDUSD": 0.005, "USDCHF": 0.005,
}


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


def annotate_screenshot(screenshot_b64, analysis, pair, current_price=None):
    """Annotate a TradingView screenshot with analysis drawings using PIL.
    
    screenshot_b64: base64 JPEG data URL
    analysis: dict with keys: hlines, trendlines, zones, markers, price_range
    pair: pair name for price formatting
    current_price: current price (for estimating visible range)
    """
    if not analysis or not screenshot_b64:
        return screenshot_b64
    
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io
        
        # Decode base64 image
        if screenshot_b64.startswith('data:image'):
            screenshot_b64 = screenshot_b64.split(',', 1)[1]
        img_data = base64.b64decode(screenshot_b64)
        img = Image.open(io.BytesIO(img_data))
        draw = ImageDraw.Draw(img)
        
        width, height = img.size
        
        # Chart area (approximate - TradingView layout with left toolbar + right Y-axis)
        chart_left = 56
        chart_right = width - 80  # Leave room for Y-axis labels
        chart_top = 42
        chart_bottom = height - 30
        
        # Price-to-pixel mapping
        price_range = analysis.get('price_range')
        if price_range and 'min' in price_range and 'max' in price_range:
            p_min = price_range['min']
            p_max = price_range['max']
        elif current_price:
            # Estimate range from current price
            pip_range = PAIR_RANGE.get(pair.upper(), 0.005)
            p_min = current_price - pip_range
            p_max = current_price + pip_range
        else:
            # Fallback
            p_min = 0
            p_max = 1
        
        p_range = p_max - p_min if p_max > p_min else 1
        
        def price_to_y(price):
            """Convert price to Y coordinate (inverted: higher price = smaller y)."""
            return chart_top + (p_max - price) / p_range * (chart_bottom - chart_top)
        
        # Try to load a font
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 10)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 8)
        except:
            font = ImageFont.load_default()
            font_small = ImageFont.load_default()
        
        # Draw zones (filled rectangles)
        for z in analysis.get('zones', []):
            color = z.get('color', '#f59e0b')
            y_top = price_to_y(z['topPrice'])
            y_bot = price_to_y(z['bottomPrice'])
            # Draw filled rectangle with transparency using overlay
            overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            overlay_draw.rectangle(
                [chart_left, y_top, chart_right, y_bot],
                fill=_hex_to_rgba(color, 30),
                outline=_hex_to_rgba(color, 180),
                width=1
            )
            img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
            draw = ImageDraw.Draw(img)
            # Label at left edge
            if z.get('label'):
                draw.text((chart_left + 4, y_top + 2), z['label'], fill=color, font=font_small)
        
        # Draw horizontal lines
        for h in analysis.get('hlines', []):
            color = h.get('color', '#ef4444')
            y = price_to_y(h['price'])
            style = h.get('style', 'solid')
            
            if style == 'dashed':
                # Draw dashed line
                x = chart_left
                while x < chart_right:
                    draw.line([(x, y), (min(x + 5, chart_right), y)], fill=color, width=1)
                    x += 10
            elif style == 'dotted':
                x = chart_left
                while x < chart_right:
                    draw.ellipse([(x, y-1), (x+2, y+1)], fill=color)
                    x += 6
            else:
                draw.line([(chart_left, y), (chart_right, y)], fill=color, width=1)
            
            # Label on right side
            dec = PAIR_DECIMALS.get(pair.upper(), 5)
            label = h.get('label', f"{h['price']:.{dec}f}")
            draw.text((chart_right + 4, y - 5), label, fill=color, font=font_small)
        
        # Draw trendlines
        for t in analysis.get('trendlines', []):
            color = t.get('color', '#3b82f6')
            # Map prices to Y coordinates
            y1 = price_to_y(t['p1price'])
            y2 = price_to_y(t['p2price'])
            # Draw trendline across chart (approximate without time-to-x mapping)
            draw.line([(chart_left, y1), (chart_right, y2)], fill=color, width=1)
            if t.get('label'):
                draw.text((chart_right + 4, y2 - 5), t['label'], fill=color, font=font_small)
        
        # Draw markers (positioned by x_pct/y_pct of chart area)
        for m in analysis.get('markers', []):
            color = m.get('color', '#22c55e')
            x_pct = m.get('x_pct', 0.5)
            y_pct = m.get('y_pct', 0.5)
            x = chart_left + x_pct * (chart_right - chart_left)
            y = chart_top + y_pct * (chart_bottom - chart_top)
            # Draw diamond marker
            draw.polygon([(x, y-5), (x+5, y), (x, y+5), (x-5, y)], fill=color)
            if m.get('label'):
                draw.text((x + 8, y - 5), m['label'], fill=color, font=font_small)
        
        # Encode back to base64
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        return 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode()
        
    except Exception as e:
        log(f"Annotation error: {e}", "WARN")
        return screenshot_b64


def _hex_to_rgba(hex_color, alpha=255):
    """Convert hex color to RGBA tuple."""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c*2 for c in hex_color)
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (r, g, b, alpha)


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


def analyze(pair: str, timeframe: str, analysis_json: str = None) -> dict:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    symbol = TV_SYMBOLS.get(pair.upper(), f"FX:{pair.upper()}")
    tf_val = TF_MAP.get(timeframe.lower(), "60")
    start = time.time()
    screenshots = []
    steps = []
    tmp_files = []
    price_info = {}
    indicator_data = {}
    current_price = None

    def step(label, detail):
        t = round(time.time() - start, 1)
        steps.append({"label": label, "detail": detail, "elapsed": t})
        log(f"[{t}s] {label}: {detail}")

    # Parse analysis JSON if provided
    analysis = None
    if analysis_json:
        try:
            analysis = json.loads(analysis_json)
            step("Analysis Loaded", f"Got analysis with {len(analysis.get('hlines', []))} hlines, {len(analysis.get('zones', []))} zones")
        except Exception as e:
            step("Analysis Parse Error", str(e)[:80])

    with sync_playwright() as p:
        step("Browser Launch", f"Starting headless Chromium for {pair} {tf_val}")

        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                  "--window-size=1600,900", "--disable-setuid-sandbox",
                  "--disable-background-networking", "--disable-extensions",
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
            if price_info.get('price'):
                try:
                    current_price = float(price_info['price'].replace(',', ''))
                    step("Price Extracted", f"Current price: {current_price}")
                except:
                    pass
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

        # ── 4. Annotate final screenshot with analysis ──────────────
        if analysis and screenshots:
            step("Annotating Screenshot", "Drawing analysis levels on chart")
            # Use the last screenshot (indicator view) as base
            last_b64 = screenshots[-1]
            annotated = annotate_screenshot(last_b64, analysis, pair, current_price)
            if annotated != last_b64:
                screenshots.append(annotated)
                step("Annotation Complete", "Added annotated screenshot")
            else:
                step("Annotation Skipped", "Annotation failed, using original")
        elif analysis and not screenshots:
            step("Annotation Skipped", "No screenshots to annotate")

        # Screenshot 3: final (if no annotation was done, take a clean final shot)
        if not analysis:
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
        print(json.dumps({"error": "Usage: tradingview_analyzer.py <pair> <timeframe> [analysis_json]", "screenshots": [], "steps": []}))
        sys.exit(1)

    pair = sys.argv[1]
    timeframe = sys.argv[2]
    analysis_json = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        result = analyze(pair, timeframe, analysis_json)
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
