import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy OHLCV data from Yahoo Finance so the browser avoids CORS.
 * GET /api/ohlcv?pair=EURUSD&interval=1h
 * Returns { bars: Array<{ time, open, high, low, close }> }
 */
export const Route = createFileRoute("/api/ohlcv")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const pair = (url.searchParams.get("pair") ?? "EURUSD").toUpperCase().replace("/", "");
        const interval = url.searchParams.get("interval") ?? "1h";

        const limitParam = parseInt(url.searchParams.get("limit") ?? "0", 10);

        // Yahoo Finance max ranges per interval (forex pairs)
        const rangeMap: Record<string, string> = {
          "5m": "7d", "15m": "60d", "30m": "60d",
          "1h": "730d",  // up to 2 years of hourly data
          "4h": "730d",  // aggregate from 1h — same max range
          "1d": "10y",   // 10 years of daily data
          "1w": "10y",   // 10 years (aggregated from daily)
        };
        // 4h is not a native Yahoo interval — fetch 1h and aggregate
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

        let raw: Response;
        try {
          raw = await fetch(yahooUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; GizzyFx-Terminal/1.0)",
              Accept: "application/json",
            },
          });
        } catch (e) {
          return Response.json({ bars: [], error: "upstream fetch failed" }, { status: 502 });
        }

        if (!raw.ok) {
          return Response.json({ bars: [], error: `Yahoo returned ${raw.status}` }, { status: 502 });
        }

        let json: Record<string, unknown>;
        try {
          json = (await raw.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ bars: [], error: "invalid JSON from upstream" }, { status: 502 });
        }

        const result = (json as any)?.chart?.result?.[0];
        if (!result) return Response.json({ bars: [] });

        const timestamps: number[] = result.timestamp ?? [];
        const q = result.indicators?.quote?.[0] ?? {};
        const opens: number[] = q.open ?? [];
        const highs: number[] = q.high ?? [];
        const lows: number[] = q.low ?? [];
        const closes: number[] = q.close ?? [];

        interface Bar {
          time: number;
          open: number;
          high: number;
          low: number;
          close: number;
        }

        // Yahoo pads gaps with nulls; drop any candle that isn't fully populated
        // so downstream code can treat every OHLC value as a real number.
        let bars: Bar[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          const time = timestamps[i];
          const open = opens[i];
          const high = highs[i];
          const low = lows[i];
          const close = closes[i];
          if (
            time == null || open == null || high == null ||
            low == null || close == null
          ) {
            continue;
          }
          bars.push({ time, open, high, low, close });
        }

        // Helper to aggregate a chunk of bars into one candle
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

        // Aggregate 1h bars into 4h candles (slots at 0h, 4h, 8h, 12h, 16h, 20h UTC)
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

        // Aggregate daily bars into weekly candles (Yahoo has no forex 1w feed)
        if (interval === "1w") {
          const weekly: Bar[] = [];
          let chunk: Bar[] = [];
          for (const b of bars) {
            const isWeekStart = new Date(b.time * 1000).getUTCDay() === 1; // Monday
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

        // Apply limit if requested (0 = no limit, capped at 5000 max)
        if (limitParam > 0) {
          const cap = Math.min(limitParam, 5000);
          bars = bars.slice(-cap);
        }

        const totalBars = bars.length;
        const cacheSeconds = interval === "1d" || interval === "1w" ? 3600 : 60;

        return Response.json(
          { bars, total: totalBars, interval, pair },
          { headers: { "Cache-Control": `public, max-age=${cacheSeconds}` } },
        );
      },
    },
  },
});
