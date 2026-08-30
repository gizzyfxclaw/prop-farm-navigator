import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * OHLCV data for the site's own chart.
 * GET /api/ohlcv?pair=EURUSD&interval=1h&limit=1500
 * Returns { bars: Array<{ time, open, high, low, close }> }
 *
 * Primary source: tvremix (real TradingView data via its MCP server) — the
 * same feed Hermes itself analyzes, so the chart the user sees and what
 * Hermes reasoned over actually match. Falls back to Yahoo Finance if
 * TVREMIX_API_KEY isn't configured yet or the tvremix call fails, so the
 * chart keeps working through the migration rather than breaking outright.
 */

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const TVREMIX_URL = "https://tvremix.xyz/api/mcp/v1";

// tvremix only knows FX pairs by this prefix; extend here if more symbols
// (XAUUSD, crypto, etc.) are ever added to src/lib/engine/pairs.ts.
function tvSymbol(pair: string): string {
  return `FX:${pair}`;
}

// Site intervals are lowercase; tvremix's day/week/month intervals are not.
const TV_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1D", "1w": "1W",
};

async function fetchFromTvremix(
  apiKey: string,
  pair: string,
  interval: string,
  count: number,
): Promise<Bar[] | null> {
  const tvInterval = TV_INTERVAL[interval] ?? "1h";
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
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_ohlcv",
          arguments: { symbol: tvSymbol(pair), interval: tvInterval, count },
        },
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
  const rawBars: Array<{ t: number; o: number; h: number; l: number; c: number }> | undefined =
    json.result?.structuredContent?.bars;
  if (!Array.isArray(rawBars)) return null;

  return rawBars
    .filter((b) => b.t != null && b.o != null && b.h != null && b.l != null && b.c != null)
    .map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }));
}

async function fetchFromYahoo(pair: string, interval: string): Promise<Bar[]> {
  const rangeMap: Record<string, string> = {
    "5m": "7d", "15m": "60d", "30m": "60d",
    "1h": "730d", "4h": "730d",
    "1d": "10y", "1w": "10y",
  };
  const yahooIntervalMap: Record<string, string> = {
    "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "4h": "1h", "1d": "1d", "1w": "1d",
  };
  const range = rangeMap[interval] ?? "730d";
  const yahooInterval = yahooIntervalMap[interval] ?? "1h";
  const symbol = `${pair}=X`;

  const yahooUrl =
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
    `?interval=${yahooInterval}&range=${range}&includePrePost=false`;

  const raw = await fetch(yahooUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GizzyFx-Terminal/1.0)",
      Accept: "application/json",
    },
  });
  if (!raw.ok) return [];

  const json = (await raw.json()) as any;
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const opens: number[] = q.open ?? [];
  const highs: number[] = q.high ?? [];
  const lows: number[] = q.low ?? [];
  const closes: number[] = q.close ?? [];

  let bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i];
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    if (time == null || open == null || high == null || low == null || close == null) continue;
    bars.push({ time, open, high, low, close });
  }

  const rollUp = (chunk: Bar[]): Bar | null => {
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) return null;
    return {
      time: first.time,
      open: first.open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: last.close,
    };
  };

  if (interval === "4h") {
    const grouped = new Map<number, Bar[]>();
    for (const b of bars) {
      const dt = new Date(b.time * 1000);
      const slotHour = Math.floor(dt.getUTCHours() / 4) * 4;
      dt.setUTCHours(slotHour, 0, 0, 0);
      const key = dt.getTime() / 1000;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(b);
    }
    const aggregated: Bar[] = [];
    for (const [time, chunk] of Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])) {
      const candle = rollUp(chunk);
      if (candle) aggregated.push({ ...candle, time });
    }
    bars = aggregated;
  }

  if (interval === "1w") {
    const weekly: Bar[] = [];
    let chunk: Bar[] = [];
    for (const b of bars) {
      const isWeekStart = new Date(b.time * 1000).getUTCDay() === 1;
      if (isWeekStart && chunk.length) {
        const rolled = rollUp(chunk);
        if (rolled) weekly.push(rolled);
        chunk = [];
      }
      chunk.push(b);
    }
    const tail = rollUp(chunk);
    if (tail) weekly.push(tail);
    bars = weekly;
  }

  return bars;
}

export const Route = createFileRoute("/api/ohlcv")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const pair = (url.searchParams.get("pair") ?? "EURUSD").toUpperCase().replace("/", "");
        const interval = url.searchParams.get("interval") ?? "1h";
        const limitParam = parseInt(url.searchParams.get("limit") ?? "0", 10);
        const count = limitParam > 0 ? Math.min(limitParam, 5000) : 1500;

        const apiKey = getCFEnv()?.TVREMIX_API_KEY;
        let bars: Bar[] | null = null;
        let source: "tvremix" | "yahoo" = "yahoo";

        if (apiKey) {
          bars = await fetchFromTvremix(apiKey, pair, interval, count);
          if (bars) source = "tvremix";
        }

        if (!bars) {
          try {
            bars = await fetchFromYahoo(pair, interval);
          } catch {
            return Response.json({ bars: [], error: "upstream fetch failed" }, { status: 502 });
          }
        }

        if (limitParam > 0) bars = bars.slice(-Math.min(limitParam, 5000));

        const cacheSeconds = interval === "1d" || interval === "1w" ? 3600 : 60;
        return Response.json(
          { bars, total: bars.length, interval, pair, source },
          { headers: { "Cache-Control": `public, max-age=${cacheSeconds}` } },
        );
      },
    },
  },
});
