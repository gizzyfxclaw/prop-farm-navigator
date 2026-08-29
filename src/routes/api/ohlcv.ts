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

        const rangeMap: Record<string, string> = {
          "5m": "5d", "15m": "14d", "30m": "30d",
          "1h": "7d", "4h": "30d", "1d": "6mo", "1w": "1y",
        };
        const yahooIntervalMap: Record<string, string> = {
          "5m": "5m", "15m": "15m", "30m": "30m",
          "1h": "1h", "4h": "1h", "1d": "1d", "1w": "1d",
        };
        const range = rangeMap[interval] ?? "7d";
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

        // Aggregate daily bars into weekly candles (Yahoo has no forex 1w feed)
        if (interval === "1w") {
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

        return Response.json(
          { bars },
          { headers: { "Cache-Control": "public, max-age=60" } },
        );
      },
    },
  },
});
