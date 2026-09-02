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

function getFlag(country: string): string {
  const flags: Record<string, string> = {
    US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", JP: "🇯🇵", DE: "🇩🇪",
    FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", CA: "🇨🇦", AU: "🇦🇺",
    NZ: "🇳🇿", CH: "🇨🇭", CN: "🇨🇳", BR: "🇧🇷", IN: "🇮🇳",
    RU: "🇷🇺", ZA: "🇿🇦", MX: "🇲🇽", TR: "🇹🇷", KR: "🇰🇷",
  };
  return flags[country] ?? "🌍";
}

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
  const [now, setNow] = useState(Date.now());

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
    const id = setInterval(fetchEvents, 60_000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const getTimeUntil = (timestamp: number) => {
    const diff = timestamp * 1000 - now;
    if (diff <= 0) return "LIVE";
    const hours = Math.floor(diff / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    const seconds = Math.floor((diff % 60_000) / 1000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const isSafeToTrade = (event: NewsItem) => {
    const timeUntil = event.datetime * 1000 - now;
    if (event.impact === "high" && timeUntil < 30 * 60 * 1000) return false;
    if (event.impact === "medium" && timeUntil < 15 * 60 * 1000) return false;
    return true;
  };

  const safeEvents = events.filter(isSafeToTrade);
  const dangerEvents = events.filter(e => !isSafeToTrade(e));

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

      {/* Next High-Impact Alert */}
      {dangerEvents.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{getFlag(dangerEvents[0].currency)}</span>
                <span className="text-sm font-semibold text-red-400">⚠️ Trading Hazard</span>
              </div>
              <p className="mt-1 text-base font-bold text-foreground">{dangerEvents[0].headline}</p>
              <p className="text-[12px] text-muted-foreground">
                {dangerEvents[0].currency} · {dangerEvents[0].source}
              </p>
              {dangerEvents[0].pairs && (
                <p className="mt-1 text-[11px] text-amber-400">
                  Affects: {dangerEvents[0].pairs.slice(0, 4).join(", ")}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">Countdown</div>
              <div className="text-lg font-bold text-red-400">{getTimeUntil(dangerEvents[0].datetime)}</div>
              <div className="text-[10px] text-red-400">AVOID TRADING</div>
            </div>
          </div>
        </div>
      )}

      {/* Safe to Trade */}
      {safeEvents.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <span className="text-sm font-semibold text-emerald-400">Safe to Trade</span>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {safeEvents.length} upcoming event{safeEvents.length > 1 ? "s" : ""} outside danger windows. No restrictions.
          </p>
        </div>
      )}

      {/* Events List */}
      <div className="space-y-2">
        {events.map((event, i) => {
          const safe = isSafeToTrade(event);
          return (
            <div
              key={i}
              className={`flex items-center justify-between rounded-xl border p-3 transition-colors ${
                safe ? "border-border bg-card hover:bg-muted/30" : "border-red-500/20 bg-red-500/5"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{getFlag(event.currency)}</span>
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
              <div className="flex items-center gap-3">
                <div className="w-16 text-right">
                  <div className="text-[9px] text-muted-foreground">In</div>
                  <div className={`text-[12px] font-mono ${safe ? "text-emerald-400" : "text-red-400"}`}>
                    {getTimeUntil(event.datetime)}
                  </div>
                </div>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                  event.impact === "high" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                  event.impact === "medium" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                }`}>
                  {event.impact === "high" ? "HIGH" : event.impact === "medium" ? "MED" : "LOW"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trading Rules */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Strategy Rules</h3>
        <ul className="space-y-1 text-[12px] text-muted-foreground">
          <li>• <strong className="text-red-400">HIGH impact:</strong> No pending orders ±30min · Avoid new entries</li>
          <li>• <strong className="text-amber-400">MEDIUM impact:</strong> Avoid new entries ±15min</li>
          <li>• <strong className="text-emerald-400">LOW impact:</strong> Safe to trade</li>
          <li>• <strong className="text-foreground">Best liquidity:</strong> London/NY overlap (13:00-16:00 EST)</li>
          <li>• <strong className="text-foreground">Vary entry times:</strong> 08:13, 10:42, 14:05</li>
          <li>• <strong className="text-foreground">Vary SL pips:</strong> 28, 35, 22</li>
        </ul>
      </div>
    </div>
  );
}
