import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";
import { analyzeNewsEvent } from "@/lib/news-analyzer";

export const Route = createFileRoute("/api/hermes/analyze-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
            event_id?: string;
            event_name?: string;
            currency?: string;
            impact?: string;
            forecast?: string;
            previous?: string;
          };

          const result = analyzeNewsEvent({
            event_name: body.event_name || "Unknown Event",
            currency: body.currency || "USD",
            impact: (body.impact as "high" | "medium" | "low") || "medium",
            forecast: body.forecast || "—",
            previous: body.previous || "—",
          });

          return Response.json(result);
        } catch (err: any) {
          return Response.json({
            analysis: "Analysis unavailable. High-impact news typically causes spread widening.",
            direction: "UNKNOWN",
            confidence: 0,
            affected_pairs: [],
            spike_pips: "0",
            duration: "unknown",
          });
        }
      },
    },
  },
});
