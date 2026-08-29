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
