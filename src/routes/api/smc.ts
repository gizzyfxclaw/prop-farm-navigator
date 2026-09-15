import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";
import { summarizeSMC } from "@/lib/smc-engine";
import { fetchBarsWithRetry } from "@/lib/tvremix";

/**
 * SMC analysis endpoint.
 * GET /api/smc?pair=EURUSD&interval=1h&limit=300
 * Returns full SMC summary + raw bars for client-side charting.
 */

export const Route = createFileRoute("/api/smc")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const pair = (url.searchParams.get("pair") ?? "EURUSD").toUpperCase().replace("/", "");
        const interval = url.searchParams.get("interval") ?? "1h";
        const limitParam = parseInt(url.searchParams.get("limit") ?? "0", 10);
        const count = limitParam > 0 ? Math.min(limitParam, 5000) : 300;

        const apiKey = getCFEnv()?.TVREMIX_API_KEY ?? "";
        const bars = await fetchBarsWithRetry(apiKey, pair, interval, count);
        if (!bars || bars.length === 0) {
          return Response.json(
            { error: "no data from upstream" },
            { status: 502 }
          );
        }

        const result = summarizeSMC(bars);

        return Response.json(
          { ...result, pair, interval, barCount: bars.length, bars },
          { headers: { "Cache-Control": "public, max-age=60" } }
        );
      },
    },
  },
});
