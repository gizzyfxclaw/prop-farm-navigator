import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";

interface NewsItem {
  headline: string;
  source: string;
  datetime: number;
  url: string;
  impact: "low" | "medium" | "high";
  currency: string;
  pairs: string[];
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

const HIGH_IMPACT_KEYWORDS = [
  "non-farm", "nfp", "payroll", "employment", "unemployment", "jobs report",
  "interest rate", "rate decision", "rate hike", "rate cut", "fed", "fomc",
  "ecb", "boe", "boj", "rba", "rbnz", "boc", "snb",
  "gdp", "gross domestic product",
  "cpi", "inflation", "consumer price", "producer price", "ppi",
  "retail sales", "industrial production", "manufacturing pmi", "services pmi",
  "trade balance", "current account",
  "consumer confidence", "business confidence", "zing", "ism",
  "housing starts", "building permits", "existing home sales", "new home sales",
  "durable goods", "factory orders",
  "central bank", "monetary policy", "quantitative easing", "qe",
];

function detectImpact(headline: string): "low" | "medium" | "high" {
  const lower = headline.toLowerCase();
  for (const keyword of HIGH_IMPACT_KEYWORDS) {
    if (lower.includes(keyword)) return "high";
  }
  return "medium";
}

function detectCurrency(headline: string): string {
  const lower = headline.toLowerCase();
  if (lower.includes("euro") || lower.includes("eur") || lower.includes("ecb")) return "EU";
  if (lower.includes("pound") || lower.includes("sterling") || lower.includes("gbp") || lower.includes("boe")) return "GB";
  if (lower.includes("yen") || lower.includes("jpy") || lower.includes("boj")) return "JP";
  if (lower.includes("aussie") || lower.includes("aud") || lower.includes("rba")) return "AU";
  if (lower.includes("kiwi") || lower.includes("nzd") || lower.includes("rbnz")) return "NZ";
  if (lower.includes("loonie") || lower.includes("cad") || lower.includes("boc")) return "CA";
  if (lower.includes("franc") || lower.includes("chf") || lower.includes("snb")) return "CH";
  return "US";
}

const FOREX_KEYWORDS = [
  "forex", "fx", "currency", "currencies", "exchange rate",
  "dollar", "euro", "pound", "sterling", "yen", "franc",
  "fed", "federal reserve", "ecb", "boe", "boj", "rba", "rbnz", "boc", "snb",
  "interest rate", "rate decision", "rate hike", "rate cut",
  "gdp", "inflation", "cpi", "ppi", "payroll", "employment",
  "retail sales", "trade balance", "pmi", "consumer confidence",
  "oil", "crude", "gold", "commodities",
  "war", "geopolitical", "sanctions", "tariff",
];

function isForexRelevant(headline: string): boolean {
  const lower = headline.toLowerCase();
  return FOREX_KEYWORDS.some(k => lower.includes(k));
}

const IMPACT_STYLES = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const IMPACT_LABELS = {
  high: "HIGH",
  medium: "MED",
  low: "LOW",
};

const CURRENCY_FLAGS: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", JP: "🇯🇵", DE: "🇩🇪",
  FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", CA: "🇨🇦", AU: "🇦🇺",
  NZ: "🇳🇿", CH: "🇨🇭", CN: "🇨🇳", BR: "🇧🇷", IN: "🇮🇳",
  RU: "🇷🇺", ZA: "🇿🇦", MX: "🇲🇽", TR: "🇹🇷", KR: "🇰🇷",
};

const TRADED_PAIRS = ["EURUSD", "USDJPY", "GBPUSD"];

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Economic Calendar — GizzyFx" },
      { name: "description", content: "High-impact news events and slippage alerts." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const [events, setEvents] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/economic-events");
      const data = await res.json();
      setEvents(data.events ?? []);
      setError(null);
    } catch (err) {
      setError("Could not load events. Retrying...");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filtered = events.filter((e) => filter === "all" || e.impact === filter);
  const highImpact = events.filter((e) => e.impact === "high");
  const nextHigh = highImpact.length > 0 ? highImpact[0] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Economic Calendar</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            News events filtered to your pairs: EURUSD, USDJPY, GBPUSD
          </p>
        </div>
        <button
          onClick={fetchEvents}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      {nextHigh && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{CURRENCY_FLAGS[nextHigh.currency] ?? "🌍"}</span>
                <span className="text-sm font-semibold text-red-400">Next High-Impact Event</span>
              </div>
              <p className="mt-1 text-base font-bold text-foreground">{nextHigh.headline}</p>
              <p className="text-[12px] text-muted-foreground">
                {nextHigh.currency} · {nextHigh.source}
              </p>
              {nextHigh.pairs && (
                <p className="mt-1 text-[11px] text-amber-400">
                  Affects: {nextHigh.pairs.slice(0, 4).join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {(["all", "high", "medium", "low"] as const).map((level) => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              filter === level
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {level === "all" ? "All" : level === "high" ? "🔴 High" : level === "medium" ? "🟡 Med" : "🟢 Low"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="animate-pulse text-[13px] text-muted-foreground">Loading events...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-[13px] text-amber-400">
          {error}
          <button onClick={fetchEvents} className="ml-2 underline">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-[13px] text-muted-foreground">No upcoming events match your filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{CURRENCY_FLAGS[event.currency] ?? "🌍"}</span>
                <div>
                  <a href={event.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-foreground hover:underline">
                    {event.headline}
                  </a>
                  <p className="text-[11px] text-muted-foreground">
                    {event.currency} · {event.source}
                  </p>
                  {event.pairs && (
                    <p className="text-[10px] text-amber-400/80">
                      {event.pairs.slice(0, 4).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${IMPACT_STYLES[event.impact]}`}>
                {IMPACT_LABELS[event.impact]}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Slippage Avoidance Rules</h3>
        <ul className="space-y-1 text-[12px] text-muted-foreground">
          <li>• <strong className="text-red-400">NO pending orders</strong> ±30min before/after high-impact news</li>
          <li>• <strong className="text-amber-400">Avoid new entries</strong> ±15min before medium-impact news</li>
          <li>• <strong className="text-emerald-400">Low-impact events</strong> — safe to trade, minimal slippage</li>
          <li>• <strong className="text-foreground">Best liquidity:</strong> London/NY overlap (13:00-16:00 EST)</li>
        </ul>
      </div>
    </div>
  );
}
