import { createFileRoute } from "@tanstack/react-router";
import { analyzeNewsEvent } from "@/lib/news-analyzer";

export const Route = createFileRoute("/api/hermes/analyze-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            event_id?: string;
            event_name?: string;
            currency?: string;
            impact?: string;
            actual?: string;
            forecast?: string;
            previous?: string;
          };

          const result = analyzeNewsEvent({
            event_name: body.event_name || "Economic Event",
            currency: body.currency || "USD",
            impact: (body.impact as "high" | "medium" | "low") || "high",
            actual: body.actual,
            forecast: body.forecast || "—",
            previous: body.previous || "—",
          });

          return Response.json(result);
        } catch (err: any) {
          const safeResult = analyzeNewsEvent({
            event_name: "Economic Event",
            currency: "USD",
            impact: "high",
            forecast: "—",
            previous: "—",
          });
          return Response.json(safeResult);
        }
      },
    },
  },
});
