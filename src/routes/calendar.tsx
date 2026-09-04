import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  ShieldX, ShieldAlert, ShieldCheck, XCircle, AlertTriangle, CheckCircle2,
  MinusCircle, Clock, Activity, Radio, RefreshCcw,
} from "lucide-react";
import { getEasternTime, getWATTime, formatTime, etToWAT } from "@/lib/timezone";
import { Badge, Button, CockpitHeader } from "@/components/terminal/ui";
import { LiveDot } from "@/components/terminal/anim";

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

// getEasternTime imported from @/lib/timezone

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
    const wat = getWATTime();
    const et = getEasternTime();
    return `${formatTime(wat)} WAT · ${formatTime(et)} ET`;
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
    <div className="engine-cockpit">
      <CockpitHeader
        title="Economic Calendar"
        badges={
          <>
            <Badge tone={tradingBlocked ? "red" : tradingCaution ? "amber" : "green"}>
              {tradingBlocked
                ? <><ShieldX size={11} /> Do Not Trade</>
                : tradingCaution
                ? <><ShieldAlert size={11} /> Caution</>
                : <><ShieldCheck size={11} /> Safe to Trade</>}
            </Badge>
            <Badge tone="neutral">{liveEvents.length} events</Badge>
          </>
        }
        right={
          <div className="flex items-center gap-3">
            <LiveDot state="live" title="Live — refreshes every 2 minutes" />
            <span className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: "oklch(var(--gz-txt))" }}>
              {liveClock}
            </span>
            {lastFetch && (
              <span className="text-[9px]" style={{ color: "oklch(var(--gz-mut))" }}>API {lastFetch}</span>
            )}
            <Button variant="ghost" onClick={fetchEvents} disabled={loading}>
              <RefreshCcw size={11} />
              {loading ? "…" : "Refresh"}
            </Button>
          </div>
        }
      />

      {/* TRADING SAFETY BANNER */}
      {tradingBlocked ? (
        <div
          className="alert alert-red fx-alert-breathe"
          style={{ textAlign: "center", padding: "1.25rem" }}
        >
          <p className="alert-title" style={{ justifyContent: "center", fontSize: 16 }}>
            <ShieldX size={18} /> DO NOT TRADE NOW
          </p>
          <p className="alert-body">
            High-impact news within 2 hours or medium-impact within 30 min. Spreads will spike.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {critical.map((e) => (
              <span key={e.id} className="badge badge-danger" style={{ padding: "4px 10px", borderRadius: 4 }}>
                {e.event.slice(0, 32)} — {formatCountdown(e.secondsUntil)}
              </span>
            ))}
            {warning.map((e) => (
              <span key={e.id} className="badge badge-warning" style={{ padding: "4px 10px", borderRadius: 4 }}>
                {e.event.slice(0, 32)} — {formatCountdown(e.secondsUntil)}
              </span>
            ))}
          </div>
        </div>
      ) : tradingCaution ? (
        <div className="alert alert-amber" style={{ textAlign: "center", padding: "1.25rem" }}>
          <p className="alert-title" style={{ justifyContent: "center", fontSize: 15 }}>
            <ShieldAlert size={16} /> CAUTION — NEWS APPROACHING
          </p>
          <p className="alert-body">High-impact events within 2–3 hours. Avoid new entries.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {caution.map((e) => (
              <span key={e.id} className="badge badge-warning" style={{ padding: "4px 10px", borderRadius: 4 }}>
                {e.event.slice(0, 32)} — {formatCountdown(e.secondsUntil)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="alert alert-green" style={{ textAlign: "center", padding: "1.25rem" }}>
          <p className="alert-title" style={{ justifyContent: "center", fontSize: 15 }}>
            <ShieldCheck size={16} /> SAFE TO TRADE
          </p>
          <p className="alert-body">
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
      <div className="panel" style={{ padding: "0.8rem" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Market Sessions (WAT / ET)</p>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "oklch(var(--gz-p))" }}>{liveClock}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sessions.map((s) => {
            const [sh, sm] = s.start.split(":").map(Number);
            const [eh, em] = s.end.split(":").map(Number);
            const watStart = etToWAT(sh!, sm!);
            const watEnd = etToWAT(eh!, em!);
            const isOverlap = s.label.includes("Overlap");
            return (
              <div
                key={s.label}
                className="panel-sunken fx-hover"
                style={{
                  padding: "0.6rem 0.75rem",
                  borderLeft: s.active ? `2px solid ${isOverlap ? "oklch(var(--gz-h))" : "oklch(var(--gz-pos))"}` : "2px solid oklch(var(--gz-p) / 0.10)",
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {s.active && <LiveDot state="live" />}
                  <span className="mono-cap" style={{ color: s.active ? (isOverlap ? "oklch(var(--gz-h))" : "oklch(var(--gz-pos))") : "oklch(var(--gz-mut))" }}>
                    {s.label}
                  </span>
                </div>
                <div className="font-mono text-[10px]" style={{ color: "oklch(var(--gz-txt) / 0.85)" }}>
                  {watStart}–{watEnd} WAT
                </div>
                <div className="font-mono text-[9px]" style={{ color: "oklch(var(--gz-mut))" }}>
                  {s.start}–{s.end} ET
                </div>
                {!s.active && (
                  <div className="font-mono text-[9px] tabular-nums mt-0.5" style={{ color: "oklch(var(--gz-mut))" }}>
                    in {formatSessionCountdown(s.secondsUntil)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ALERT SUMMARY — semantic colours */}
      <div className="wgrid-4">
        {[
          { count: critical.length, label: "Critical", sub: "<30min HIGH", tone: "badge-danger",   border: "oklch(var(--gz-neg) / 0.30)", bg: "oklch(var(--gz-neg) / 0.08)" },
          { count: warning.length,  label: "Warning",  sub: "30m–2h HIGH / <30m MED", tone: "badge-warning", border: "oklch(var(--gz-warn) / 0.30)", bg: "oklch(var(--gz-warn) / 0.06)" },
          { count: caution.length,  label: "Caution",  sub: "2–3h HIGH / 30m–2h MED", tone: "badge-info",    border: "oklch(var(--gz-p) / 0.22)",  bg: "oklch(var(--gz-p) / 0.06)" },
          { count: safe.length,     label: "Safe",     sub: ">3h away",              tone: "badge-success", border: "oklch(var(--gz-pos) / 0.22)", bg: "oklch(var(--gz-pos) / 0.06)" },
        ].map((item) => (
          <div key={item.label} className="panel-sunken" style={{ padding: "0.75rem 1rem", border: `1px solid ${item.border}`, background: item.bg, textAlign: "center" }}>
            <div className="font-mono text-[28px] font-bold tabular-nums leading-none" style={{ color: "oklch(var(--gz-txt))" }}>{item.count}</div>
            <div className={`badge ${item.tone} mt-1`}>{item.label}</div>
            <div className="mono-cap mt-1" style={{ color: "oklch(var(--gz-mut))" }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* EVENTS TABLE — real-time countdowns */}
      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-head">
          <h2 className="panel-head-title">Upcoming Events</h2>
          <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>
            {liveEvents.length} events — all times in WAT (Nigeria, UTC+1)
          </span>
        </div>
        {loading && rawEvents.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>Loading events…</span>
          </div>
        ) : error ? (
          <div className="alert alert-red m-3">{error}</div>
        ) : liveEvents.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>No upcoming events.</span>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-institutional">
            <table className="dgrid">
              <thead>
                <tr>
                  <th>Time (WAT)</th>
                  <th>Currency</th>
                  <th>Event</th>
                  <th>Impact</th>
                  <th style={{ textAlign: "right" }}>Actual</th>
                  <th style={{ textAlign: "right" }}>Forecast</th>
                  <th style={{ textAlign: "right" }}>Previous</th>
                  <th>Pairs</th>
                  <th style={{ textAlign: "right" }}>Countdown</th>
                  <th>Hazard</th>
                </tr>
              </thead>
              <tbody>
                {liveEvents.map((ev) => {
                  const isPast = ev.secondsUntil < 0;
                  const rowBg =
                    ev.hazardLevel === "critical" ? "oklch(var(--gz-neg) / 0.08)" :
                    ev.hazardLevel === "warning"  ? "oklch(var(--gz-warn) / 0.06)" :
                    "transparent";
                  const cdColor =
                    ev.hazardLevel === "critical" ? "oklch(var(--gz-neg))" :
                    ev.hazardLevel === "warning"  ? "oklch(var(--gz-warn))" :
                    "oklch(var(--gz-p))";
                  return (
                    <tr key={ev.id} style={{ background: rowBg, opacity: isPast ? 0.52 : 1 }}>
                      <td className="font-mono tabular-nums whitespace-nowrap">
                        {new Date(ev.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}
                      </td>
                      <td className="mono-cap">{ev.currency}</td>
                      <td style={{ color: "oklch(var(--gz-txt))" }}>{ev.event}</td>
                      <td>
                        <span className={`badge ${ev.impact === "high" ? "badge-danger" : ev.impact === "medium" ? "badge-warning" : "badge-neutral"}`}>
                          {ev.impact === "high" ? "HIGH" : ev.impact === "medium" ? "MED" : "LOW"}
                        </span>
                      </td>
                      <td className="num font-mono tabular-nums">{ev.actual || "—"}</td>
                      <td className="num font-mono tabular-nums">{ev.forecast || "—"}</td>
                      <td className="num font-mono tabular-nums">{ev.previous || "—"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {ev.pairs.map((p) => (
                            <span key={p} className="badge badge-neutral">{p}</span>
                          ))}
                        </div>
                      </td>
                      <td className="num font-mono tabular-nums whitespace-nowrap font-bold" style={{ color: cdColor }}>
                        {formatCountdown(ev.secondsUntil)}
                      </td>
                      <td>
                        <span className={`badge ${
                          ev.hazardLevel === "critical" ? "badge-danger" :
                          ev.hazardLevel === "warning"  ? "badge-warning" :
                          ev.hazardLevel === "caution"  ? "badge-info" :
                          isPast ? "badge-neutral" : "badge-success"
                        }`}>
                          {ev.hazardLevel === "critical" ? "CRITICAL" :
                           ev.hazardLevel === "warning"  ? "WARNING" :
                           ev.hazardLevel === "caution"  ? "CAUTION" :
                           isPast ? "PASSED" : "SAFE"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STRATEGY RULES */}
      <div className="panel" style={{ padding: "0.8rem 1rem" }}>
        <p className="section-label mb-2">Strategy Rules</p>
        <ul className="space-y-1 text-[12px]" style={{ color: "oklch(var(--gz-mut))" }}>
          <li><strong style={{ color: "oklch(var(--gz-txt))" }}>No pending orders</strong> ±30 min before/after HIGH impact news</li>
          <li><strong style={{ color: "oklch(var(--gz-txt))" }}>Avoid new entries</strong> ±2–3 hours before HIGH impact events</li>
          <li><strong style={{ color: "oklch(var(--gz-txt))" }}>Vary entry times:</strong> 08:13, 10:42, 14:05</li>
          <li><strong style={{ color: "oklch(var(--gz-txt))" }}>Vary SL pips:</strong> 28, 35, 22</li>
          <li><strong style={{ color: "oklch(var(--gz-txt))" }}>Best liquidity:</strong> London/NY overlap (18:00–21:00 WAT / 13:00–16:00 ET)</li>
        </ul>
      </div>
    </div>
  );
}

