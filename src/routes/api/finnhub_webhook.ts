import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

interface FinnhubEvent {
  eventName: string;
  country: string;
  currency: string;
  eventTime: string;
  impact: "low" | "medium" | "high";
  actual?: string;
  estimate?: string;
  previous?: string;
}

export const Route = createFileRoute("/api/finnhub_webhook")({
  server: {
    handlers: {
      async POST({ request }) {
        const env = getCFEnv();
        const db = env?.DB;
        if (!db) {
          return Response.json({ error: "DB not configured" }, { status: 500 });
        }

        // Verify webhook secret
        const secret = request.headers.get("X-Finnhub-Secret");
        const expectedSecret = env?.FINNHUB_WEBHOOK_SECRET;
        if (!secret || secret !== expectedSecret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let payload: { events?: FinnhubEvent[] } | FinnhubEvent;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const events = Array.isArray(payload) ? payload : payload.events ?? [payload];
        let inserted = 0;

        for (const event of events) {
          if (!event.eventName || !event.eventTime) continue;

          try {
            await db.prepare(`
              INSERT OR IGNORE INTO economic_events 
              (event_name, country, currency, event_time, impact, actual, estimate, previous, source)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'finnhub_webhook')
            `).bind(
              event.eventName,
              event.country ?? "",
              event.currency ?? "",
              event.eventTime,
              event.impact ?? "low",
              event.actual ?? null,
              event.estimate ?? null,
              event.previous ?? null,
            ).run();
            inserted++;
          } catch (err) {
            console.error("Failed to insert event:", err);
          }
        }

        return Response.json({ success: true, inserted, total: events.length });
      },
    },
  },
});
