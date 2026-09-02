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

const CURRENCY_TO_PAIRS: Record<string, string[]> = {
  US: ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF"],
  EU: ["EURUSD", "EURJPY", "EURGBP", "EURAUD", "EURNZD", "EURCAD", "EURCHF"],
  GB: ["GBPUSD", "GBPJPY", "EURGBP", "GBPAUD", "GBPNZD", "GBPCAD", "GBPCHF"],
  JP: ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY"],
  AU: ["AUDUSD", "AUDJPY", "EURAUD", "GBPAUD", "AUDNZD", "AUDCAD", "AUDCHF"],
  NZ: ["NZDUSD", "NZDJPY", "EURNZD", "GBPNZD", "AUDNZD", "NZDCAD", "NZDCHF"],
  CA: ["USDCAD", "CADJPY", "EURCAD", "GBPCAD", "AUDCAD", "NZDCAD", "CADCHF"],
  CH: ["USDCHF", "EURCHF", "GBPCHF", "AUDCHF", "NZDCHF", "CADCHF", "CHFJPY"],
};

function getAffectedPairs(currency: string): string[] {
  return CURRENCY_TO_PAIRS[currency] ?? [];
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
          
          const pairs = getAffectedPairs(event.currency);

          try {
            await db.prepare(`
              INSERT OR IGNORE INTO economic_events 
              (event_name, country, currency, event_time, impact, actual, estimate, previous, source, pairs)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'finnhub_webhook', ?)
            `).bind(
              event.eventName,
              event.country ?? "",
              event.currency ?? "",
              event.eventTime,
              event.impact ?? "low",
              event.actual ?? null,
              event.estimate ?? null,
              event.previous ?? null,
              JSON.stringify(pairs),
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
