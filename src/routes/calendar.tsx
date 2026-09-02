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

interface SessionOverlap {
  label: string;
  start: string;
  end: string;
  active: boolean;
  minutesUntil: number;
}

const CURRENCY_TO_PAIRS: Record<string, string[]> = {
  US: ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF"],
  EU: ["EURUSD", "EURJPY", "EURGBP", "EURAUD", "EURNZD", "EURCAD", "EURCHF"],
  GB: ["GBPUSD", "GBPJPY", "EURGBP", "GBPAUD", "GBPNZD", "GBPCAD", "GBPCHF"],
  JP: ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY"],
  CA: ["USDCAD", "CADJPY", "EURCAD", "GBPCAD", "AUDCAD", "NZDCAD", "CADCHF"],
  AU: ["AUDUSD", "AUDJPY", "EURAUD", "GBPAUD", "AUDNZD", "AUDCAD", "AUDCHF"],
  NZ: ["NZDUSD", "NZDJPY", "EURNZD", "GBPNZD", "AUDNZD", "NZDCAD", "NZDCHF"],
  CH: ["USDCHF", "EURCHF", "GBPCHF", "AUDCHF", "NZDCHF", "CADCHF", "CHFJPY"],
};

const SESSIONS = [
  { label: "London/NY Overlap", start: "13:00", end: "16:00", tz: "EST", active: false },
  { label: "London Open", start: "03:00", end: "12:00", tz: "EST", active: false },
  { label: "NY Open", start: "08:00", end: "17:00", tz: "EST", active: false },
  { label: "Sydney/Tokyo", start: "19:00", end: "04:00", tz: "EST", active: false },
];

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

function detectImpact(headline: string): "high" | "medium" | "low" {
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

function classifyHazard(minutes: number, impact: "high" | "medium" | "low"): "critical" | "warning" | "caution" | "safe" {
  if (impact === "high" && minutes <= 30) return "critical";
  if (impact === "high" && minutes <= 120) return "warning";
  if (impact === "high" && minutes <= 180) return "caution";
  if (impact === "medium" && minutes <= 30) return "warning";
  if (impact === "medium" && minutes <= 120) return "caution";
  return "safe";
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "NOW";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function getSessionStatus(): SessionOverlap[] {
  const now = new Date();
  const estHour = now.getUTCHours() - 4;
  const estMin = now.getUTCMinutes();
  const estTotal = estHour * 60 + estMin;

  return SESSIONS.map((s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    const startTotal = sh! * 60 + sm!;
    const endTotal = eh! * 60 + em!;
    let active = false;
    if (startTotal < endTotal) {
      active = estTotal >= startTotal && estTotal < endTotal;
    } else {
      active = estTotal >= startTotal || estTotal < endTotal;
    }
    let minutesUntil = 0;
    if (!active) {
      if (estTotal < startTotal) {
        minutesUntil = startTotal - estTotal;
      } else {
        minutesUntil = 24 * 60 - estTotal + startTotal;
      }
    }
    return { ...s, active, minutesUntil };
  });
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
  const [sessions, setSessions] = useState<SessionOverlap[]>(getSessionStatus());
  const [now, setNow] = useState(new Date());

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/economic-events?impact=all&hours=168");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const nowSec = Math.floor(Date.now() / 1000);
      const items: NewsItem[] = (data.events || [])
        .map((e: any) => {
          const eTime = e.datetime || nowSec;
          const minutesUntil = Math.max(0, Math.floor((eTime - nowSec) / 60));
          const currency = e.currency || "USD";
          const pairs = e.pairs?.split(",").map((s: string) => s.trim()) || getAffectedPairs(currency);
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
    const id = setInterval(() => {
      fetchEvents();
      setSessions(getSessionStatus());
      setNow(new Date());
    }, 60000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  const critical = events.filter((e) => e.hazardLevel === "critical");
  const warning = events.filter((e) => e.hazardLevel === "warning");
  const caution = events.filter((e) => e.hazardLevel === "caution");
  const safe = events.filter((e) => e.hazardLevel === "safe");

  const tradingBlocked = critical.length > 0 || warning.length > 0;
  const tradingCaution = caution.length > 0 && !tradingBlocked;

  const activeSession = sessions.find((s) => s.active);
  const nextSession = sessions
    .filter((s) => !s.active && s.minutesUntil > 0)
    .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Economic Calendar</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Strategy-aware trade timing — protects you from news-driven slippage.
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

      {/* TRADING SAFETY BANNER */}
      {tradingBlocked ? (
        <div
          className="rounded-xl p-5 text-center animate-pulse"
          style={{
            background: "oklch(0.680 0.230 295 / 0.15)",
            border: "2px solid oklch(0.680 0.230 295 / 0.4)",
            boxShadow: "0 0 20px oklch(0.680 0.230 295 / 0.15)",
          }}
        >
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>
            🚫 DO NOT TRADE NOW
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground">
            High-impact news within 2 hours. Spreads will spike. Wait for the event to pass.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {critical.map((e, i) => (
              <span key={i} className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: "oklch(0.680 0.230 295 / 0.2)", color: "oklch(0.680 0.230 295)" }}>
                🔴 {e.headline.slice(0, 40)} ({formatCountdown(e.minutesUntil)})
              </span>
            ))}
            {warning.map((e, i) => (
              <span key={i} className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: "oklch(0.680 0.230 295 / 0.1)", color: "oklch(0.680 0.230 295)" }}>
                🟡 {e.headline.slice(0, 40)} ({formatCountdown(e.minutesUntil)})
              </span>
            ))}
          </div>
        </div>
      ) : tradingCaution ? (
        <div
          className="rounded-xl p-5 text-center"
          style={{
            background: "oklch(0.680 0.230 295 / 0.08)",
            border: "2px solid oklch(0.680 0.230 295 / 0.2)",
          }}
        >
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>
            ⚡ CAUTION — NEWS APPROACHING
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Events within 2-3 hours. Avoid new entries. Wait for the window to clear.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {caution.map((e, i) => (
              <span key={i} className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: "oklch(0.680 0.230 295 / 0.1)", color: "oklch(0.680 0.230 295)" }}>
                🟠 {e.headline.slice(0, 40)} ({formatCountdown(e.minutesUntil)})
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl p-5 text-center"
          style={{
            background: "oklch(0.680 0.230 295 / 0.05)",
            border: "2px solid oklch(0.680 0.230 295 / 0.1)",
          }}
        >
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>
            ✅ SAFE TO TRADE
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground">
            No high-impact news in the next 3 hours. Follow your strategy rules.
          </p>
        </div>
      )}

      {/* SESSION OVERLAP */}
      <div
        className="rounded-xl p-4"
        style={{
          background: "oklch(0.680 0.230 295 / 0.05)",
          border: "1px solid oklch(0.680 0.230 295 / 0.13)",
        }}
      >
        <h3 className="text-sm font-semibold text-foreground mb-3">Market Sessions (EST)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sessions.map((s) => (
            <div
              key={s.label}
              className="rounded-lg p-3 text-center"
              style={{
                background: s.active ? "oklch(0.680 0.230 295 / 0.15)" : "oklch(0.680 0.230 295 / 0.05)",
                border: s.active ? "1px solid oklch(0.680 0.230 295 / 0.3)" : "1px solid oklch(0.680 0.230 295 / 0.08)",
              }}
            >
              <div className="text-[11px] font-medium" style={{ color: s.active ? "oklch(0.680 0.230 295)" : "oklch(0.680 0.230 295)" }}>
                {s.label}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {s.start} - {s.end}
              </div>
              {s.active ? (
                <div className="mt-1 text-[10px] font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>
                  ● LIVE NOW
                </div>
              ) : (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  in {formatCountdown(s.minutesUntil)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ALERT SUMMARY */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.13)", border: "1px solid oklch(0.680 0.230 295 / 0.2)" }}>
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>{critical.length}</div>
          <div className="text-[11px] font-medium" style={{ color: "oklch(0.680 0.230 295)" }}>CRITICAL</div>
          <div className="text-[10px] text-muted-foreground">&lt;30min HIGH</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.08)", border: "1px solid oklch(0.680 0.230 295 / 0.15)" }}>
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>{warning.length}</div>
          <div className="text-[11px] font-medium" style={{ color: "oklch(0.680 0.230 295)" }}>WARNING</div>
          <div className="text-[10px] text-muted-foreground">30min-2hr HIGH</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.05)", border: "1px solid oklch(0.680 0.230 295 / 0.1)" }}>
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>{caution.length}</div>
          <div className="text-[11px] font-medium" style={{ color: "oklch(0.680 0.230 295)" }}>CAUTION</div>
          <div className="text-[10px] text-muted-foreground">2-3hr HIGH</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.03)", border: "1px solid oklch(0.680 0.230 295 / 0.08)" }}>
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>{safe.length}</div>
          <div className="text-[11px] font-medium" style={{ color: "oklch(0.680 0.230 295)" }}>SAFE</div>
          <div className="text-[10px] text-muted-foreground">&gt;3hr</div>
        </div>
      </div>

      {/* EVENTS LIST */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Upcoming Events</h3>
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
                background: event.hazardLevel === "critical" ? "oklch(0.680 0.230 295 / 0.1)" : "oklch(0.680 0.230 295 / 0.03)",
                border: `1px solid ${event.hazardLevel === "critical" ? "oklch(0.680 0.230 295 / 0.3)" : "oklch(0.680 0.230 295 / 0.08)"}`,
              }}
            >
              <div className="min-w-[70px] text-center">
                <div className="text-sm font-black" style={{ color: event.hazardLevel === "critical" ? "oklch(0.680 0.230 295)" : "oklch(0.680 0.230 295)" }}>
                  {formatCountdown(event.minutesUntil)}
                </div>
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
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: event.impact === "high" ? "oklch(0.680 0.230 295 / 0.2)" : "oklch(0.680 0.230 295 / 0.1)",
                      color: event.impact === "high" ? "oklch(0.680 0.230 295)" : "oklch(0.680 0.230 295)",
                    }}
                  >
                    {event.impact === "high" ? "🔴 HIGH" : event.impact === "medium" ? "🟡 MED" : "🟢 LOW"}
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

      {/* STRATEGY RULES */}
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
