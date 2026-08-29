#!/usr/bin/env python3
"""
GizzyFx MCP Server — gives the Hermes agent tools to interact with the
prop-farm-navigator trading terminal (https://gizzyfxstrategy.dpdns.org).

Tools provided:
  get_pending_requests    — poll for new analysis requests from the user
  get_knowledge_docs      — fetch all strategy docs the user has taught
  get_ohlcv_data          — fetch OHLCV bars for a forex pair (no auth needed)
  post_analysis_step      — post one analysis step + drawings to the terminal
  mark_request_fulfilled  — mark a request complete after analysis is done
  post_analysis_note      — write a summary note to the agent analysis log
  post_trade_setup        — post entry, SL, and TP levels as a trade setup card
  save_strategy_from_chat — save a strategy discussed in chat as a knowledge doc
  save_strategy_rule      — codify a strategy as a structured rule for backtests
  request_backtest        — queue a backtest request for a strategy/pair
  update_understanding    — save a synthesised summary of all knowledge docs

Drawing JSON schema (for post_analysis_step):
  { "type": "hline",     "price": 1.0850, "label": "Weekly res", "color": "#ef4444", "style": "solid"|"dashed"|"dotted" }
  { "type": "trendline", "p1time": 1700000000, "p1price": 1.080, "p2time": 1700100000, "p2price": 1.090, "label": "BOS", "color": "#3b82f6" }
  { "type": "zone",      "topPrice": 1.0880, "bottomPrice": 1.0840, "label": "Bullish OB", "color": "#22c55e" }
  { "type": "marker",    "time": 1700050000, "position": "aboveBar"|"belowBar", "label": "Entry", "color": "#f59e0b", "markerType": "arrowUp"|"arrowDown"|"circle" }

Setup:
  pip install "mcp>=1.28,<2" httpx
  Configure in ~/.hermes/config.yaml (see hermes/config_snippet.yaml in the repo)

Environment variables:
  GIZZYFX_API_URL   — base URL of the trading terminal  (required)
  GIZZYFX_API_KEY   — x-hermes-key shared secret        (required)
"""

import json
import os
import sys

try:
    import httpx
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import TextContent, Tool
except ImportError as e:
    print(f"Missing dependency: {e}\nRun: pip install 'mcp>=1.28,<2' httpx", file=sys.stderr)
    sys.exit(1)

# ── Configuration ──────────────────────────────────────────────────────────
API_URL = os.environ.get("GIZZYFX_API_URL", "").rstrip("/")
API_KEY = os.environ.get("GIZZYFX_API_KEY", "")

if not API_URL or not API_KEY:
    print(
        "ERROR: Set GIZZYFX_API_URL and GIZZYFX_API_KEY environment variables.",
        file=sys.stderr,
    )
    sys.exit(1)

HEADERS = {"x-hermes-key": API_KEY, "Content-Type": "application/json"}

# ── HTTP helper ────────────────────────────────────────────────────────────

def _get(path: str, params: dict | None = None) -> dict:
    url = f"{API_URL}{path}"
    r = httpx.get(url, headers=HEADERS, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def _post(path: str, body: dict) -> dict:
    url = f"{API_URL}{path}"
    r = httpx.post(url, headers=HEADERS, json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _patch(path: str, body: dict) -> dict:
    url = f"{API_URL}{path}"
    r = httpx.patch(url, headers=HEADERS, json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _get_public(path: str, params: dict | None = None) -> dict:
    """OHLCV endpoint is public — no auth header."""
    url = f"{API_URL}{path}"
    r = httpx.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


# ── Tool definitions ───────────────────────────────────────────────────────

TOOLS: list[Tool] = [
    Tool(
        name="get_pending_requests",
        description=(
            "Poll the GizzyFx trading terminal for pending analysis requests from the user. "
            "Returns a list of requests with id, pair (e.g. EURUSD), note (user's instruction), "
            "and created_at. Process each request in order: fetch its OHLCV data, apply the "
            "taught strategy from get_knowledge_docs, then post analysis steps with drawings."
        ),
        inputSchema={"type": "object", "properties": {}, "required": []},
    ),
    Tool(
        name="get_knowledge_docs",
        description=(
            "Fetch all strategy documents the user has taught the Trading Agent. "
            "Each doc has a title and content (strategy text, rules, concepts). "
            "Read these before analysing any pair — they define what to look for."
        ),
        inputSchema={"type": "object", "properties": {}, "required": []},
    ),
    Tool(
        name="get_ohlcv_data",
        description=(
            "Fetch OHLCV (candlestick) data for a forex pair from the trading terminal. "
            "Use this to get the market data needed for technical analysis."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "pair": {
                    "type": "string",
                    "description": "Forex pair without slash, e.g. EURUSD, GBPUSD, USDJPY",
                },
                "interval": {
                    "type": "string",
                    "enum": ["1h", "1d"],
                    "description": "Candle interval. Use 1h for intraday, 1d for swing.",
                    "default": "1h",
                },
            },
            "required": ["pair"],
        },
    ),
    Tool(
        name="post_analysis_step",
        description=(
            "Post one step of your analysis back to the trading terminal. "
            "The user sees each step appear live on their chart as you work. "
            "Call this multiple times as you progress — once for structure identification, "
            "once for key levels, once for order blocks, etc. "
            "drawings is a list of drawing objects that render directly on the chart. "
            "step should increment with each call (0, 1, 2, …)."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "request_id": {"type": "string", "description": "The request id from get_pending_requests"},
                "pair": {"type": "string", "description": "e.g. EURUSD"},
                "step": {"type": "integer", "description": "Step number starting at 0"},
                "step_label": {
                    "type": "string",
                    "description": "Short label shown live in the chart header, e.g. 'Identifying swing highs'",
                },
                "drawings": {
                    "type": "array",
                    "description": (
                        "Chart drawings to render. Each object must have a 'type' field. "
                        "See module docstring for the full schema for hline/trendline/zone/marker."
                    ),
                    "items": {"type": "object"},
                },
                "summary": {
                    "type": "string",
                    "description": "Optional short summary shown next to this step in the log",
                },
            },
            "required": ["request_id", "pair", "step", "step_label"],
        },
    ),
    Tool(
        name="mark_request_fulfilled",
        description="Mark an analysis request as fulfilled once you have finished posting all steps.",
        inputSchema={
            "type": "object",
            "properties": {
                "request_id": {"type": "string", "description": "The request id to mark done"},
            },
            "required": ["request_id"],
        },
    ),
    Tool(
        name="post_analysis_note",
        description=(
            "Write a summary analysis note to the Trading Agent log visible on the website. "
            "Call this after mark_request_fulfilled to leave a human-readable conclusion."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "pair": {"type": "string", "description": "e.g. EURUSD"},
                "summary": {
                    "type": "string",
                    "description": "Full analysis summary — bias, key levels, recommended zones, next steps",
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
                "request_id": {
                    "type": "string",
                    "description": "The request id from get_pending_requests (optional but links the setup to the request)",
                },
                "pair": {"type": "string", "description": "e.g. EURUSD"},
                "direction": {
                    "type": "string",
                    "enum": ["long", "short"],
                    "description": "Trade direction based on your analysis bias",
                },
                "entry": {
                    "type": "number",
                    "description": "Entry price level",
                },
                "sl": {
                    "type": "number",
                    "description": "Stop loss price level",
                },
                "tp1": {
                    "type": "number",
                    "description": "First take profit level (mandatory)",
                },
                "tp2": {
                    "type": "number",
                    "description": "Second take profit level (optional)",
                },
                "tp3": {
                    "type": "number",
                    "description": "Third take profit level (optional)",
                },
                "rr": {
                    "type": "number",
                    "description": "Risk:reward ratio (optional — calculated automatically from entry/sl/tp1 if omitted)",
                },
                "rationale": {
                    "type": "string",
                    "description": "One or two sentences explaining why this setup is valid based on the strategy",
                },
            },
            "required": ["pair", "direction", "entry", "sl", "tp1"],
        },
    ),
    Tool(
        name="save_strategy_from_chat",
        description=(
            "Save a trading strategy that the user described in this chat as a knowledge document "
            "in the GizzyFx Trading Agent. Call this whenever the user explains, teaches, or describes "
            "a trading strategy, methodology, concept, or set of rules in the conversation. "
            "Distil what they said into a clear title and structured content, then call this tool "
            "to persist it. The user will see it immediately in their Trading Agent knowledge base."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short descriptive title, e.g. 'Order Block Breakout Strategy' or 'London Session Scalp Rules'",
                },
                "content": {
                    "type": "string",
                    "description": (
                        "Full structured write-up of the strategy. Include: "
                        "overview, market structure rules, entry conditions, stop loss rules, "
                        "take profit targets, timeframes, pairs, and any extra notes the user mentioned."
                    ),
                },
                "source": {
                    "type": "string",
                    "description": "Leave as 'hermes_chat' (default) to mark this as extracted from conversation.",
                    "default": "hermes_chat",
                },
            },
            "required": ["title", "content"],
        },
    ),
    Tool(
        name="save_strategy_rule",
        description=(
            "Codify a strategy discussed in chat as a structured rule that can be backtested "
            "by the GizzyFx deterministic engine. Call this after save_strategy_from_chat when "
            "the strategy has clear, machine-readable entry/exit conditions. "
            "Use entry_type='custom' with custom_rules for most chat-derived strategies "
            "(the LLM engine interprets the rules). Use the mechanical types (sma_cross, ema_cross, "
            "rsi, breakout) only when the strategy is explicitly indicator-based."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Rule name, e.g. 'OB Breakout Long'",
                },
                "direction": {
                    "type": "string",
                    "enum": ["long", "short", "both"],
                    "description": "Trade direction this rule applies to",
                },
                "entry_type": {
                    "type": "string",
                    "enum": ["sma_cross", "ema_cross", "rsi", "breakout", "custom"],
                    "description": "Use 'custom' for most chat-derived strategies.",
                },
                "entry_params": {
                    "type": "object",
                    "description": (
                        "Parameters for mechanical entry types. "
                        "sma_cross/ema_cross: {fast, slow}. rsi: {period, oversold, overbought}. "
                        "breakout: {lookback}. custom: {} (empty object)."
                    ),
                },
                "custom_rules": {
                    "type": "string",
                    "description": (
                        "Required when entry_type='custom'. Full plain-English description of entry rules "
                        "the LLM backtest engine will use to judge each trade: what must be true on the "
                        "chart before entering, confluences required, invalidation conditions."
                    ),
                },
                "sl_type": {
                    "type": "string",
                    "enum": ["atr", "fixed_pips"],
                    "description": "Stop loss calculation method. Use 'atr' for ATR-based, 'fixed_pips' for fixed pip distance.",
                },
                "sl_value": {
                    "type": "number",
                    "description": "ATR multiplier (e.g. 1.5) or fixed pips (e.g. 20)",
                },
                "tp_type": {
                    "type": "string",
                    "enum": ["rr_multiple", "fixed_pips"],
                    "description": "Take profit method. Use 'rr_multiple' for risk:reward ratio.",
                },
                "tp_value": {
                    "type": "number",
                    "description": "R:R ratio (e.g. 2.0 for 1:2) or fixed pips",
                },
                "default_timeframe": {
                    "type": "string",
                    "description": "e.g. '1h', '4h', '1d'",
                },
            },
            "required": ["title", "direction", "entry_type", "sl_type", "sl_value", "tp_type", "tp_value", "default_timeframe"],
        },
    ),
    Tool(
        name="request_backtest",
        description=(
            "Queue a backtest request in the GizzyFx terminal so the strategy just discussed "
            "gets backtested against real historical data. Call this after save_strategy_rule. "
            "The user will see the backtest appear in their Trading Agent tab and the results "
            "will populate once the engine runs."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "pair": {
                    "type": "string",
                    "description": "Forex pair to backtest, e.g. EURUSD, GBPUSD",
                },
                "note": {
                    "type": "string",
                    "description": "Brief description of what to backtest, e.g. 'OB breakout strategy from chat session'",
                },
                "timeframe": {
                    "type": "string",
                    "description": "Candle timeframe, e.g. '1h', '4h', '1d'",
                    "default": "1h",
                },
                "rule_id": {
                    "type": "string",
                    "description": "Optional: the id returned by save_strategy_rule to link the backtest to that rule",
                },
            },
            "required": ["pair", "note"],
        },
    ),
    Tool(
        name="update_understanding",
        description=(
            "Save an updated synthesised summary of everything the user has taught the Trading Agent "
            "across all knowledge docs. Call this after adding a new strategy doc to reflect the "
            "updated knowledge base. Include any contradictions between strategies you noticed."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": (
                        "Comprehensive plain-English synthesis of all strategy knowledge: "
                        "core methodology, key confluences, preferred pairs/sessions, "
                        "risk management rules, and overall trading philosophy."
                    ),
                },
                "contradictions": {
                    "type": "string",
                    "description": "Optional: any contradictions or conflicts found between the docs. Leave blank if none.",
                },
                "doc_count": {
                    "type": "integer",
                    "description": "Total number of knowledge documents currently in the knowledge base.",
                },
            },
            "required": ["summary", "doc_count"],
        },
    ),
]


# ── Server ─────────────────────────────────────────────────────────────────

server = Server("gizzyfx-trading-terminal")


@server.list_tools()
async def list_tools():
    return TOOLS


@server.call_tool()
async def call_tool(name: str, arguments: dict):
    try:
        if name == "get_pending_requests":
            data = _get("/api/hermes/requests", {"status": "pending"})
            requests = data.get("requests", [])
            if not requests:
                result = "No pending analysis requests."
            else:
                lines = [f"Found {len(requests)} pending request(s):"]
                for r in requests:
                    lines.append(
                        f"  id={r['id']}  pair={r['pair']}  "
                        f"note={r.get('note') or '(none)'}  created={r['created_at']}"
                    )
                result = "\n".join(lines)

        elif name == "get_knowledge_docs":
            data = _get("/api/hermes/knowledge")
            docs = data.get("docs", [])
            if not docs:
                result = "No knowledge documents found. The user has not taught any strategy yet."
            else:
                parts = [f"=== {d['title']} ===\n{d['content']}" for d in docs]
                result = "\n\n".join(parts)

        elif name == "get_ohlcv_data":
            pair = arguments["pair"].upper().replace("/", "")
            interval = arguments.get("interval", "1h")
            data = _get_public("/api/ohlcv", {"pair": pair, "interval": interval})
            bars = data.get("bars", [])
            if not bars:
                result = f"No OHLCV data returned for {pair} {interval}."
            else:
                latest = bars[-10:]  # last 10 bars for context
                lines = [f"OHLCV for {pair} @ {interval} — {len(bars)} bars total. Latest 10:"]
                lines.append("time(unix)  open       high       low        close")
                for b in latest:
                    lines.append(
                        f"{b['time']}  {b['open']:.5f}  {b['high']:.5f}  {b['low']:.5f}  {b['close']:.5f}"
                    )
                lines.append(f"\nFull bar list (all {len(bars)} bars):")
                lines.append(json.dumps(bars))
                result = "\n".join(lines)

        elif name == "post_analysis_step":
            body = {
                "request_id": arguments["request_id"],
                "pair": arguments["pair"],
                "step": arguments["step"],
                "step_label": arguments.get("step_label", ""),
                "drawings": arguments.get("drawings", []),
                "summary": arguments.get("summary"),
            }
            data = _post("/api/hermes/analysis", body)
            result = f"Step posted successfully (id={data.get('id')})."

        elif name == "mark_request_fulfilled":
            body = {"id": arguments["request_id"], "status": "fulfilled"}
            _patch("/api/hermes/requests", body)
            result = f"Request {arguments['request_id']} marked as fulfilled."

        elif name == "post_analysis_note":
            body = {"pair": arguments["pair"], "summary": arguments["summary"]}
            data = _post("/api/hermes/notes", body)
            result = f"Analysis note posted (id={data.get('id')})."

        elif name == "post_trade_setup":
            body = {
                "pair": arguments["pair"],
                "direction": arguments["direction"],
                "entry": arguments["entry"],
                "sl": arguments["sl"],
                "tp1": arguments["tp1"],
            }
            if "request_id" in arguments:
                body["request_id"] = arguments["request_id"]
            if "tp2" in arguments:
                body["tp2"] = arguments["tp2"]
            if "tp3" in arguments:
                body["tp3"] = arguments["tp3"]
            if "rr" in arguments:
                body["rr"] = arguments["rr"]
            if "rationale" in arguments:
                body["rationale"] = arguments["rationale"]
            data = _post("/api/hermes/setups", body)
            result = (
                f"Trade setup posted (id={data.get('id')}). "
                f"Entry={arguments['entry']} SL={arguments['sl']} TP1={arguments['tp1']} "
                f"direction={arguments['direction']}. Levels are now drawn on the chart."
            )

        elif name == "save_strategy_from_chat":
            body = {
                "title": arguments["title"],
                "content": arguments["content"],
                "source": arguments.get("source", "hermes_chat"),
            }
            data = _post("/api/hermes/knowledge", body)
            result = (
                f"Strategy saved to knowledge base (id={data.get('id')}). "
                f"Title: '{arguments['title']}'. "
                f"Visible immediately in the Trading Agent knowledge base on the site."
            )

        elif name == "save_strategy_rule":
            entry_type = arguments["entry_type"]
            body = {
                "title": arguments["title"],
                "direction": arguments["direction"],
                "entry_type": entry_type,
                "entry_params": arguments.get("entry_params", {}),
                "sl_type": arguments["sl_type"],
                "sl_value": arguments["sl_value"],
                "tp_type": arguments["tp_type"],
                "tp_value": arguments["tp_value"],
                "default_timeframe": arguments["default_timeframe"],
            }
            if "custom_rules" in arguments:
                body["custom_rules"] = arguments["custom_rules"]
            if "knowledge_doc_id" in arguments:
                body["knowledge_doc_id"] = arguments["knowledge_doc_id"]
            data = _post("/api/hermes/strategy-rules", body)
            result = (
                f"Strategy rule created (id={data.get('id')}). "
                f"Title: '{arguments['title']}' | direction={arguments['direction']} | "
                f"entry_type={entry_type} | tf={arguments['default_timeframe']}. "
                f"Use this id with request_backtest to queue a backtest."
            )

        elif name == "request_backtest":
            body = {
                "pair": arguments["pair"].upper().replace("/", ""),
                "note": arguments["note"],
                "request_type": "backtest",
                "timeframe": arguments.get("timeframe", "1h"),
            }
            if "rule_id" in arguments:
                body["rule_id"] = arguments["rule_id"]
            data = _post("/api/hermes/requests", body)
            result = (
                f"Backtest queued (id={data.get('id')}) for {body['pair']} @ {body['timeframe']}. "
                f"The user will see it in their Trading Agent tab. "
                f"Results will appear once the backtest engine processes it."
            )

        elif name == "update_understanding":
            body = {
                "summary": arguments["summary"],
                "doc_count": arguments["doc_count"],
            }
            if arguments.get("contradictions"):
                body["contradictions"] = arguments["contradictions"]
            data = _post("/api/hermes/understanding", body)
            result = (
                f"Knowledge synthesis updated (id={data.get('id')}). "
                f"Covers {arguments['doc_count']} doc(s). Visible in the Trading Agent tab."
            )

        else:
            result = f"Unknown tool: {name}"

    except httpx.HTTPStatusError as e:
        result = f"API error {e.response.status_code}: {e.response.text[:500]}"
    except Exception as e:
        result = f"Error: {e}"

    return [TextContent(type="text", text=result)]


# ── Entry point ────────────────────────────────────────────────────────────

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
