// Shared tvremix fetching with rate limiting and caching

const TVREMIX_URL = "https://tvremix.xyz/api/mcp/v1";
const TV_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1D", "1w": "1W",
};

// Rate limiting state
let lastCallTime = 0;
const MIN_CALL_INTERVAL = 500;
const pendingRequests = new Map<string, Promise<any[] | null>>();
const rateLimitHistory: number[] = [];

function getRateLimitCooldown(): number {
  const now = Date.now();
  const recentLimits = rateLimitHistory.filter(t => now - t < 60000);
  if (recentLimits.length >= 3) {
    const backoff = Math.min(30 * Math.pow(2, recentLimits.length - 3), 300);
    return now + backoff * 1000;
  }
  return 0;
}

function recordRateLimit() {
  rateLimitHistory.push(Date.now());
  const now = Date.now();
  while (rateLimitHistory.length > 0 && now - rateLimitHistory[0]! > 60000) {
    rateLimitHistory.shift();
  }
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function fetchBars(apiKey: string, pair: string, interval: string, count: number): Promise<Bar[] | null> {
  const dedupKey = `${pair}-${interval}-${count}`;
  if (pendingRequests.has(dedupKey)) {
    return pendingRequests.get(dedupKey)!;
  }

  const promise = _fetchBarsInternal(apiKey, pair, interval, count);
  pendingRequests.set(dedupKey, promise);

  try {
    return await promise;
  } finally {
    pendingRequests.delete(dedupKey);
  }
}

async function _fetchBarsInternal(apiKey: string, pair: string, interval: string, count: number): Promise<Bar[] | null> {
  if (Date.now() < getRateLimitCooldown()) {
    return null;
  }

  const tvInterval = TV_INTERVAL[interval] ?? "1h";
  
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_CALL_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL - elapsed));
  }
  lastCallTime = Date.now();

  let res: Response;
  try {
    res = await fetch(TVREMIX_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "get_ohlcv", arguments: { symbol: `OANDA:${pair}`, interval: tvInterval, count } },
      }),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let json: any;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  if (json.error && typeof json.error === 'object' && json.error.message) {
    const msg = json.error.message;
    const retryMatch = msg.match(/retry after (\d+)s/i);
    if (retryMatch) {
      recordRateLimit();
      return null;
    }
  }

  if (json.error || json.result?.isError) return null;
  const raw = json.result?.structuredContent?.bars;
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((b: any) => b.t != null && b.o != null && b.h != null && b.l != null && b.c != null)
    .map((b: any) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }));
}

// Yahoo Finance fallback for forex data
const YAHOO_SYMBOLS: Record<string, string> = {
  "EURUSD": "EURUSD=X",
  "USDJPY": "USDJPY=X",
  "GBPUSD": "GBPUSD=X",
  "AUDUSD": "AUDUSD=X",
  "USDCAD": "USDCAD=X",
  "NZDUSD": "NZDUSD=X",
  "USDCHF": "USDCHF=X",
  "XAUUSD": "GC=F",  // Gold futures
};

const YAHOO_INTERVALS: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "1h", "1d": "1d", "1w": "1wk",
};

export async function fetchBarsYahoo(pair: string, interval: string, count: number): Promise<Bar[] | null> {
  const symbol = YAHOO_SYMBOLS[pair] || `${pair}=X`; // EURUSD=X format
  const yahooInterval = YAHOO_INTERVALS[interval] ?? "1h";
  
  // Calculate range based on count and interval
  const range = calculateYahooRange(count, yahooInterval);
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${yahooInterval}&range=${range}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    
    if (!res.ok) return null;
    
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const opens = quotes.open || [];
    const highs = quotes.high || [];
    const lows = quotes.low || [];
    const closes = quotes.close || [];
    
    const bars: Bar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (opens[i] != null && highs[i] != null && lows[i] != null && closes[i] != null) {
        bars.push({
          time: timestamps[i]! * 1000, // Convert to milliseconds
          open: opens[i]!,
          high: highs[i]!,
          low: lows[i]!,
          close: closes[i]!,
        });
      }
    }
    
    return bars.length > 0 ? bars : null;
  } catch {
    return null;
  }
}

function calculateYahooRange(count: number, interval: string): string {
  // Yahoo uses "range" parameter (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
  // We need to estimate the right range based on count and interval
  const minutes: Record<string, number> = {
    "1m": 1, "5m": 5, "15m": 15, "30m": 30,
    "1h": 60, "1d": 1440, "1wk": 10080,
  };
  const mins = minutes[interval] ?? 60;
  const totalMinutes = count * mins;
  
  if (totalMinutes <= 60) return "1d";
  if (totalMinutes <= 240) return "5d";
  if (totalMinutes <= 720) return "1mo";
  if (totalMinutes <= 2160) return "3mo";
  if (totalMinutes <= 4320) return "6mo";
  return "1y";
}

export async function fetchBarsWithRetry(apiKey: string, pair: string, interval: string, count: number): Promise<Bar[] | null> {
  const SAFE_LIMITS: Record<string, number> = {
    "1m": 2000, "5m": 2000, "15m": 2000, "30m": 2000,
    "1h": 2000, "4h": 500, "1d": 200, "1w": 100,
  };
  const safeLimit = SAFE_LIMITS[interval] ?? 2000;
  const startCount = Math.min(count, safeLimit);
  
  // Try tvremix first
  let bars = await fetchBars(apiKey, pair, interval, startCount);
  if (bars && bars.length > 0) return bars;
  
  // Retry with fewer bars
  const fallbackCounts = [100, 50, 30, 20, 10];
  for (const fallback of fallbackCounts) {
    if (fallback >= startCount) continue;
    bars = await fetchBars(apiKey, pair, interval, fallback);
    if (bars && bars.length > 0) return bars;
  }
  
  // Fallback to Yahoo Finance
  bars = await fetchBarsYahoo(pair, interval, count);
  if (bars && bars.length > 0) return bars;
  
  return null;
}
