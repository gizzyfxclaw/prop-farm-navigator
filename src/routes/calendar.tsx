import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";

/* ── Types ────────────────────────────────────────────────────── */

interface RawEvent {
  id: string;
  time: string;
  country: string;
  currency: string;
  impact: "high" | "medium" | "low";
  event: string;
  actual: string;
  forecast: string;
  previous: string;
  datetime: number; // unix seconds
  pairs: string[];
}

interface SessionOverlap {
  label: string;
  start: string;
  end: string;
  active: boolean;
  secondsUntil: number;
}

/* ── Constants ────────────────────────────────────────────────── */

const SESSIONS = [
  { label: "London/NY Overlap", start: "13:00", end: "16:00" },
  { label: "London Open", start: "03:00", end: "12:00" },
  { label: "NY Open", start: "08:00", end: "17:00" },
  { label: "Sydney/Tokyo", start: "19:00", end: "04:00" },
];

const API_REFRESH_MS = 120_000; // re-fetch from API every 2 min
const TICK_MS = 1_000;          // re-calculate everything every 1 second

/* ── Pure helpers (no state) ──────────────────────────────────── */

function classifyHazard(
  seconds: number,
  impact: "high" | "medium" | "low",
): "critical" | "warning" | "caution" | "safe" {
  if (seconds < 0) return "safe"; // past event
  const min = seconds / 60;
  if (impact === "high" && min <= 30) return "critical";
  if (impact === "high" && min <= 120) return "warning";
  if (impact === "high" && min <= 180) return "caution";
  if (impact === "medium" && min <= 30) return "warning";
  if (impact === "medium" && min <= 120) return "caution";
  return "safe";
}

/** Pretty countdown: "12m 34s", "2h 05m 12s", "45m ago", "NOW" */
function formatCountdown(totalSeconds: number): string {
  if (totalSeconds < -60) {
    const ago = Math.abs(totalSeconds);
    const h = Math.floor(ago / 3600);
    const m = Math.floor((ago % 3600) / 60);
    if (h > 0) return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
    return `${m}m ago`;
  }
  if (totalSeconds < 0) return "JUST NOW";
  if (totalSeconds === 0) return "NOW";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Session countdown — same format but no "ago" (sessions always wrap around) */
function formatSessionCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "LIVE";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function getEasternTime(): { hours: number; minutes: number; seconds: number; totalSeconds: number } {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etStr);
  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
  const seconds = etDate.getSeconds();
  return { hours, minutes, seconds, totalSeconds: hours * 3600 + minutes * 60 + seconds };
}

function computeSessions(): SessionOverlap[] {
  const { totalSeconds: etSec } = getEasternTime();

  return SESSIONS.map((s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    const startSec = sh! * 3600 + sm! * 60;
    const endSec = eh! * 3600 + em! * 60;

    let active: boolean;
    if (startSec < endSec) {
      active = etSec >= startSec && etSec < endSec;
    } else {
      // wraps midnight (e.g. Sydney/Tokyo 19:00–04:00)
      active = etSec >= startSec || etSec < endSec;
    }

    let secondsUntil = 0;
    if (!active) {
      if (etSec < startSec) {
        secondsUntil = startSec - etSec;
      } else {
        secondsUntil = 86400 - etSec + startSec;
      }
    }
    return { ...s, active, secondsUntil };
  });
}

/* ── Route ────────────────────────────────────────────────────── */

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Economic Calendar — GizzyFx" },
      { name: "description", content: "Strategy-aware economic calendar with real-time trade timing." },
    ],
  }),
  component: CalendarPage,
});

/* ── Component ────────────────────────────────────────────────── */

function CalendarPage() {
  // Raw events from the API (unix timestamps — stable across ticks)
  const rawEventsRef = useRef<RawEvent[]>([]);
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  // Tick counter — increments every second to force re-render
  const [tick, setTick] = useState(0);

  // ── Fetch from API ──
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events?days=7");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: RawEvent[] = (data.events || [])
        .filter((e: any) => e.time && e.event)
        .sort((a: RawEvent, b: RawEvent) => a.datetime - b.datetime);
      rawEventsRef.current = items;
      setRawEvents(items);
      setLastFetch(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Effects ──
  useEffect(() => {
    fetchEvents();

    // API refresh every 2 minutes
    const apiFetcher = setInterval(fetchEvents, API_REFRESH_MS);

    // Real-time tick every 1 second
    const ticker = setInterval(() => setTick((t) => t + 1), TICK_MS);

    return () => {
      clearInterval(apiFetcher);
      clearInterval(ticker);
    };
  }, [fetchEvents]);

  // ── Derived state — recalculated every tick (every second) ──
  const nowSec = Math.floor(Date.now() / 1000);

  const liveEvents = useMemo(() => {
    return rawEvents.map((e) => {
      const secondsUntil = Math.floor(e.datetime - nowSec);
      return {
        ...e,
        secondsUntil,
        hazardLevel: classifyHazard(secondsUntil, e.impact),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEvents, tick]);

  const sessions = useMemo(() => computeSessions(), [tick]);

  const liveClock = useMemo(() => {
    const et = getEasternTime();
    return `${String(et.hours).padStart(2, "0")}:${String(et.minutes).padStart(2, "0")}:${String(et.seconds).padStart(2, "0")} ET`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // ── Counts ──
  const critical = liveEvents.filter((e) => e.hazardLevel === "critical");
  const warning = liveEvents.filter((e) => e.hazardLevel === "warning");
  const caution = liveEvents.filter((e) => e.hazardLevel === "caution");
  const safe = liveEvents.filter((e) => e.hazardLevel === "safe");

  const tradingBlocked = critical.length > 0 || warning.length > 0;
  const tradingCaution = caution.length > 0 && !tradingBlocked;

  // Next event countdown for the header
  const nextEvent = liveEvents.find((e) => e.secondsUntil > 0);

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Economic Calendar</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Strategy-aware trade timing — protects you from news-driven slippage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* LIVE CLOCK */}
          <div className="flex flex-col items-end">
            <span className="font-mono text-[14px] font-bold tabular-nums" style={{ color: "oklch(0.680 0.230 295)" }}>
              {liveClock}
            </span>
            {lastFetch && (
              <span className="text-[9px] text-muted-foreground">API {lastFetch}</span>
            )}
          </div>
          {/* LIVE PULSE */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <div
                className="h-2 w-2 rounded-full animate-ping absolute"
                style={{ background: "oklch(0.680 0.230 295)", opacity: 0.4 }}
              />
              <div
                className="h-2 w-2 rounded-full relative"
                style={{ background: "oklch(0.680 0.230 295)" }}
              />
            </div>
            <span className="text-[10px] font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>LIVE</span>
          </div>
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
          className="rounded-xl p-5 text-center"
          style={{
            background: "oklch(0.680 0.230 295 / 0.15)",
            border: "2px solid oklch(0.680 0.230 295 / 0.4)",
            boxShadow: "0 0 20px oklch(0.680 0.230 295 / 0.15)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        >
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>
            🚫 DO NOT TRADE NOW
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground">
            High-impact news within 2 hours or medium-impact within 30 min. Spreads will spike.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {critical.map((e) => (
              <span key={e.id} className="rounded-full px-3 py-1 text-[11px] font-bold font-mono tabular-nums" style={{ background: "oklch(0.680 0.230 295 / 0.2)", color: "oklch(0.680 0.230 295)" }}>
                🔴 {e.event.slice(0, 35)} — {formatCountdown(e.secondsUntil)}
              </span>
            ))}
            {warning.map((e) => (
              <span key={e.id} className="rounded-full px-3 py-1 text-[11px] font-bold font-mono tabular-nums" style={{ background: "oklch(0.680 0.230 295 / 0.1)", color: "oklch(0.680 0.230 295)" }}>
                🟡 {e.event.slice(0, 35)} — {formatCountdown(e.secondsUntil)}
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
            High-impact events within 2-3 hours. Avoid new entries.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {caution.map((e) => (
              <span key={e.id} className="rounded-full px-3 py-1 text-[11px] font-bold font-mono tabular-nums" style={{ background: "oklch(0.680 0.230 295 / 0.1)", color: "oklch(0.680 0.230 295)" }}>
                🟠 {e.event.slice(0, 35)} — {formatCountdown(e.secondsUntil)}
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
            No high-impact news in the next 3 hours.{" "}
            {nextEvent && (
              <span className="font-mono tabular-nums">
                Next event in {formatCountdown(nextEvent.secondsUntil)}
              </span>
            )}
          </p>
        </div>
      )}

      {/* SESSION OVERLAP — real-time */}
      <div
        className="rounded-xl p-4"
        style={{
          background: "oklch(0.680 0.230 295 / 0.05)",
          border: "1px solid oklch(0.680 0.230 295 / 0.13)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Market Sessions (ET)</h3>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "oklch(0.680 0.230 295)" }}>
            {liveClock}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sessions.map((s) => (
            <div
              key={s.label}
              className="rounded-lg p-3 text-center transition-all duration-300"
              style={{
                background: s.active ? "oklch(0.680 0.230 295 / 0.15)" : "oklch(0.680 0.230 295 / 0.05)",
                border: s.active ? "1px solid oklch(0.680 0.230 295 / 0.3)" : "1px solid oklch(0.680 0.230 295 / 0.08)",
              }}
            >
              <div className="text-[11px] font-medium" style={{ color: "oklch(0.680 0.230 295)" }}>
                {s.label}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {s.start} – {s.end}
              </div>
              {s.active ? (
                <div className="mt-1 flex items-center justify-center gap-1">
                  <div className="relative">
                    <div
                      className="h-1.5 w-1.5 rounded-full animate-ping absolute"
                      style={{ background: "oklch(0.680 0.230 295)", opacity: 0.4 }}
                    />
                    <div
                      className="h-1.5 w-1.5 rounded-full relative"
                      style={{ background: "oklch(0.680 0.230 295)" }}
                    />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: "oklch(0.680 0.230 295)" }}>
                    LIVE NOW
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-[10px] font-mono tabular-nums text-muted-foreground">
                  in {formatSessionCountdown(s.secondsUntil)}
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
          <div className="text-[10px] text-muted-foreground">30m-2h HIGH / &lt;30m MED</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.05)", border: "1px solid oklch(0.680 0.230 295 / 0.1)" }}>
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>{caution.length}</div>
          <div className="text-[11px] font-medium" style={{ color: "oklch(0.680 0.230 295)" }}>CAUTION</div>
          <div className="text-[10px] text-muted-foreground">2-3h HIGH / 30m-2h MED</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.680 0.230 295 / 0.03)", border: "1px solid oklch(0.680 0.230 295 / 0.08)" }}>
          <div className="text-2xl font-black" style={{ color: "oklch(0.680 0.230 295)" }}>{safe.length}</div>
          <div className="text-[11px] font-medium" style={{ color: "oklch(0.680 0.230 295)" }}>SAFE</div>
          <div className="text-[10px] text-muted-foreground">&gt;3h</div>
        </div>
      </div>

      {/* EVENTS TABLE — real-time countdowns */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Upcoming Events</h3>
        {loading && rawEvents.length === 0 ? (
          <div className="rounded-xl p-8 text-center text-[13px] text-muted-foreground">Loading events…</div>
        ) : error ? (
          <div className="rounded-xl p-8 text-center text-[13px]" style={{ color: "oklch(0.680 0.230 295)" }}>
            {error}
          </div>
        ) : liveEvents.length === 0 ? (
          <div className="rounded-xl p-8 text-center text-[13px] text-muted-foreground">
            No upcoming events.
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid oklch(0.680 0.230 295 / 0.13)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-white/5">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Time (ET)</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Event</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Imp</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actual</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Forecast</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Previous</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pairs</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Countdown</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Hazard</th>
                  </tr>
                </thead>
                <tbody>
                  {liveEvents.map((ev) => {
                    const isPast = ev.secondsUntil < 0;
                    return (
                      <tr
                        key={ev.id}
                        className="border-t border-white/5 transition-colors duration-300"
                        style={{
                          background: ev.hazardLevel === "critical"
                            ? "oklch(0.680 0.230 295 / 0.1)"
                            : ev.hazardLevel === "warning"
                            ? "oklch(0.680 0.230 295 / 0.05)"
                            : "transparent",
                          opacity: isPast ? 0.5 : 1,
                        }}
                      >
                        {/* Time in ET */}
                        <td className="px-3 py-2 font-mono tabular-nums text-foreground whitespace-nowrap">
                          {new Date(ev.time).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "America/New_York",
                          })}
                        </td>
                        <td className="px-3 py-2 text-foreground">{ev.event}</td>
                        {/* Impact badge */}
                        <td className="px-3 py-2">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                            style={{
                              background: ev.impact === "high"
                                ? "oklch(0.55 0.25 29 / 0.25)"
                                : ev.impact === "medium"
                                ? "oklch(0.75 0.18 80 / 0.2)"
                                : "oklch(0.680 0.230 295 / 0.08)",
                              color: ev.impact === "high"
                                ? "oklch(0.70 0.22 29)"
                                : ev.impact === "medium"
                                ? "oklch(0.80 0.16 80)"
                                : "oklch(0.680 0.230 295)",
                            }}
                          >
                            {ev.impact === "high" ? "HIGH" : ev.impact === "medium" ? "MED" : "LOW"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-foreground font-mono tabular-nums">{ev.actual}</td>
                        <td className="px-3 py-2 text-foreground font-mono tabular-nums">{ev.forecast}</td>
                        <td className="px-3 py-2 text-foreground font-mono tabular-nums">{ev.previous}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {ev.pairs.map((p) => (
                              <span key={p} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        {/* Live countdown */}
                        <td className="px-3 py-2 font-mono tabular-nums text-[11px] whitespace-nowrap" style={{
                          color: ev.hazardLevel === "critical"
                            ? "oklch(0.70 0.22 29)"
                            : ev.hazardLevel === "warning"
                            ? "oklch(0.80 0.16 80)"
                            : "oklch(0.680 0.230 295)",
                          fontWeight: ev.hazardLevel === "critical" || ev.hazardLevel === "warning" ? 700 : 400,
                        }}>
                          {formatCountdown(ev.secondsUntil)}
                        </td>
                        {/* Hazard badge */}
                        <td className="px-3 py-2">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap"
                            style={{
                              background: ev.hazardLevel === "critical"
                                ? "oklch(0.55 0.25 29 / 0.25)"
                                : ev.hazardLevel === "warning"
                                ? "oklch(0.75 0.18 80 / 0.2)"
                                : ev.hazardLevel === "caution"
                                ? "oklch(0.70 0.17 55 / 0.15)"
                                : "oklch(0.680 0.230 295 / 0.03)",
                              color: ev.hazardLevel === "critical"
                                ? "oklch(0.70 0.22 29)"
                                : ev.hazardLevel === "warning"
                                ? "oklch(0.80 0.16 80)"
                                : ev.hazardLevel === "caution"
                                ? "oklch(0.75 0.17 55)"
                                : isPast
                                ? "oklch(0.5 0.02 295)"
                                : "oklch(0.680 0.230 295)",
                            }}
                          >
                            {ev.hazardLevel === "critical"
                              ? "🔴 CRITICAL"
                              : ev.hazardLevel === "warning"
                              ? "🟡 WARNING"
                              : ev.hazardLevel === "caution"
                              ? "🟠 CAUTION"
                              : isPast
                              ? "⬜ PASSED"
                              : "🟢 SAFE"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
          <li>• <strong className="text-foreground">Best liquidity:</strong> London/NY overlap (13:00-16:00 ET)</li>
        </ul>
      </div>
    </div>
  );
}
