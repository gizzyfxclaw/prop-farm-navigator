// Shared tvremix fetching with fallback to Yahoo Finance

const TVREMIX_URL = "https://tvremix.xyz/api/mcp/v1";
const TV_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1D", "1w": "1W",
};

// Rate limiting state
let lastCallTime = 0;
const MIN_CALL_INTERVAL = 300;
const pendingRequests = new Map<string, Promise<Bar[] | null>>();

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function fetchBars(apiKey: string, pair: string, interval: string, count: number): Promise<Bar[] | null> {
  if (!apiKey) return null;
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
        Accept: "application/json",
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

  if (json.error || json.result?.isError) return null;

  let raw = json.result?.structuredContent?.bars;
  if (!Array.isArray(raw) && json.result?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse(json.result.content[0].text);
      if (Array.isArray(parsed.bars)) {
        raw = parsed.bars;
      }
    } catch {}
  }

  if (!Array.isArray(raw)) return null;
  return raw
    .filter((b: any) => b.t != null && b.o != null && b.h != null && b.l != null && b.c != null)
    .map((b: any) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }));
}

// Yahoo Finance fallback for forex and commodities data
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
  const symbol = YAHOO_SYMBOLS[pair] || `${pair}=X`;
  const yahooInterval = YAHOO_INTERVALS[interval] ?? "1h";

  const range = interval === "1m" || interval === "5m" ? "5d" :
                interval === "15m" || interval === "30m" ? "1mo" :
                interval === "1h" || interval === "4h" ? "3mo" : "1y";

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${yahooInterval}&range=${range}&includePrePost=false`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });

    if (!res.ok) return null;

    const json = await res.json() as any;
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
      if (timestamps[i] != null && opens[i] != null && highs[i] != null && lows[i] != null && closes[i] != null) {
        bars.push({
          time: timestamps[i]!, // In seconds (UNIX timestamp) to match tvremix
          open: opens[i]!,
          high: highs[i]!,
          low: lows[i]!,
          close: closes[i]!,
        });
      }
    }

    if (interval === "4h" && bars.length > 0) {
      // Aggregate 1h bars into 4h
      const grouped = new Map<number, Bar[]>();
      for (const b of bars) {
        const dt = new Date(b.time * 1000);
        const slotHour = Math.floor(dt.getUTCHours() / 4) * 4;
        dt.setUTCHours(slotHour, 0, 0, 0);
        const key = Math.floor(dt.getTime() / 1000);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(b);
      }
      const aggregated: Bar[] = [];
      for (const [time, chunk] of Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])) {
        if (chunk.length > 0) {
          aggregated.push({
            time,
            open: chunk[0]!.open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1]!.close,
          });
        }
      }
      return aggregated.slice(-count);
    }

    return bars.length > 0 ? bars.slice(-count) : null;
  } catch {
    return null;
  }
}

export async function fetchBarsWithRetry(apiKey: string, pair: string, interval: string, count: number): Promise<Bar[] | null> {
  const SAFE_LIMITS: Record<string, number> = {
    "1m": 2000, "5m": 2000, "15m": 2000, "30m": 2000,
    "1h": 2000, "4h": 500, "1d": 200, "1w": 100,
  };
  const safeLimit = SAFE_LIMITS[interval] ?? 2000;
  const startCount = Math.min(count, safeLimit);

  // 1. Try tvremix if apiKey is provided
  if (apiKey) {
    const bars = await fetchBars(apiKey, pair, interval, startCount);
    if (bars && bars.length > 0) return bars;
  }

  // 2. Fallback to Yahoo Finance (highly reliable)
  const yahooBars = await fetchBarsYahoo(pair, interval, startCount);
  if (yahooBars && yahooBars.length > 0) return yahooBars;

  return null;
}
