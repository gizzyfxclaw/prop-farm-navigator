import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";

interface NewsItem {
  headline: string;
  source: string;
  datetime: number;
  url: string;
  impact: "high" | "medium" | "low";
  currency: string;
  pairs: string[];
  minutesUntil: number;
  hazardLevel: "critical" | "warning" | "caution" | "safe";
}

const IMPACT_COLORS = {
  high: "oklch(0.680 0.230 295 / 0.13)",
  medium: "oklch(0.680 0.230 295 / 0.13)",
  low: "oklch(0.680 0.230 295 / 0.13)",
};

const IMPACT_LABELS = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

const HAZARD_CRITICAL = "critical"; // < 30 min
const HAZARD_WARNING = "warning";   // 30 min - 2 hr
const HAZARD_CAUTION = "caution";   // 2-3 hr
const HAZARD_SAFE = "safe";         // > 3 hr

const CURRENCY_TO_PAIRS: Record<string, string[]> = {
  USD: ["EURUSD", "USDJPY", "GBPUSD"],
  EUR: ["EURUSD"],
  JPY: ["USDJPY"],
  GBP: ["GBPUSD"],
};

function detectCurrency(headline: string): string[] {
  const upper = headline.toUpperCase();
  const currencies: string[] = [];
  if (upper.includes("USD") || upper.includes("DOLLAR") || upper.includes("FED") || upper.includes("FOMC")) currencies.push("USD");
  if (upper.includes("EUR") || upper.includes("ECB")) currencies.push("EUR");
  if (upper.includes("JPY") || upper.includes("YEN") || upper.includes("BOJ")) currencies.push("JPY");
  if (upper.includes("GBP") || upper.includes("STERLING") || upper.includes("BOE")) currencies.push("GBP");
  if (currencies.length === 0) currencies.push("USD");
  return currencies;
}

function detectImpact(headline: string): "high" | "medium" | "low" {
  const upper = headline.toUpperCase();
  const high = ["NFP", "NON-FARM", "FOMC", "FED", "FEDERAL RESERVE", "CPI", "INFLATION", "GDP", "GROSS DOMESTIC", "PAYROLL", "INTEREST RATE", "RATE DECISION", "MONETARY POLICY", "PRESS CONFERENCE", "JEROME POWELL", "LAGARDE"];
  const medium = ["RETAIL SALES", "INDUSTRIAL PROD", "MANUFACTURING", "TRADE BALANCE", "CURRENT ACCOUNT", "UNEMPLOYMENT", "JOBS", "PMI", "SENTIMENT", "CONFIDENCE", "HOUSING", "BUILDING", "PERMITS", "NEW HOME"];
  if (high.some((k) => upper.includes(k))) return "high";
  if (medium.some((k) => upper.includes(k))) return "medium";
  return "low";
}

function classifyHazard(minutes: number, impact: "high" | "medium" | "low"): typeof HAZARD_CRITICAL | typeof HAZARD_WARNING | typeof HAZARD_CAUTION | typeof HAZARD_SAFE {
  if (impact === "high" && minutes <= 30) return HAZARD_CRITICAL;
  if (impact === "high" && minutes <= 120) return HAZARD_WARNING;
  if (impact === "high" && minutes <= 180) return HAZARD_CAUTION;
  if (impact === "medium" && minutes <= 30) return HAZARD_WARNING;
  if (impact === "medium" && minutes <= 120) return HAZARD_CAUTION;
  return HAZARD_SAFE;
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "NOW";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Economic Calendar — GizzyFx" },
      {
        name: "description",
        content: "Strategy-aware economic calendar with trade timing.",
      },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const [events, setEvents] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/economic-events?impact=all&hours=168");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const now = Math.floor(Date.now() / 1000);
      const items: NewsItem[] = (data.events || [])
        .map((e: any) => {
          const eTime = e.datetime || now;
          const minutesUntil = Math.max(0, Math.floor((eTime - now) / 60));
          const currency = e.currency || "USD";
          const pairs = e.pairs?.split(",").map((s: string) => s.trim()) || CURRENCY_TO_PAIRS[currency] || ["EURUSD", "USDJPY", "GBPUSD"];
          const impact = e.impact || detectImpact(e.event_name || e.headline || "");
          return {
            headline: e.event_name || e.headline || "Unknown",
            source: e.source || "Finnhub",
            datetime: eTime,
            url: e.url || "#",
            impact,
            currency,
            pairs,
            minutesUntil,
            hazardLevel: classifyHazard(minutesUntil, impact),
          };
        })
        .sort((a: NewsItem, b: NewsItem) => a.datetime - b.datetime);
      setEvents(items);
      setLastFetch(new Date().toLocaleTimeString("en-GB"));
    } catch (err: any) {
      setError(err.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const id = setInterval(fetchEvents, 60000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  const critical = events.filter((e) => e.hazardLevel === HAZARD_CRITICAL);
  const warning = events.filter((e) => e.hazardLevel === HAZARD_WARNING);
  const caution = events.filter((e) => e.hazardLevel === HAZARD_CAUTION);
  const safe = events.filter((e) => e.hazardLevel === HAZARD_SAFE);

  const tradingBlocked = critical.length > 0 || warning.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Economic Calendar</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Strategy-aware trade timing based on news events and their impact.
          </p>
        </div>
        <div className="flex gap-2">
          {lastFetch && (
            <span className="text-[10px] text-muted-foreground self-center">Updated {lastFetch}</span>
          )}
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="h-9 rounded-lg border border-white/10 bg-white/5 px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Trading Status Banner */}
      {tradingBlocked ? (
        <div
          className="rounded-xl p-4 text-center"
          style={{
            background: "oklch(0.680 0.230 295 / 0.13)",
            border: "1px solid oklch(0.680 0.230 295 / 0.25)",
          }}
        >
          <div className="text-lg font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>
            ⚠️ TRADING HAZARD — AVOID NEW ENTRIES
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            High-impact news within 2 hours. Wait for the event to pass before entering trades.
          </p>
        </div>
      ) : caution.length > 0 ? (
        <div
          className="rounded-xl p-4 text-center"
          style={{
            background: "oklch(0.680 0.230 295 / 0.08)",
            border: "1px solid oklch(0.680 0.230 295 / 0.15)",
          }}
        >
          <div className="text-lg font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>
            ⚡ CAUTION — NEWS WITHIN 2-3 HOURS
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            News events approaching. Avoid new entries for the next 2-3 hours.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl p-4 text-center"
          style={{
            background: "oklch(0.680 0.230 295 / 0.08)",
            border: "1px solid oklch(0.680 0.230 295 / 0.15)",
          }}
        >
          <div className="text-lg font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>
            ✅ SAFE TO TRADE
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            No high-impact news in the next 3 hours. Follow your strategy rules.
          </p>
        </div>
      )}

      {/* Alert Summary */}
      {events.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.13)" }}>
            <div className="text-xl font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>{critical.length}</div>
            <div className="text-[11px] text-muted-foreground">CRITICAL</div>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.13)" }}>
            <div className="text-xl font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>{warning.length}</div>
            <div className="text-[11px] text-muted-foreground">WARNING</div>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.13)" }}>
            <div className="text-xl font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>{caution.length}</div>
            <div className="text-[11px] text-muted-foreground">CAUTION</div>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.13)" }}>
            <div className="text-xl font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>{safe.length}</div>
            <div className="text-[11px] text-muted-foreground">SAFE</div>
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="space-y-2">
        {loading && events.length === 0 ? (
          <div className="rounded-xl p-8 text-center text-[13px] text-muted-foreground">Loading events…</div>
        ) : error ? (
          <div className="rounded-xl p-8 text-center text-[13px]" style={{ color: "oklch(0.680 0.230 295)" }}>
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl p-8 text-center text-[13px] text-muted-foreground">
            No upcoming events match your filter.
          </div>
        ) : (
          events.map((event, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl p-3"
              style={{
                background: "oklch(0.680 0.230 295 / 0.05)",
                border: `1px solid ${IMPACT_COLORS[event.impact]}`,
              }}
            >
              <div className="min-w-[60px] text-center">
                <div className="text-sm font-bold text-foreground">{formatCountdown(event.minutesUntil)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(event.datetime * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-medium text-foreground hover:text-cyan-400"
                >
                  {event.headline}
                </a>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: event.impact === "high" ? "oklch(0.680 0.230 295 / 0.2)" : "oklch(0.680 0.230 295 / 0.1)",
                      color: event.impact === "high" ? "oklch(0.680 0.230 295)" : "oklch(0.680 0.230 295)",
                    }}
                  >
                    {IMPACT_LABELS[event.impact]}
                  </span>
                  {event.pairs.map((p) => (
                    <span key={p} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {p}
                    </span>
                  ))}
                  <span className="text-[10px] text-muted-foreground">{event.source}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Strategy Rules */}
      <div
        className="rounded-xl p-4"
        style={{
          background: "oklch(0.680 0.230 295 / 0.05)",
          border: "1px solid oklch(0.680 0.230 295 / 0.13)",
        }}
      >
        <h3 className="text-sm font-semibold text-foreground mb-2">Strategy Rules</h3>
        <ul className="space-y-1 text-[12px] text-muted-foreground">
          <li>• <strong className="text-foreground">No pending orders</strong> ±30 min before/after HIGH impact news</li>
          <li>• <strong className="text-foreground">Avoid new entries</strong> ±2-3 hours before HIGH impact events</li>
          <li>• <strong className="text-foreground">Vary entry times:</strong> 08:13, 10:42, 14:05</li>
          <li>• <strong className="text-foreground">Vary SL pips:</strong> 28, 35, 22</li>
          <li>• <strong className="text-foreground">Best liquidity:</strong> London/NY overlap (13:00-16:00 EST)</li>
        </ul>
      </div>
    </div>
  );
}
