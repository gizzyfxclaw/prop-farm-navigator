#!/usr/bin/env python3
"""
Strategy Analysis Queue Processor
Runs every 5 minutes via cron. Picks up pending analysis requests,
fetches market data, runs strategies, calls LLM, stores results.
"""

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone

# Add project root to path
sys.path.insert(0, '/home/ubuntu/prop-farm-navigator')

# Load environment
def load_env():
    """Load environment variables from .env files"""
    env_files = [
        '/home/ubuntu/.hermes/.env',
        '/opt/hermes-webui/.env',
        '/home/ubuntu/prop-farm-navigator/.env',
    ]
    for f in env_files:
        if os.path.exists(f):
            with open(f) as fh:
                for line in fh:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, val = line.split('=', 1)
                        os.environ.setdefault(key.strip(), val.strip())

load_env()

# Cloudflare API
CLOUDFLARE_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
ACCOUNT_ID = '5c7acb2743edc96105a600cf'
DATABASE_ID = 'prop-farm-navigator-db'

def d1_query(sql, params=None):
    """Execute D1 query via Cloudflare API"""
    import urllib.request
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query"
    data = {"sql": sql, "params": params or []}
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"D1 query failed: {e}")
        return None

def fetch_bars(pair, interval, count):
    """Fetch OHLCV bars from tvremix or Yahoo"""
    # Try tvremix first
    tvremix_key = os.environ.get('TVREMIX_API_KEY', '')
    if tvremix_key:
        bars = fetch_bars_tvremix(tvremix_key, pair, interval, count)
        if bars:
            return bars
    # Fallback to Yahoo
    return fetch_bars_yahoo(pair, interval, count)

def fetch_bars_tvremix(tvremix_key, pair, interval, count):
    """Fetch from tvremix"""
    import urllib.request
    url = "https://tvremix.xyz/api/mcp/v1"
    tv_interval = {"1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1D"}.get(interval, "1h")
    data = {
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "get_ohlcv", "arguments": {"symbol": f"OANDA:{pair}", "interval": tv_interval, "count": count}}
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {tvremix_key}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            if result.get('error'):
                return None
            raw = result.get('result', {}).get('structuredContent', {}).get('bars', [])
            if not raw:
                return None
            return [{"t": b["t"], "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"]} for b in raw[:count]]
    except Exception as e:
        print(f"tvremix fetch failed: {e}")
        return None

def fetch_bars_yahoo(pair, interval, count):
    """Fetch from Yahoo Finance"""
    import urllib.request
    symbols = {"EURUSD": "EURUSD=X", "USDJPY": "USDJPY=X", "GBPUSD": "GBPUSD=X", "AUDUSD": "AUDUSD=X", "USDCAD": "USDCAD=X", "NZDUSD": "NZDUSD=X", "USDCHF": "USDCHF=X", "XAUUSD": "GC=F"}
    yahoo_intervals = {"1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "1h", "1d": "1d"}
    symbol = symbols.get(pair, f"{pair}=X")
    yahoo_interval = yahoo_intervals.get(interval, "1h")
    # Calculate range
    mins = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "1d": 1440}.get(interval, 60)
    total_mins = count * mins
    if total_mins <= 60: rng = "1d"
    elif total_mins <= 240: rng = "5d"
    elif total_mins <= 720: rng = "1mo"
    elif total_mins <= 2160: rng = "3mo"
    elif total_mins <= 4320: rng = "6mo"
    else: rng = "1y"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval={yahoo_interval}&range={rng}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            json_data = json.loads(resp.read())
            result = json_data.get('chart', {}).get('result', [{}])[0]
            timestamps = result.get('timestamp', [])
            quotes = result.get('indicators', {}).get('quote', [{}])[0]
            bars = []
            for i, t in enumerate(timestamps):
                if quotes.get('open') and quotes['open'][i] is not None:
                    bars.append({"t": t * 1000, "o": quotes['open'][i], "h": quotes['high'][i], "l": quotes['low'][i], "c": quotes['close'][i]})
            return bars[:count] if bars else None
    except Exception as e:
        print(f"Yahoo fetch failed: {e}")
        return None

def call_llm(prompt):
    """Call Nous LLM with OpenRouter fallback"""
    # Try Nous first
    nous_key = os.environ.get('NOUS_API_KEY', '')
    if nous_key:
        result = call_nous(prompt, nous_key)
        if result:
            return result
    # Fallback to OpenRouter
    openrouter_key = os.environ.get('OPENROUTER_API_KEY', '')
    if openrouter_key:
        return call_openrouter(prompt, openrouter_key)
    return None

def call_nous(prompt, api_key):
    """Call Nous Research API"""
    import urllib.request
    url = "https://api.nousresearch.com/v1/chat/completions"
    data = {
        "model": "meituan/longcat-2.0:free",
        "messages": [
            {"role": "system", "content": "You are GizzyFx Co-Pilot, a professional trading analyst. Provide structured, honest analysis in JSON format."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 500,
    }
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return result.get('choices', [{}])[0].get('message', {}).get('content', '')
    except Exception as e:
        print(f"Nous call failed: {e}")
        return None

def call_openrouter(prompt, api_key):
    """Call OpenRouter API"""
    import urllib.request
    url = "https://openrouter.ai/api/v1/chat/completions"
    data = {
        "model": "meta-llama/llama-3.1-8b-instruct:free",
        "messages": [
            {"role": "system", "content": "You are GizzyFx Co-Pilot, a professional trading analyst. Provide structured, honest analysis in JSON format."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 500,
    }
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return result.get('choices', [{}])[0].get('message', {}).get('content', '')
    except Exception as e:
        print(f"OpenRouter call failed: {e}")
        return None

def process_queue():
    """Process pending analysis requests"""
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    
    # Get pending requests (oldest first, max 5 per run)
    result = d1_query(
        "SELECT * FROM strategy_analysis_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5"
    )
    
    if not result or not result.get('results'):
        return
    
    requests = result['results']
    print(f"Processing {len(requests)} queued analysis requests")
    
    for req in requests:
        req_id = req['id']
        req_type = req.get('type', 'strategy_analysis')
        
        # Mark as processing
        d1_query(
            "UPDATE strategy_analysis_queue SET status = 'processing', started_at = ? WHERE id = ?",
            [now, req_id]
        )
        
        try:
            if req_type == 'strategy_analysis':
                result_data = process_strategy_analysis(req)
            elif req_type == 'pine_script_analysis':
                result_data = process_pine_script_analysis(req)
            else:
                result_data = {"error": f"Unknown type: {req_type}"}
            
            # Store result
            d1_query(
                "UPDATE strategy_analysis_queue SET status = 'fulfilled', result = ?, fulfilled_at = ? WHERE id = ?",
                [json.dumps(result_data), now, req_id]
            )
            print(f"  ✓ {req_id[:8]}... fulfilled")
            
        except Exception as e:
            print(f"  ✗ {req_id[:8]}... failed: {e}")
            d1_query(
                "UPDATE strategy_analysis_queue SET status = 'failed', error = ?, retry_count = retry_count + 1 WHERE id = ?",
                [str(e)[:500], req_id]
            )

def process_strategy_analysis(req):
    """Process a strategy analysis request"""
    strategy_id = req['strategy_id']
    pair = req.get('pair', 'EURUSD')
    interval = req.get('interval', '1h')
    bar_limit = req.get('bar_limit', 500)
    params = json.loads(req.get('params', '{}'))
    
    # Fetch bars
    bars = fetch_bars(pair, interval, bar_limit)
    if not bars:
        return {"error": "No market data available"}
    
    # Build prompt (simplified - just send data to LLM)
    last_bar = bars[-1]
    recent = bars[-10:]
    
    prompt = f"""You are GizzyFx Co-Pilot, a professional trading analyst. A strategy has been run against current market data. Provide:

1. SIGNAL — LONG, SHORT, or NEUTRAL based on current conditions
2. ENTRY — Exact price level for entry (5 decimal places)
3. STOP_LOSS — Exact price level for stop loss (5 decimal places)
4. TAKE_PROFIT_1 — First target price (5 decimal places)
5. TAKE_PROFIT_2 — Second target price (5 decimal places)
6. CONFIDENCE — 0-100% based on setup quality
7. RATIONALE — One sentence explaining why this setup exists
8. RISK — One sentence on what invalidates this setup

Strategy: {strategy_id}
Pair: {pair}
Timeframe: {interval}
Last price: {last_bar['c']:.5f}

Current market data (last 10 bars):
{chr(10).join([f"O:{b['o']:.5f} H:{b['h']:.5f} L:{b['l']:.5f} C:{b['c']:.5f}" for b in recent])}

Respond in JSON format only:
{{"signal":"LONG|SHORT|NEUTRAL","entry":1.12345,"stopLoss":1.12000,"takeProfit1":1.13000,"takeProfit2":1.13500,"confidence":75,"rationale":"...","risk":"..."}}"""
    
    llm_response = call_llm(prompt)
    if not llm_response:
        return {"error": "LLM call failed"}
    
    # Parse JSON from response
    try:
        json_match = llm_response[llm_response.find('{'):llm_response.rfind('}')+1]
        analysis = json.loads(json_match)
        return {
            "strategy_id": strategy_id,
            "pair": pair,
            "interval": interval,
            "last_price": last_bar['c'],
            "analysis": analysis,
        }
    except:
        return {"raw_response": llm_response[:1000]}

def process_pine_script_analysis(req):
    """Process a pine script analysis request"""
    pine_script = req.get('pine_script', '')
    pair = req.get('pair', 'EURUSD')
    interval = req.get('interval', '1h')
    
    # Fetch bars
    bars = fetch_bars(pair, interval, 200)
    if not bars:
        return {"error": "No market data available"}
    
    last_bar = bars[-1]
    recent = bars[-20:]
    
    prompt = f"""You are GizzyFx Co-Pilot, a professional trading analyst and Pine Script expert. A user has pasted their Pine Script strategy code. Your job is:

1. EXPLAIN the strategy in plain English
2. IDENTIFY entry conditions
3. IDENTIFY stop loss logic
4. IDENTIFY take profit logic
5. READ the current market data and determine: is there a LONG, SHORT, or NEUTRAL signal right now?
6. ASSESS confidence (0-100%)
7. EXPLAIN the rationale
8. IDENTIFY what would invalidate this setup

Strategy Pine Script:
```pine
{pine_script}
```

Current Market Data ({pair} {interval}):
Last price: {last_bar['c']:.5f}
Last 20 bars:
{chr(10).join([f"Bar {i+1}: O:{b['o']:.5f} H:{b['h']:.5f} L:{b['l']:.5f} C:{b['c']:.5f}" for i, b in enumerate(recent)])}

Respond in JSON format only:
{{"summary":"Brief strategy description","entry_conditions":["condition 1","condition 2"],"stop_loss":"SL logic or price level","take_profit":["TP1 logic","TP2 logic"],"direction":"LONG|SHORT|NEUTRAL","confidence":75,"rationale":"Why this signal exists now","risk":"What invalidates this setup"}}"""
    
    llm_response = call_llm(prompt)
    if not llm_response:
        return {"error": "LLM call failed"}
    
    try:
        json_match = llm_response[llm_response.find('{'):llm_response.rfind('}')+1]
        return {"analysis": json.loads(json_match)}
    except:
        return {"raw_response": llm_response[:1000]}

if __name__ == '__main__':
    process_queue()
