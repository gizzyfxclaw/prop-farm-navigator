import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

interface EconomicEvent {
  id: number;
  event_name: string;
  country: string;
  currency: string;
  event_time: string;
  impact: "low" | "medium" | "high";
  actual: string | null;
  estimate: string | null;
  previous: string | null;
}

export const Route = createFileRoute("/api/economic_events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const impact = url.searchParams.get("impact") ?? "all";
        const hours = parseInt(url.searchParams.get("hours") ?? "168");

        const env = getCFEnv();
        const db = env?.DB;
        if (!db) {
          return Response.json({ error: "DB not configured" }, { status: 500 });
        }

        let sql = `SELECT * FROM economic_events WHERE event_time > datetime('now')`;
        const params: string[] = [];

        if (impact !== "all") {
          sql += ` AND impact = ?`;
          params.push(impact);
        }

        sql += ` AND event_time < datetime('now', '+${hours} hours')`;
        sql += ` ORDER BY event_time ASC`;

        try {
          const result = await db.prepare(sql).bind(...params).all<EconomicEvent>();
          return Response.json({
            events: result.results ?? [],
            count: result.results?.length ?? 0,
          });
        } catch (err) {
          return Response.json({ error: "DB query failed" }, { status: 500 });
        }
      },
    },
  },
});
