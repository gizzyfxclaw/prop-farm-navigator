import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";

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

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Economic Calendar — GizzyFx" },
      { name: "description", content: "High-impact news events and slippage alerts." },
    ],
  }),
  component: CalendarPage,
});

function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return <span className="text-red-400 font-bold animate-pulse">LIVE</span>;

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  if (hours < 1) return <span className="text-amber-400 font-mono font-bold">{minutes}m {seconds.toString().padStart(2, "0")}s</span>;
  if (hours < 24) return <span className="text-emerald-400 font-mono">{hours}h {minutes}m</span>;
  return <span className="text-muted-foreground font-mono">{Math.floor(hours / 24)}d {hours % 24}h</span>;
}

function CalendarPage() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/economic-events");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEvents(data.events ?? []);
      setLastFetch(new Date().toLocaleTimeString());
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

  const filtered = events.filter((e) => filter === "all" || e.impact === filter);
  const highImpact = events.filter((e) => e.impact === "high");
  const nextHigh = highImpact.length > 0 ? highImpact[0] : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Economic Calendar</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            News events that cause slippage — trade around them, not into them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastFetch && (
            <span className="text-[10px] text-muted-foreground">Updated {lastFetch}</span>
          )}
          <button
            onClick={fetchEvents}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Next High-Impact Alert */}
      {nextHigh && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{CURRENCY_FLAGS[nextHigh.country] ?? "🌍"}</span>
                <span className="text-sm font-semibold text-red-400">Next High-Impact Event</span>
              </div>
              <p className="mt-1 text-base font-bold text-foreground">{nextHigh.event_name}</p>
              <p className="text-[12px] text-muted-foreground">
                {nextHigh.country} · {nextHigh.currency} · {new Date(nextHigh.event_time).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">Countdown</div>
              <div className="text-lg font-bold"><Countdown target={nextHigh.event_time} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Impact Filter */}
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

      {/* Events Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="animate-pulse text-[13px] text-muted-foreground">Loading events...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-[13px] text-amber-400">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-[13px] text-muted-foreground">No upcoming events match your filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{CURRENCY_FLAGS[event.country] ?? "🌍"}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{event.event_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {event.country} · {event.currency} · {new Date(event.event_time).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {event.actual && (
                  <div className="text-right">
                    <div className="text-[9px] text-muted-foreground">Actual</div>
                    <div className="text-[12px] font-mono text-foreground">{event.actual}</div>
                  </div>
                )}
                {event.estimate && (
                  <div className="text-right">
                    <div className="text-[9px] text-muted-foreground">Estimate</div>
                    <div className="text-[12px] text-muted-foreground">{event.estimate}</div>
                  </div>
                )}
                <div className="w-16 text-right">
                  <div className="text-[9px] text-muted-foreground">In</div>
                  <div className="text-[12px]"><Countdown target={event.event_time} /></div>
                </div>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${IMPACT_STYLES[event.impact]}`}>
                  {IMPACT_LABELS[event.impact]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trading Rules Reminder */}
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
