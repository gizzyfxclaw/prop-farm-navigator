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

        const range = interval === "1d" ? "3mo" : interval === "4h" ? "20d" : "7d";
        const yahooInterval = interval === "4h" ? "1h" : interval;
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

        const bars = timestamps
          .map((t, i) => ({
            time: t,
            open: opens[i],
            high: highs[i],
            low: lows[i],
            close: closes[i],
          }))
          .filter((b) => b.open != null && b.close != null);

        return Response.json(
          { bars },
          { headers: { "Cache-Control": "public, max-age=60" } },
        );
      },
    },
  },
});
