import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";
import { fetchBarsWithRetry, type Bar } from "@/lib/tvremix";

/**
 * OHLCV data for the site's own chart.
 * GET /api/ohlcv?pair=EURUSD&interval=1h&limit=1500
 * Returns { bars: Array<{ time, open, high, low, close }> }
 *
 * Primary source: tvremix (real TradingView data via its MCP server).
 * Falls back to Yahoo Finance if TVREMIX_API_KEY isn't configured yet or fails.
 */

export const Route = createFileRoute("/api/ohlcv")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const pair = (url.searchParams.get("pair") ?? "EURUSD").toUpperCase().replace("/", "");
        const interval = url.searchParams.get("interval") ?? "1h";
        const limitParam = parseInt(url.searchParams.get("limit") ?? "0", 10);
        const count = limitParam > 0 ? Math.min(limitParam, 5000) : 1500;

        const apiKey = getCFEnv()?.TVREMIX_API_KEY ?? "";
        let bars = await fetchBarsWithRetry(apiKey, pair, interval, count);

        if (!bars || bars.length === 0) {
          return Response.json({ bars: [], error: "upstream fetch failed" }, { status: 502 });
        }

        if (limitParam > 0) bars = bars.slice(-Math.min(limitParam, 5000));

        const cacheSeconds = interval === "1d" || interval === "1w" ? 3600 : 60;
        return Response.json(
          { bars, total: bars.length, interval, pair },
          { headers: { "Cache-Control": `public, max-age=${cacheSeconds}` } },
        );
      },
    },
  },
});
