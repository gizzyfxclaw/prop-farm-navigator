import { createFileRoute } from "@tanstack/react-router";

interface RawEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  importance: number;
  date: string;
  actual: string;
  previous: string;
  forecast: string;
}

interface ProcessedEvent {
  id: string;
  time: string;
  country: string;
  currency: string;
  impact: "high" | "medium" | "low";
  event: string;
  actual: string;
  forecast: string;
  previous: string;
  datetime: number;
  pairs: string[];
}

const CURRENCY_TO_PAIRS: Record<string, string[]> = {
  USD: ["EURUSD", "USDJPY", "GBPUSD"],
  EUR: ["EURUSD"],
  GBP: ["GBPUSD"],
  JPY: ["USDJPY"],
  CAD: ["USDCAD"],
  AUD: ["AUDUSD"],
  NZD: ["NZDUSD"],
  CHF: ["USDCHF"],
};

function getPairs(currency: string): string[] {
  return CURRENCY_TO_PAIRS[currency] || ["EURUSD", "USDJPY", "GBPUSD"];
}

// TradingView importance: -1 = low, 0 = medium, 1 = high
function mapImportance(imp: number): "high" | "medium" | "low" {
  if (imp >= 1) return "high";
  if (imp === 0) return "medium";
  return "low";
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      async GET() {
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 7);

        const fromStr = from.toISOString().slice(0, 10);
        const toStr = to.toISOString().slice(0, 10);

        try {
          const tvUrl = `https://economic-calendar.tradingview.com/events?from=${fromStr}&to=${toStr}&countries=US,EU,GB,JP,CA,AU,NZ,CH`;
          const res = await fetch(tvUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Origin": "https://www.tradingview.com",
              "Referer": "https://www.tradingview.com/",
            },
          });

          if (!res.ok) throw new Error(`TV ${res.status}`);

          const data = await res.json();
          const events: ProcessedEvent[] = (data.result || [])
            .filter((e: RawEvent) => e.title && e.date)
            .map((e: RawEvent) => {
              const datetime = new Date(e.date).getTime() / 1000;
              return {
                id: e.id || `${e.date}-${e.title}`,
                time: e.date,
                country: e.country,
                currency: e.currency,
                impact: mapImportance(e.importance),
                event: e.title,
                actual: e.actual || "—",
                forecast: e.forecast || "—",
                previous: e.previous || "—",
                datetime,
                pairs: getPairs(e.currency),
              };
            })
            .filter((e: ProcessedEvent) => e.datetime > Date.now() / 1000 - 86400)
            .sort((a: ProcessedEvent, b: ProcessedEvent) => a.datetime - b.datetime);

          return Response.json({ events, count: events.length });
        } catch (err: any) {
          return Response.json({ events: [], error: "Failed to fetch events" });
        }
      },
    },
  },
});
