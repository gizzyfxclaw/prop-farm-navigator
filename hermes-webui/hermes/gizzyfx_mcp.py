#!/usr/bin/env python3
import json, os, sys
try:
    import httpx
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import TextContent, Tool
except ImportError as e:
    print(f"Missing: {e}\nRun: pip install 'mcp>=1.28,<2' httpx", file=sys.stderr); sys.exit(1)

API_URL = os.environ.get("GIZZYFX_API_URL", "").rstrip("/")
API_KEY  = os.environ.get("GIZZYFX_API_KEY", "")
if not API_URL or not API_KEY:
    print("ERROR: Set GIZZYFX_API_URL and GIZZYFX_API_KEY", file=sys.stderr); sys.exit(1)

HEADERS = {"x-hermes-key": API_KEY, "Content-Type": "application/json"}

def _get(path, params=None):
    r = httpx.get(f"{API_URL}{path}", headers=HEADERS, params=params, timeout=15)
    r.raise_for_status(); return r.json()

def _post(path, body):
    r = httpx.post(f"{API_URL}{path}", headers=HEADERS, json=body, timeout=15)
    r.raise_for_status(); return r.json()

def _patch(path, body):
    r = httpx.patch(f"{API_URL}{path}", headers=HEADERS, json=body, timeout=15)
    r.raise_for_status(); return r.json()

def _get_public(path, params=None):
    r = httpx.get(f"{API_URL}{path}", params=params, timeout=15)
    r.raise_for_status(); return r.json()

server = Server("gizzyfx-trading-terminal")

TOOLS = [
    Tool(name="get_pending_requests", description="Poll GizzyFx for pending analysis requests from the user. Returns id, pair, note, created_at.", inputSchema={"type":"object","properties":{},"required":[]}),
    Tool(name="get_knowledge_docs", description="Fetch all strategy documents the user has taught. Read these before analysing any pair.", inputSchema={"type":"object","properties":{},"required":[]}),
    Tool(name="get_ohlcv_data", description="Fetch OHLCV candlestick data for a forex pair.", inputSchema={"type":"object","properties":{"pair":{"type":"string","description":"e.g. EURUSD"},"interval":{"type":"string","enum":["1h","1d"],"default":"1h"}},"required":["pair"]}),
    Tool(name="post_analysis_step", description="Post one analysis step with chart drawings. User sees drawings appear live. Call multiple times as you progress (step 0,1,2...). Drawing types: hline, trendline, zone, marker.", inputSchema={"type":"object","properties":{"request_id":{"type":"string"},"pair":{"type":"string"},"step":{"type":"integer"},"step_label":{"type":"string","description":"Short label shown live e.g. 'Identifying swing highs'"},"drawings":{"type":"array","items":{"type":"object"},"description":"Array of drawing objects. hline:{type,price,label,color,style}. trendline:{type,p1time,p1price,p2time,p2price,label,color}. zone:{type,topPrice,bottomPrice,label,color}. marker:{type,time,position,label,color,markerType}"},"summary":{"type":"string"}},"required":["request_id","pair","step","step_label"]}),
    Tool(name="mark_request_fulfilled", description="Mark a request done after posting all steps.", inputSchema={"type":"object","properties":{"request_id":{"type":"string"}},"required":["request_id"]}),
    Tool(name="post_analysis_note", description="Write a summary note to the Trading Agent log on the website.", inputSchema={"type":"object","properties":{"pair":{"type":"string"},"summary":{"type":"string"}},"required":["pair","summary"]}),
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
]

@server.list_tools()
async def list_tools(): return TOOLS

@server.call_tool()
async def call_tool(name, arguments):
    try:
        if name == "get_pending_requests":
            data = _get("/api/hermes/requests", {"status":"pending"})
            reqs = data.get("requests",[])
            result = "No pending requests." if not reqs else "\n".join([f"id={r['id']} pair={r['pair']} note={r.get('note','(none)')} created={r['created_at']}" for r in reqs])
        elif name == "get_knowledge_docs":
            data = _get("/api/hermes/knowledge")
            docs = data.get("docs",[])
            result = "No docs yet." if not docs else "\n\n".join([f"=== {d['title']} ===\n{d['content']}" for d in docs])
        elif name == "get_ohlcv_data":
            pair = arguments["pair"].upper().replace("/","")
            interval = arguments.get("interval","1h")
            data = _get_public("/api/ohlcv", {"pair":pair,"interval":interval})
            bars = data.get("bars",[])
            result = f"No data for {pair}." if not bars else f"{len(bars)} bars for {pair}@{interval}. Latest 10:\ntime open high low close\n" + "\n".join([f"{b['time']} {b['open']:.5f} {b['high']:.5f} {b['low']:.5f} {b['close']:.5f}" for b in bars[-10:]]) + f"\n\nAll bars JSON:\n{json.dumps(bars)}"
        elif name == "post_analysis_step":
            body = {"request_id":arguments["request_id"],"pair":arguments["pair"],"step":arguments["step"],"step_label":arguments.get("step_label",""),"drawings":arguments.get("drawings",[]),"summary":arguments.get("summary")}
            data = _post("/api/hermes/analysis", body)
            result = f"Step posted (id={data.get('id')})."
        elif name == "mark_request_fulfilled":
            _patch("/api/hermes/requests", {"id":arguments["request_id"],"status":"fulfilled"})
            result = f"Request {arguments['request_id']} marked fulfilled."
        elif name == "post_analysis_note":
            data = _post("/api/hermes/notes", {"pair":arguments["pair"],"summary":arguments["summary"]})
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
