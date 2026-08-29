#!/usr/bin/env python3
import datetime, json, os, sys
try:
    import httpx
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import TextContent, ImageContent, Tool
except ImportError as e:
    print(f"Missing: {e}\nRun: pip install 'mcp>=1.28,<2' httpx", file=sys.stderr); sys.exit(1)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gizzyfx_backtest_engine import simulate, PIP_SIZE, TV_SYMBOL, period_description

API_URL = os.environ.get("GIZZYFX_API_URL", "").rstrip("/")
API_KEY  = os.environ.get("GIZZYFX_API_KEY", "")
if not API_URL or not API_KEY:
    print("ERROR: Set GIZZYFX_API_URL and GIZZYFX_API_KEY", file=sys.stderr); sys.exit(1)

TVREMIX_URL = os.environ.get("TVREMIX_URL", "https://tvremix.xyz/api/mcp/v1")
TVREMIX_API_KEY = os.environ.get("TVREMIX_API_KEY", "")

HEADERS = {"x-hermes-key": API_KEY, "Content-Type": "application/json"}

async def _fetch_tv_bars(pair, timeframe, count=5000):
    symbol = TV_SYMBOL.get(pair, f"FX:{pair}")
    async with streamablehttp_client(
        TVREMIX_URL, headers={"Authorization": f"Bearer {TVREMIX_API_KEY}"}
    ) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(
                "get_ohlcv", {"symbol": symbol, "interval": timeframe, "count": count}
            )
            if getattr(result, "isError", False):
                raise RuntimeError(str(result.content))
            data = json.loads(result.content[0].text)
            bars = data["bars"]
            return (
                [b["o"] for b in bars],
                [b["h"] for b in bars],
                [b["l"] for b in bars],
                [b["c"] for b in bars],
                [b["t"] for b in bars],
            )

def _get(path, params=None):
    r = httpx.get(f"{API_URL}{path}", headers=HEADERS, params=params, timeout=15)
    r.raise_for_status(); return r.json()

def _post(path, body):
    r = httpx.post(f"{API_URL}{path}", headers=HEADERS, json=body, timeout=15)
    r.raise_for_status(); return r.json()

def _patch(path, body):
    r = httpx.patch(f"{API_URL}{path}", headers=HEADERS, json=body, timeout=15)
    r.raise_for_status(); return r.json()

server = Server("gizzyfx-trading-terminal")

TOOLS = [
    Tool(name="get_pending_requests", description="Poll GizzyFx for pending analysis requests from the user. Returns id, pair, note, created_at.", inputSchema={"type":"object","properties":{},"required":[]}),
    Tool(name="get_knowledge_docs", description="Fetch all strategy documents the user has taught. Read these before analysing any pair.", inputSchema={"type":"object","properties":{},"required":[]}),
    Tool(name="get_understanding", description="Fetch the current whole-knowledge-base synthesis (if one exists) — your last combined understanding across ALL taught docs, plus any noted contradictions.", inputSchema={"type":"object","properties":{},"required":[]}),
    Tool(name="post_understanding", description="Publish an updated whole-knowledge-base synthesis after reviewing ALL knowledge docs together (not just the newest one). Call this from the periodic review job, not after teaching a single document.", inputSchema={"type":"object","properties":{"summary":{"type":"string","description":"Your combined understanding of the strategy material as a whole"},"contradictions":{"type":"string","description":"Anything that conflicts between documents, or between a document and prior understanding. Omit if none."},"doc_count":{"type":"integer","description":"How many knowledge docs this synthesis covers"}},"required":["summary","doc_count"]}),
    Tool(
        name="get_ohlcv_data",
        description=(
            "Fetch real historical OHLCV candles for a forex pair from tvremix (TradingView "
            "data), via the gizzyfx server's own connection — use this instead of calling "
            "tvremix's own get_ohlcv tool directly, which requires interactive approval and will "
            "silently fail in a cron/unattended run. Keep `count` modest (a few hundred) for "
            "free-form judgment backtests to control context cost; a named custom strategy "
            "backtest can go higher."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "pair": {"type": "string", "description": "e.g. EURUSD"},
                "interval": {"type": "string", "enum": ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"], "default": "1h"},
                "count": {"type": "integer", "description": "Number of bars, max 5000. Default 300.", "default": 300},
            },
            "required": ["pair"],
        },
    ),
    Tool(
        name="get_strategy_rules",
        description=(
            "List structured, machine-executable strategy definitions (the codified counterpart "
            "to free-text knowledge docs). A backtest request with a rule_id is handled entirely "
            "by a separate deterministic script (real candle-by-candle simulation over tvremix "
            "history, no LLM) — it will already be gone from get_pending_requests by the time you "
            "see it. Use this tool to check whether a strategy the human is discussing already has "
            "a rule, or to see what a rule's mechanical definition actually says."
        ),
        inputSchema={"type": "object", "properties": {}, "required": []},
    ),
    Tool(
        name="save_strategy_from_chat",
        description=(
            "Save a trading strategy the user just taught you in this chat as a knowledge document. "
            "Call this whenever the user explains, teaches, or corrects a strategy or rule — do not "
            "wait to be asked. Distil what they said into a clear title and structured content "
            "(overview, entry rules, SL/TP rules, timeframes, pairs, confluences, notes). The user "
            "sees it immediately in their Trading Agent knowledge base."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short descriptive title, e.g. 'Parallel Channel Breakout'"},
                "content": {"type": "string", "description": "Full structured write-up of the strategy"},
            },
            "required": ["title", "content"],
        },
    ),
    Tool(
        name="save_strategy_rule",
        description=(
            "Codify a taught strategy as a structured rule so it shows up in the backtest picker. "
            "Use entry_type='custom' with custom_rules for discretionary/judgment strategies (most "
            "chat-taught ones — run_deterministic_backtest can't execute these, do the backtest "
            "yourself by judgment and post_backtest_result with deterministic=false). Use a "
            "mechanical type (sma_cross, ema_cross, rsi, breakout) with entry_params only when the "
            "strategy is explicitly indicator-based — those CAN be run for real via "
            "run_deterministic_backtest. Returns the rule id; keep it for request_backtest."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "knowledge_doc_id": {"type": "string", "description": "id from save_strategy_from_chat, if any"},
                "title": {"type": "string"},
                "direction": {"type": "string", "enum": ["long", "short", "both"]},
                "entry_type": {"type": "string", "enum": ["sma_cross", "ema_cross", "rsi", "breakout", "custom"]},
                "entry_params": {
                    "type": "object",
                    "description": (
                        "Mechanical params only. sma_cross/ema_cross: {fast, slow}. "
                        "rsi: {period, oversold, overbought}. breakout: {lookback}. custom: {}."
                    ),
                },
                "custom_rules": {
                    "type": "string",
                    "description": "Required when entry_type='custom' — full plain-English entry logic.",
                },
                "sl_type": {"type": "string", "enum": ["atr", "fixed_pips"]},
                "sl_value": {"type": "number", "description": "ATR multiplier or fixed pips"},
                "tp_type": {"type": "string", "enum": ["rr_multiple", "fixed_pips"]},
                "tp_value": {"type": "number", "description": "R:R ratio (e.g. 2.0) or fixed pips"},
                "default_timeframe": {"type": "string", "description": "e.g. '1h', '5m'"},
            },
            "required": ["title", "direction", "entry_type", "sl_type", "sl_value", "tp_type", "tp_value", "default_timeframe"],
        },
    ),
    Tool(
        name="request_backtest",
        description=(
            "Queue a backtest request in the terminal so a strategy just discussed/codified is "
            "traceable in the Trading Agent tab. For a mechanical rule (not entry_type=custom), "
            "still call run_deterministic_backtest yourself right away and post_backtest_result — "
            "don't just queue and wait. For entry_type=custom rules, queuing records intent; run the "
            "judgment backtest yourself and post_backtest_result with deterministic=false."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "pair": {"type": "string", "description": "e.g. EURUSD, GBPUSD"},
                "note": {"type": "string", "description": "Brief description of what's being tested"},
                "timeframe": {"type": "string", "default": "1h"},
                "rule_id": {"type": "string", "description": "Optional: id from save_strategy_rule"},
            },
            "required": ["pair", "note"],
        },
    ),
    Tool(
        name="run_deterministic_backtest",
        description=(
            "Run a REAL backtest: fetches real historical candles for `pair` at `timeframe` from "
            "tvremix (TradingView data), then mechanically walks `rule_id`'s entry/exit rules "
            "candle-by-candle (no judgment calls, no LLM math) and returns real trade stats. "
            "Call this instead of eyeballing candles yourself whenever the backtest request has "
            "a rule_id (check get_strategy_rules first to see what's defined). After this "
            "returns, call post_backtest_result with deterministic=true and the exact numbers "
            "this tool gave you — don't round or editorialize the stats, just report them, though "
            "you should still write a normal narrative summarizing what happened."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "rule_id": {"type": "string"},
                "pair": {"type": "string", "description": "e.g. EURUSD"},
                "timeframe": {"type": "string", "description": "1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W, or 1M"},
            },
            "required": ["rule_id", "pair", "timeframe"],
        },
    ),
    Tool(name="post_analysis_step", description="Post one analysis step with chart drawings. User sees drawings appear live. Call multiple times as you progress (step 0,1,2...). Drawing types: hline, trendline, zone, marker.", inputSchema={"type":"object","properties":{"request_id":{"type":"string"},"pair":{"type":"string"},"step":{"type":"integer"},"step_label":{"type":"string","description":"Short label shown live e.g. 'Identifying swing highs'"},"drawings":{"type":"array","items":{"type":"object"},"description":"Array of drawing objects. hline:{type,price,label,color,style}. trendline:{type,p1time,p1price,p2time,p2price,label,color}. zone:{type,topPrice,bottomPrice,label,color}. marker:{type,time,position,label,color,markerType}"},"summary":{"type":"string"}},"required":["request_id","pair","step","step_label"]}),
    Tool(name="mark_request_fulfilled", description="Mark a request done after posting all steps.", inputSchema={"type":"object","properties":{"request_id":{"type":"string"}},"required":["request_id"]}),
    Tool(
        name="post_analysis_note",
        description=(
            "Write a summary note to the Trading Agent log. If replying to a request that "
            "included the user's own analysis, pass request_id and verdict so it threads under "
            "their request on the site instead of appearing as a separate ambient note."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "pair": {"type": "string"},
                "summary": {"type": "string"},
                "request_id": {"type": "string", "description": "Set when replying to a specific request"},
                "verdict": {
                    "type": "string",
                    "enum": ["match", "diverge", "partial"],
                    "description": "Only when the request included the user's own analysis: does it match the taught strategy?",
                },
            },
            "required": ["pair", "summary"],
        },
    ),
    Tool(
        name="post_trade_setup",
        description=(
            "Post a structured trade setup card to the trading terminal after completing analysis. "
            "The entry, SL, and TP levels appear as a trade card on the site AND are automatically "
            "drawn on the live chart as horizontal lines. Call this as the final step, after "
            "mark_request_fulfilled and post_analysis_note."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "request_id": {"type": "string", "description": "The request id (optional)"},
                "pair": {"type": "string", "description": "e.g. EURUSD"},
                "direction": {"type": "string", "enum": ["long", "short"]},
                "entry": {"type": "number", "description": "Entry price"},
                "sl": {"type": "number", "description": "Stop loss price"},
                "tp1": {"type": "number", "description": "Take profit 1 (mandatory)"},
                "tp2": {"type": "number", "description": "Take profit 2 (optional)"},
                "tp3": {"type": "number", "description": "Take profit 3 (optional)"},
                "rr": {"type": "number", "description": "Risk:reward (auto-calculated if omitted)"},
                "rationale": {"type": "string", "description": "Why this setup is valid"},
                "order_type": {
                    "type": "string",
                    "enum": ["MARKET", "BUY_LIMIT", "BUY_STOP", "SELL_LIMIT", "SELL_STOP"],
                    "description": (
                        "Pending vs instant execution. Use MARKET if entry is at/very near the "
                        "current live price. Otherwise pick the correct pending type: entry below "
                        "current price on a long -> BUY_LIMIT, entry above on a long -> BUY_STOP; "
                        "entry above current price on a short -> SELL_LIMIT, entry below -> SELL_STOP."
                    ),
                },
            },
            "required": ["pair", "direction", "entry", "sl", "tp1"],
        },
    ),
    Tool(
        name="post_backtest_result",
        description=(
            "Post the result of a backtest request (request_type=backtest from "
            "get_pending_requests). Two modes:\n"
            "- deterministic=true: you called run_deterministic_backtest first and are reporting "
            "its exact numbers verbatim (pass rule_id/timeframe/max_drawdown_pct/avg_rr/bars_used "
            "too). This is a real, reproducible simulation.\n"
            "- deterministic=false (default): no rule_id was available, so you narrated a "
            "judgment-call walkthrough of a bounded recent window of candles yourself - NOT a "
            "rigorous statistical backtest. The narrative field must say so explicitly and "
            "describe exactly what you did (how many candles, what timeframe, which strategy) so "
            "the human can judge how much weight to give the win rate."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "request_id": {"type": "string", "description": "The backtest request id (optional)"},
                "pair": {"type": "string"},
                "period_description": {
                    "type": "string",
                    "description": "Exactly what window/timeframe you walked through, e.g. 'H1, last ~300 candles (~2 weeks)'",
                },
                "trades_analyzed": {"type": "integer", "description": "Total hypothetical trades identified"},
                "wins": {"type": "integer"},
                "losses": {"type": "integer"},
                "narrative": {
                    "type": "string",
                    "description": "Methodology + caveats + notable trades. If not deterministic, must state this is approximate/small-sample, not statistically reliable.",
                },
                "deterministic": {"type": "boolean", "description": "True only after calling run_deterministic_backtest. Default false."},
                "rule_id": {"type": "string", "description": "Required when deterministic=true."},
                "timeframe": {"type": "string", "description": "Required when deterministic=true."},
                "max_drawdown_pct": {"type": "number"},
                "avg_rr": {"type": "number"},
                "bars_used": {"type": "integer"},
            },
            "required": ["pair", "period_description", "trades_analyzed", "wins", "losses", "narrative"],
        },
    ),
]

@server.list_tools()
async def list_tools(): return TOOLS

@server.call_tool()
async def call_tool(name, arguments):
    try:
        if name == "get_pending_requests":
            data = _get("/api/hermes/requests", {"status":"pending"})
            reqs = data.get("requests",[])
            if not reqs:
                return [TextContent(type="text", text="No pending requests.")]
            content = []
            for r in reqs:
                rtype = r.get("request_type") or "analysis"
                line = f"id={r['id']} type={rtype} pair={r['pair']} note={r.get('note','(none)')} created={r['created_at']}"
                if rtype == "backtest":
                    line += "\n  This is a BACKTEST request, not a live analysis request — see the backtesting section of the gizzyfx skill. Respond with post_backtest_result, not post_trade_setup."
                if r.get("user_analysis"):
                    line += f"\n  USER'S OWN ANALYSIS (check this against the taught strategy, then state a verdict): {r['user_analysis']}"
                content.append(TextContent(type="text", text=line))
                img = r.get("chart_image")
                if img and img.startswith("data:image/"):
                    mime, _, b64 = img.partition(";base64,")
                    mime = mime.removeprefix("data:")
                    if b64:
                        content.append(TextContent(type="text", text=f"  ^ chart image attached to request {r['id']}:"))
                        content.append(ImageContent(type="image", data=b64, mimeType=mime))
            return content
        elif name == "get_knowledge_docs":
            data = _get("/api/hermes/knowledge")
            docs = data.get("docs",[])
            result = "No docs yet." if not docs else "\n\n".join([f"=== {d['title']} ===\n{d['content']}" for d in docs])
        elif name == "get_understanding":
            data = _get("/api/hermes/understanding")
            u = data.get("understanding")
            if not u:
                result = "No synthesis yet."
            else:
                contra = f"\n\nContradictions noted: {u['contradictions']}" if u.get("contradictions") else ""
                result = f"Last synthesized from {u['doc_count']} doc(s) at {u['created_at']}:\n{u['summary']}{contra}"
        elif name == "post_understanding":
            body = {"summary": arguments["summary"], "doc_count": arguments["doc_count"]}
            if arguments.get("contradictions"):
                body["contradictions"] = arguments["contradictions"]
            data = _post("/api/hermes/understanding", body)
            result = f"Understanding synthesis posted (id={data.get('id')})."
        elif name == "get_strategy_rules":
            data = _get("/api/hermes/strategy-rules")
            rules = data.get("rules", [])
            def _fmt_rule(r):
                base = (
                    f"id={r['id']} title={r['title']!r} active={bool(r['active'])} direction={r['direction']} "
                    f"entry={r['entry_type']}"
                )
                if r["entry_type"] == "custom":
                    base += f" custom_rules={r.get('custom_rules')!r} (NOT mechanical — use judgment over real tvremix history, do not call run_deterministic_backtest for this one)"
                else:
                    base += f"({r['entry_params']})"
                base += (
                    f" sl={r['sl_type']}:{r['sl_value']} tp={r['tp_type']}:{r['tp_value']} "
                    f"default_timeframe={r['default_timeframe']} knowledge_doc_id={r.get('knowledge_doc_id')}"
                )
                return base

            result = "No structured strategy rules defined yet." if not rules else "\n".join(_fmt_rule(r) for r in rules)
        elif name == "save_strategy_from_chat":
            data = _post("/api/hermes/knowledge", {
                "title": arguments["title"], "content": arguments["content"], "source": "hermes_chat",
            })
            result = f"Strategy saved to knowledge base (id={data.get('id')}). Title: {arguments['title']!r}. Visible immediately in the Trading Agent tab."
        elif name == "save_strategy_rule":
            body = {
                "title": arguments["title"], "direction": arguments["direction"],
                "entry_type": arguments["entry_type"], "entry_params": arguments.get("entry_params", {}),
                "sl_type": arguments["sl_type"], "sl_value": arguments["sl_value"],
                "tp_type": arguments["tp_type"], "tp_value": arguments["tp_value"],
                "default_timeframe": arguments["default_timeframe"],
            }
            for k in ("custom_rules", "knowledge_doc_id"):
                if k in arguments:
                    body[k] = arguments[k]
            data = _post("/api/hermes/strategy-rules", body)
            result = f"Strategy rule created (id={data.get('id')}) — {arguments['title']!r}, entry_type={arguments['entry_type']}. Use this id with request_backtest / run_deterministic_backtest."
        elif name == "request_backtest":
            body = {
                "pair": arguments["pair"].upper().replace("/", ""), "note": arguments["note"],
                "request_type": "backtest", "timeframe": arguments.get("timeframe", "1h"),
            }
            if "rule_id" in arguments:
                body["rule_id"] = arguments["rule_id"]
            data = _post("/api/hermes/requests", body)
            result = f"Backtest queued (id={data.get('id')}) for {body['pair']} @ {body['timeframe']}."
        elif name == "run_deterministic_backtest":
            pair = arguments["pair"].upper().replace("/", "")
            timeframe = arguments["timeframe"]
            rules_data = _get("/api/hermes/strategy-rules").get("rules", [])
            rule = next((r for r in rules_data if r["id"] == arguments["rule_id"]), None)
            if not rule:
                result = f"No strategy rule found with id={arguments['rule_id']}. Call get_strategy_rules first."
            elif rule["entry_type"] == "custom":
                result = (
                    f"Rule '{rule['title']}' is entry_type=custom — it's free text, not mechanical, so this tool "
                    f"can't run it. custom_rules: {rule.get('custom_rules')!r}. Instead: pull real candles yourself "
                    f"via get_ohlcv_data or tvremix at the requested timeframe, apply this rule's conditions by "
                    f"judgment, and post_backtest_result with deterministic=false (but still pass rule_id and "
                    f"timeframe so it's traceable to this named strategy)."
                )
            else:
                o, h, l, c, t = await _fetch_tv_bars(pair, timeframe)
                if len(c) < 50:
                    result = f"Only {len(c)} bars came back for {pair} {timeframe} — too little history to backtest, try a higher timeframe."
                else:
                    pip_size = PIP_SIZE.get(pair, 0.0001)
                    stats_out = simulate(rule, o, h, l, c, pip_size)
                    first_iso = datetime.datetime.fromtimestamp(t[0], datetime.timezone.utc).strftime("%Y-%m-%d") if t else None
                    last_iso = datetime.datetime.fromtimestamp(t[-1], datetime.timezone.utc).strftime("%Y-%m-%d") if t else None
                    desc = period_description(pair, timeframe, len(c), first_iso, last_iso)
                    result = (
                        f"REAL backtest of rule '{rule['title']}' ({rule['entry_type']}) on {pair} {timeframe}:\n"
                        f"period_description={desc!r}\n"
                        f"trades_analyzed={stats_out['trades_analyzed']} wins={stats_out['wins']} losses={stats_out['losses']}\n"
                        f"avg_rr={stats_out['avg_rr']} max_drawdown_pct={stats_out['max_drawdown_pct']} bars_used={len(c)}\n"
                        f"Now call post_backtest_result with these exact numbers, deterministic=true, "
                        f"rule_id={rule['id']!r}, timeframe={timeframe!r}."
                    )
        elif name == "get_ohlcv_data":
            pair = arguments["pair"].upper().replace("/","")
            interval = arguments.get("interval","1h")
            count = min(int(arguments.get("count", 300)), 5000)
            o, h, l, c, t = await _fetch_tv_bars(pair, interval, count=count)
            if not c:
                result = f"No data for {pair}."
            else:
                bars = [{"time": t[i], "open": o[i], "high": h[i], "low": l[i], "close": c[i]} for i in range(len(c))]
                result = (
                    f"{len(bars)} real bars for {pair}@{interval}. Latest 10:\ntime open high low close\n"
                    + "\n".join(f"{b['time']} {b['open']:.5f} {b['high']:.5f} {b['low']:.5f} {b['close']:.5f}" for b in bars[-10:])
                    + f"\n\nAll bars JSON:\n{json.dumps(bars)}"
                )
        elif name == "post_analysis_step":
            body = {"request_id":arguments["request_id"],"pair":arguments["pair"],"step":arguments["step"],"step_label":arguments.get("step_label",""),"drawings":arguments.get("drawings",[]),"summary":arguments.get("summary")}
            data = _post("/api/hermes/analysis", body)
            result = f"Step posted (id={data.get('id')})."
        elif name == "mark_request_fulfilled":
            _patch("/api/hermes/requests", {"id":arguments["request_id"],"status":"fulfilled"})
            result = f"Request {arguments['request_id']} marked fulfilled."
        elif name == "post_analysis_note":
            body = {"pair": arguments["pair"], "summary": arguments["summary"]}
            for k in ("request_id", "verdict"):
                if k in arguments:
                    body[k] = arguments[k]
            data = _post("/api/hermes/notes", body)
            result = f"Note posted (id={data.get('id')})."
        elif name == "post_trade_setup":
            body = {"pair": arguments["pair"], "direction": arguments["direction"],
                    "entry": arguments["entry"], "sl": arguments["sl"], "tp1": arguments["tp1"]}
            for k in ("request_id", "tp2", "tp3", "rr", "rationale", "order_type"):
                if k in arguments:
                    body[k] = arguments[k]
            data = _post("/api/hermes/setups", body)
            result = (f"Trade setup posted (id={data.get('id')}). "
                      f"Entry={arguments['entry']} SL={arguments['sl']} TP1={arguments['tp1']} "
                      f"direction={arguments['direction']} order_type={arguments.get('order_type','(unspecified)')}. "
                      f"Levels are now drawn on the chart.")
        elif name == "post_backtest_result":
            body = {"pair": arguments["pair"], "period_description": arguments["period_description"],
                    "trades_analyzed": arguments["trades_analyzed"], "wins": arguments["wins"],
                    "losses": arguments["losses"], "narrative": arguments["narrative"]}
            for k in ("request_id", "deterministic", "rule_id", "timeframe", "max_drawdown_pct", "avg_rr", "bars_used"):
                if k in arguments:
                    body[k] = arguments[k]
            data = _post("/api/hermes/backtests", body)
            wr = (arguments["wins"] / arguments["trades_analyzed"] * 100) if arguments["trades_analyzed"] else 0
            result = f"Backtest result posted (id={data.get('id')}). Win rate {wr:.0f}% ({arguments['wins']}/{arguments['trades_analyzed']})."

        else:
            result = f"Unknown tool: {name}"
    except httpx.HTTPStatusError as e:
        result = f"API error {e.response.status_code}: {e.response.text[:400]}"
    except Exception as e:
        result = f"Error: {e}"
    return [TextContent(type="text", text=result)]

async def main():
    async with stdio_server() as (r, w):
        await server.run(r, w, server.create_initialization_options())

if __name__ == "__main__":
    import asyncio; asyncio.run(main())
