import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  ShieldX, ShieldAlert, ShieldCheck, XCircle, AlertTriangle, CheckCircle2,
  Clock, Activity, Radio, RefreshCw, Loader2, Bot, TrendingUp, TrendingDown,
  Minus, ChevronDown, ChevronUp, ArrowRight, Target, Sparkles, X, Info,
} from "lucide-react";
import { getEasternTime, getWATTime, formatTime, etToWAT, formatEventTimeWAT, formatEtTo12h } from "@/lib/timezone";
import { Badge, Button, CockpitHeader } from "@/components/terminal/ui";
import { LiveDot } from "@/components/terminal/anim";
import { classifyHazard } from "@/lib/news-hazard";
import { analyzeNewsEvent, type NewsAnalysis as HermesAnalysis } from "@/lib/news-analyzer";

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
  datetime: number;
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

const API_REFRESH_MS = 20_000;
const TICK_MS = 1_000;

/* ── Pure helpers ─────────────────────────────────────────────── */

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

function formatSessionCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "LIVE";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
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
      { title: "Economic Calendar & Hermes Post-News Trend — GizzyFx" },
      { name: "description", content: "Strategy-aware economic calendar with real-time post-news trend continuation intelligence." },
    ],
  }),
  component: CalendarPage,
});

/* ── Component ────────────────────────────────────────────────── */

function CalendarPage() {
  const rawEventsRef = useRef<RawEvent[]>([]);
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [hermesAnalyses, setHermesAnalyses] = useState<Record<string, HermesAnalysis | "loading">>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("gizzyfx.calendar.hermesAnalyses");
        if (saved) {
          const parsed = JSON.parse(saved);
          const clean: Record<string, HermesAnalysis> = {};
          for (const [id, a] of Object.entries(parsed)) {
            // Ignore any stale analysis with "Analysis unavailable" or missing what_happened
            if (a && typeof a === "object" && (a as any).analysis && !(a as any).analysis.includes("Analysis unavailable") && (a as any).what_happened) {
              clean[id] = a as HermesAnalysis;
            }
          }
          return clean;
        }
      } catch {}
    }
    return {};
  });
  const [analyzingEvents, setAnalyzingEvents] = useState<Set<string>>(new Set());
  const [hermesExpanded, setHermesExpanded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("gizzyfx.calendar.hermesExpanded");
        if (saved !== null) return saved === "true";
      } catch {}
    }
    return true;
  });
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<"post_news" | "upcoming">(() => {
    if (typeof window !== "undefined") {
      try {
        return (localStorage.getItem("gizzyfx.calendar.tab") as any) || "post_news";
      } catch {}
    }
    return "post_news";
  });
  const [modalEvent, setModalEvent] = useState<RawEvent | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("gizzyfx.calendar.hermesExpanded", String(hermesExpanded));
    } catch {}
  }, [hermesExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem("gizzyfx.calendar.tab", activeAnalysisTab);
    } catch {}
  }, [activeAnalysisTab]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const toSave: Record<string, HermesAnalysis> = {};
        for (const [id, a] of Object.entries(hermesAnalyses)) {
          if (a && a !== "loading") {
            toSave[id] = a;
          }
        }
        if (Object.keys(toSave).length > 0) {
          localStorage.setItem("gizzyfx.calendar.hermesAnalyses", JSON.stringify(toSave));
        }
      } catch {}
    }
  }, [hermesAnalyses]);

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

  const fetchHermesAnalysis = useCallback(async (ev: RawEvent, force = true) => {
    setAnalyzingEvents((prev) => new Set(prev).add(ev.id));
    setHermesAnalyses((prev) => ({ ...prev, [ev.id]: "loading" }));

    // Smooth visual feedback time so the user sees Hermes actively analyzing
    await new Promise((r) => setTimeout(r, 450));

    try {
      const result = analyzeNewsEvent({
        event_name: ev.event,
        currency: ev.currency,
        impact: ev.impact,
        actual: ev.actual,
        forecast: ev.forecast,
        previous: ev.previous,
        datetime: ev.datetime,
      });

      setHermesAnalyses((prev) => {
        const next = { ...prev, [ev.id]: result };
        try {
          const toSave: Record<string, HermesAnalysis> = {};
          for (const [k, v] of Object.entries(next)) {
            if (v && v !== "loading") toSave[k] = v;
          }
          localStorage.setItem("gizzyfx.calendar.hermesAnalyses", JSON.stringify(toSave));
        } catch {}
        return next;
      });
    } catch (e) {
      console.error("Error analyzing news event:", e);
    } finally {
      setAnalyzingEvents((prev) => {
        const next = new Set(prev);
        next.delete(ev.id);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const apiFetcher = setInterval(fetchEvents, API_REFRESH_MS);
    const ticker = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => {
      clearInterval(apiFetcher);
      clearInterval(ticker);
    };
  }, [fetchEvents]);

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

  // Upcoming high-impact events
  const upcomingHighImpact = useMemo(() => {
    return liveEvents
      .filter((e) => e.impact === "high" && e.secondsUntil > 0)
      .slice(0, 5);
  }, [liveEvents]);

  // Recent released / past events (high & medium impact)
  const recentReleasedEvents = useMemo(() => {
    return liveEvents
      .filter((e) => (e.impact === "high" || e.impact === "medium") && (e.secondsUntil <= 0 || (e.actual && e.actual !== "—")))
      .slice(-8)
      .reverse();
  }, [liveEvents]);

  // Auto-analyze all events immediately so they are pre-rendered with zero wait time
  useEffect(() => {
    if (liveEvents.length === 0) return;
    const updates: Record<string, HermesAnalysis> = {};
    let changed = false;

    for (const ev of liveEvents) {
      if (!hermesAnalyses[ev.id] || hermesAnalyses[ev.id] === "loading") {
        try {
          const result = analyzeNewsEvent({
            event_name: ev.event,
            currency: ev.currency,
            impact: ev.impact,
            actual: ev.actual,
            forecast: ev.forecast,
            previous: ev.previous,
            datetime: ev.datetime,
          });
          updates[ev.id] = result;
          changed = true;
        } catch {}
      }
    }

    if (changed) {
      setHermesAnalyses((prev) => {
        const next = { ...prev, ...updates };
        try {
          localStorage.setItem("gizzyfx.calendar.hermesAnalyses", JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [liveEvents]);

  const sessions = useMemo(() => computeSessions(), [tick]);

  const liveClock = useMemo(() => {
    const wat = getWATTime();
    const et = getEasternTime();
    return `${formatTime(wat)} WAT · ${formatTime(et)} ET`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const critical = liveEvents.filter((e) => e.hazardLevel === "critical");
  const warning = liveEvents.filter((e) => e.hazardLevel === "warning");
  const caution = liveEvents.filter((e) => e.hazardLevel === "caution");
  const safe = liveEvents.filter((e) => e.hazardLevel === "safe");

  const tradingBlocked = critical.length > 0 || warning.length > 0;
  const tradingCaution = caution.length > 0 && !tradingBlocked;
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
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              {loading ? "…" : "Refresh"}
            </Button>
          </div>
        }
      />

      {/* ── HERMES AI NEWS & POST-NEWS TREND INTELLIGENCE ────────── */}
      <div className="panel hermes-panel" style={{ padding: 0, borderColor: "oklch(var(--gz-p) / 0.25)" }}>
        <div
          className="panel-head"
          style={{ background: "oklch(var(--gz-p) / 0.05)", cursor: "pointer" }}
          onClick={() => setHermesExpanded(!hermesExpanded)}
        >
          <div className="flex items-center gap-2">
            <Bot size={16} style={{ color: "oklch(var(--gz-p))" }} />
            <h2 className="panel-head-title">Hermes News Intelligence & Trend Forecast</h2>
            {analyzingEvents.size > 0 && (
              <span className="badge badge-warning flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                Analyzing {analyzingEvents.size}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="mono-cap hidden sm:inline" style={{ color: "oklch(var(--gz-mut))" }}>
              What Happened & Highest-Confidence Trend Continuation
            </span>
            {hermesExpanded ? <ChevronUp size={14} style={{ color: "oklch(var(--gz-p))" }} /> : <ChevronDown size={14} style={{ color: "oklch(var(--gz-p))" }} />}
          </div>
        </div>

        {hermesExpanded && (
          <div className="p-3 sm:p-4">
            {/* Real-time Status Strip */}
            <div className="flex items-center justify-between p-2.5 mb-3 rounded-lg bg-secondary/50 border border-border/60 text-xs flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="font-mono font-bold text-foreground uppercase tracking-wider text-[11px]">
                  Hermes Live Radar: Active
                </span>
                <span className="text-muted-foreground hidden sm:inline">
                  • Monitoring releases, surprise deltas & trend vectors in real-time
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-card border border-border/50 font-bold text-primary">
                  {recentReleasedEvents.length} Active Releases Tracked
                </span>
              </div>
            </div>

            {/* Active Analyzing Status Banner */}
            {analyzingEvents.size > 0 && (
              <div className="p-3 mb-3 rounded-lg bg-primary/10 border border-primary/30 flex flex-wrap items-center justify-between gap-2 animate-pulse">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-primary" />
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">
                    Hermes AI is actively analyzing {analyzingEvents.size} event{analyzingEvents.size > 1 ? "s" : ""}…
                  </span>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">
                  Computing release surprise & market trend continuation
                </span>
              </div>
            )}

            {/* Tabs for Post-News vs Upcoming */}
            <div className="flex gap-2 mb-4 border-b border-border/40 pb-2">
              <button
                onClick={() => setActiveAnalysisTab("post_news")}
                className={`px-3 py-1.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${
                  activeAnalysisTab === "post_news"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles size={13} />
                Post-News Outcomes & Trends ({recentReleasedEvents.length})
              </button>
              <button
                onClick={() => setActiveAnalysisTab("upcoming")}
                className={`px-3 py-1.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${
                  activeAnalysisTab === "upcoming"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Clock size={13} />
                Upcoming Scenarios ({upcomingHighImpact.length})
              </button>
            </div>

            {/* Content for Post-News Releases */}
            {activeAnalysisTab === "post_news" && (
              <div className="space-y-4">
                {recentReleasedEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No recent news releases logged yet today.
                  </p>
                ) : (
                  recentReleasedEvents.map((ev) => {
                    const isAnalyzing = analyzingEvents.has(ev.id);
                    if (isAnalyzing) {
                      return (
                        <div key={ev.id} className="rounded-xl p-4 bg-card border border-primary/40 shadow-lg space-y-3 relative overflow-hidden">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <Bot size={18} className="text-primary animate-pulse" />
                              </div>
                              <div>
                                <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                                  Hermes AI Analyzing {ev.event}…
                                </span>
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  Evaluating release numbers, surprise delta & market continuation trend
                                </span>
                              </div>
                            </div>
                            <Badge tone="blue" live>
                              <Loader2 size={11} className="animate-spin" />
                              Analyzing
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs font-mono">
                            <div className="p-2 rounded bg-secondary/60 border border-border/40 flex items-center gap-2">
                              <CheckCircle2 size={13} className="text-success flex-shrink-0" />
                              <span className="text-muted-foreground truncate">1. Actual vs Forecast</span>
                            </div>
                            <div className="p-2 rounded bg-primary/10 border border-primary/30 flex items-center gap-2">
                              <Loader2 size={13} className="animate-spin text-primary flex-shrink-0" />
                              <span className="text-primary font-bold truncate">2. Macro Flow & Yields</span>
                            </div>
                            <div className="p-2 rounded bg-secondary/30 border border-border/30 flex items-center gap-2 opacity-60">
                              <div className="w-3 h-3 rounded-full border border-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground truncate">3. Continuation Setup</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Always compute fresh, reliable analysis for every released event
                    const currentAnalysis = analyzeNewsEvent({
                      event_name: ev.event,
                      currency: ev.currency,
                      impact: ev.impact,
                      actual: ev.actual,
                      forecast: ev.forecast,
                      previous: ev.previous,
                      datetime: ev.datetime,
                    });

                    const isPost = currentAnalysis && currentAnalysis.is_post_news && currentAnalysis.what_happened && currentAnalysis.post_news_trend;
                    const whatHappened = currentAnalysis?.what_happened;
                    const trend = currentAnalysis?.post_news_trend;

                    const dirColor =
                      currentAnalysis?.direction === "BUY" ? "oklch(var(--gz-pos))" :
                      currentAnalysis?.direction === "SELL" ? "oklch(var(--gz-neg))" :
                      "oklch(var(--gz-mut))";

                    const DirIcon =
                      currentAnalysis?.direction === "BUY" ? TrendingUp :
                      currentAnalysis?.direction === "SELL" ? TrendingDown :
                      Minus;

                    const verdictTone =
                      whatHappened?.verdict === "STRONG_BEAT" || whatHappened?.verdict === "BEAT" ? "badge-success" :
                      whatHappened?.verdict === "SEVERE_MISS" || whatHappened?.verdict === "MISS" ? "badge-danger" :
                      "badge-neutral";

                    return (
                      <div
                        key={ev.id}
                        className="rounded-xl p-3 sm:p-4 bg-card border border-border shadow-sm space-y-3"
                      >
                        {/* Event Title Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`badge ${ev.impact === "high" ? "badge-danger" : "badge-warning"}`}>
                              {ev.impact.toUpperCase()}
                            </span>
                            <span className="font-bold text-sm text-foreground">{ev.event}</span>
                            <span className="mono-cap text-muted-foreground">{ev.currency}</span>
                            <span className="font-mono text-xs text-muted-foreground font-semibold">
                              ({formatCountdown(ev.secondsUntil)})
                            </span>
                            {/* Prominent Actionable Direction Badge */}
                            <span className={`px-2.5 py-0.5 rounded-md font-mono text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-sm ${
                              currentAnalysis?.direction === "BUY"
                                ? "bg-emerald-500 text-white"
                                : currentAnalysis?.direction === "SELL"
                                ? "bg-red-500 text-white"
                                : "bg-secondary text-muted-foreground"
                            }`}>
                              <DirIcon size={13} />
                              {currentAnalysis?.direction === "BUY"
                                ? `DIRECTION: BUY ${ev.currency}`
                                : currentAnalysis?.direction === "SELL"
                                ? `DIRECTION: SELL ${ev.currency}`
                                : `DIRECTION: NEUTRAL ${ev.currency}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-xs font-bold">
                            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              Actual: {ev.actual || "Released"}
                            </span>
                            {ev.forecast !== "—" && <span className="text-muted-foreground">F: {ev.forecast}</span>}
                            {ev.previous !== "—" && <span className="text-muted-foreground">P: {ev.previous}</span>}
                            <button
                              onClick={() => fetchHermesAnalysis(ev, true)}
                              title="Re-run analysis with Hermes AI"
                              className="text-[11px] font-mono font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer bg-primary/10 px-2 py-0.5 rounded border border-primary/20"
                            >
                              <RefreshCw size={10} /> Re-analyze
                            </button>
                          </div>
                        </div>

                        {/* SECTION 1: WHAT HAPPENED IN THE NEWS */}
                        {whatHappened && (
                          <div className="rounded-lg p-3 bg-secondary/40 border border-border/50 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`badge ${verdictTone}`}>
                                  {whatHappened.verdict_title}
                                </span>
                                <span className="text-xs font-bold text-foreground">
                                  {whatHappened.surprise_delta}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-muted-foreground">
                                Macro Release Verdict
                              </span>
                            </div>
                            <p className="text-xs font-medium text-foreground/90 leading-relaxed">
                              {whatHappened.macro_impact}
                            </p>
                          </div>
                        )}

                        {/* SECTION 2: HIGHEST-CONFIDENCE MARKET TREND */}
                        {trend && (
                          <div
                            className="rounded-lg p-3 space-y-3"
                            style={{
                              background: currentAnalysis?.direction === "BUY" ? "oklch(var(--gz-pos) / 0.08)" : currentAnalysis?.direction === "SELL" ? "oklch(var(--gz-neg) / 0.08)" : "oklch(var(--gz-s2) / 0.5)",
                              border: `1px solid ${dirColor}30`,
                            }}
                          >
                            {/* Main Actionable Direction Callout */}
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-card/80 border border-border">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Trade Call:</span>
                                <span className={`px-2.5 py-1 rounded font-mono text-xs font-black uppercase flex items-center gap-1 ${
                                  currentAnalysis?.direction === "BUY" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" :
                                  currentAnalysis?.direction === "SELL" ? "bg-red-500/20 text-red-400 border border-red-500/40" :
                                  "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                }`}>
                                  <DirIcon size={14} />
                                  {currentAnalysis?.direction === "BUY" ? `BUY ${ev.currency} (BULLISH CONTINUATION)` :
                                   currentAnalysis?.direction === "SELL" ? `SELL ${ev.currency} (BEARISH CONTINUATION)` :
                                   `NEUTRAL ${ev.currency} (CONSOLIDATION)`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 font-mono text-xs">
                                <span className="text-muted-foreground">Confidence:</span>
                                <span className="font-extrabold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                                  {trend.confidence}%
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-card flex items-center justify-center">
                                  <DirIcon size={16} style={{ color: dirColor }} />
                                </div>
                                <div>
                                  <span className="font-extrabold text-xs uppercase tracking-wide" style={{ color: dirColor }}>
                                    {trend.trend_headline}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Key Drivers & Horizon */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                              <div className="rounded p-2 bg-card/70 border border-border/40">
                                <span className="font-bold text-muted-foreground block mb-0.5">Key Market Driver:</span>
                                <p className="text-foreground/90">{trend.key_drivers}</p>
                              </div>
                              <div className="rounded p-2 bg-card/70 border border-border/40">
                                <span className="font-bold text-muted-foreground block mb-0.5">Continuation Horizon:</span>
                                <p className="text-foreground/90">{trend.duration_horizon}</p>
                              </div>
                            </div>

                            {/* Recommended Pairs with Targets */}
                            {trend.recommended_pairs.length > 0 && (
                              <div>
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                                  Highest-Conviction Trade Continuation Pairs:
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {trend.recommended_pairs.map((rec) => (
                                    <div
                                      key={rec.pair}
                                      className="rounded p-2 bg-card border border-border/60 flex flex-col gap-1"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-mono font-bold text-xs text-foreground">{rec.pair}</span>
                                        <span
                                          className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded"
                                          style={{
                                            background: rec.direction === "BUY" ? "oklch(var(--gz-pos) / 0.15)" : "oklch(var(--gz-neg) / 0.15)",
                                            color: rec.direction === "BUY" ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))",
                                          }}
                                        >
                                          {rec.direction}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Target:</span>
                                        <span className="font-mono font-bold text-primary">{rec.target_pips}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Entry Timing & Invalidation */}
                            <div className="rounded p-2.5 bg-card/80 border border-border/50 text-xs space-y-1">
                              <div>
                                <span className="font-bold text-primary mr-1">Execution Rule:</span>
                                <span className="text-foreground/90">{trend.pullback_entry_rule}</span>
                              </div>
                              <div>
                                <span className="font-bold text-destructive mr-1">Invalidation Level:</span>
                                <span className="text-muted-foreground">{trend.invalidation_level}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Fallback if neither post-news section is present */}
                        {!whatHappened && !trend && (
                          <div className="rounded-lg p-3 bg-secondary/50 border border-border/60 text-xs space-y-2">
                            <p className="text-foreground/90 leading-relaxed font-medium">{analysis.analysis}</p>
                            <div className="p-2 rounded bg-card border border-border/40 text-xs">
                              <span className="font-bold text-primary mr-1">Trade Setup:</span>
                              <span className="text-foreground/90">{analysis.trade_setup}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Content for Upcoming Scenarios */}
            {activeAnalysisTab === "upcoming" && (
              <div className="space-y-3">
                {upcomingHighImpact.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No upcoming high-impact events in the next 24 hours.
                  </p>
                ) : (
                  upcomingHighImpact.map((ev) => {
                    const analysis = hermesAnalyses[ev.id];
                    if (analysis === "loading" || !analysis) {
                      return (
                        <div key={ev.id} className="rounded-lg p-3 bg-card/60 border border-border/40 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="badge badge-danger">HIGH</span>
                            <span className="font-bold text-sm text-foreground">{ev.event}</span>
                            <span className="font-mono text-xs text-muted-foreground">({formatCountdown(ev.secondsUntil)})</span>
                          </div>
                          <button
                            onClick={() => fetchHermesAnalysis(ev)}
                            className="text-xs font-bold px-3 py-1 rounded bg-primary/10 text-primary border border-primary/30 cursor-pointer hover:bg-primary/20"
                          >
                            Analyze Scenarios
                          </button>
                        </div>
                      );
                    }

                    const dirColor =
                      analysis.direction === "BUY" ? "oklch(var(--gz-pos))" :
                      analysis.direction === "SELL" ? "oklch(var(--gz-neg))" :
                      "oklch(var(--gz-mut))";

                    return (
                      <div key={ev.id} className="rounded-lg p-3.5 bg-card border border-border space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="badge badge-danger">HIGH</span>
                            <span className="font-bold text-sm text-foreground">{ev.event}</span>
                            <span className="mono-cap text-muted-foreground">{ev.currency}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <span className="text-muted-foreground">F: {ev.forecast}</span>
                            <span className="text-muted-foreground">P: {ev.previous}</span>
                            <span className="font-bold text-primary">In {formatCountdown(ev.secondsUntil)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-foreground/90 leading-relaxed">{analysis.analysis}</p>
                        <div className="p-2 rounded bg-secondary/50 border border-border/40 text-xs">
                          <span className="font-bold text-primary mr-1">Pre-News Setup:</span>
                          <span className="text-foreground/90">{analysis.trade_setup}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TRADING SAFETY BANNER */}
      {tradingBlocked ? (
        <div className="alert alert-red fx-alert-breathe" style={{ textAlign: "center", padding: "1.25rem" }}>
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

      {/* SESSION OVERLAP */}
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
                  {formatEtTo12h(s.start)}–{formatEtTo12h(s.end)} ET
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

      {/* ALERT SUMMARY */}
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

      {/* EVENTS TABLE */}
      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-head">
          <h2 className="panel-head-title">Economic Calendar Schedule</h2>
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
                  <th>Hermes Analysis</th>
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
                  const hermes = hermesAnalyses[ev.id];
                  return (
                    <tr key={ev.id} style={{ background: rowBg, opacity: isPast ? 0.65 : 1 }}>
                      <td className="font-mono tabular-nums whitespace-nowrap font-bold">
                        {formatEventTimeWAT(ev.time)}
                      </td>
                      <td className="mono-cap">{ev.currency}</td>
                      <td style={{ color: "oklch(var(--gz-txt))" }}>{ev.event}</td>
                      <td>
                        <span className={`badge ${ev.impact === "high" ? "badge-danger" : ev.impact === "medium" ? "badge-warning" : "badge-neutral"}`}>
                          {ev.impact === "high" ? "HIGH" : ev.impact === "medium" ? "MED" : "LOW"}
                        </span>
                      </td>
                      <td className="num font-mono tabular-nums font-bold" style={{ color: ev.actual && ev.actual !== "—" ? "oklch(var(--gz-p))" : "inherit" }}>
                        {ev.actual || "—"}
                      </td>
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
                           isPast ? "RELEASED" : "SAFE"}
                        </span>
                      </td>
                      <td>
                        {hermes && hermes !== "loading" ? (
                          <button
                            onClick={() => setModalEvent(ev)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/80 hover:bg-secondary border border-border cursor-pointer transition-all"
                          >
                            {(() => {
                              const a = hermes as HermesAnalysis;
                              const dc = a.direction === "BUY" ? "oklch(var(--gz-pos))" : a.direction === "SELL" ? "oklch(var(--gz-neg))" : "oklch(var(--gz-mut))";
                              return (
                                <>
                                  <span className="font-mono text-[10.5px] font-extrabold" style={{ color: dc }}>
                                    {a.is_post_news ? `TREND: ${a.direction}` : a.direction}
                                  </span>
                                  <span className="font-mono text-[9.5px] text-muted-foreground">
                                    {a.confidence}%
                                  </span>
                                  <Info size={11} className="text-primary ml-0.5" />
                                </>
                              );
                            })()}
                          </button>
                        ) : analyzingEvents.has(ev.id) ? (
                          <span className="text-[10px] mono-cap font-bold text-primary">Analyzing…</span>
                        ) : (
                          <button
                            onClick={() => {
                              fetchHermesAnalysis(ev);
                              setModalEvent(ev);
                            }}
                            className="text-[10px] mono-cap font-bold cursor-pointer text-primary hover:underline"
                          >
                            {isPast ? "Review Trend" : "Forecast"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAIL MODAL DIALOG */}
      {modalEvent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(6px)",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalEvent(null);
          }}
        >
          <div
            className="panel fx-rise"
            style={{
              maxWidth: 580,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: 0,
              background: "var(--tv-surface, oklch(var(--gz-s1)))",
              border: "1px solid var(--tv-border, oklch(var(--gz-p) / 0.3))",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <div className="panel-head" style={{ padding: "12px 18px", borderBottom: "1px solid var(--tv-border)" }}>
              <div className="flex items-center gap-2">
                <Bot size={18} style={{ color: "var(--tv-blue)" }} />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
                  Hermes News Intelligence
                </h3>
              </div>
              <button
                onClick={() => setModalEvent(null)}
                style={{
                  padding: 6,
                  borderRadius: 6,
                  border: "none",
                  background: "var(--tv-surface-subtle)",
                  color: "var(--tv-text-secondary)",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="border-b border-border/40 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge ${modalEvent.impact === "high" ? "badge-danger" : "badge-warning"}`}>
                    {modalEvent.impact.toUpperCase()}
                  </span>
                  <span className="font-bold text-base text-foreground">{modalEvent.event}</span>
                  <span className="mono-cap text-muted-foreground">{modalEvent.currency}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground mt-1">
                  <span>Actual: <strong className="text-primary">{modalEvent.actual || "—"}</strong></span>
                  <span>Forecast: {modalEvent.forecast || "—"}</span>
                  <span>Previous: {modalEvent.previous || "—"}</span>
                </div>
              </div>

              {(() => {
                const a = hermesAnalyses[modalEvent.id];
                if (!a || a === "loading") {
                  return (
                    <div className="text-center py-8 text-sm text-muted-foreground font-mono">
                      <Loader2 size={20} className="animate-spin text-primary mx-auto mb-2" />
                      Analyzing release data and market continuation vectors…
                    </div>
                  );
                }

                const dirColor =
                  a.direction === "BUY" ? "oklch(var(--gz-pos))" :
                  a.direction === "SELL" ? "oklch(var(--gz-neg))" :
                  "oklch(var(--gz-mut))";

                const DirIcon =
                  a.direction === "BUY" ? TrendingUp :
                  a.direction === "SELL" ? TrendingDown :
                  Minus;

                return (
                  <div className="space-y-4">
                    {/* Explicit Actionable Direction Callout */}
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-card border border-border shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-muted-foreground">Actionable Direction:</span>
                        <span className={`px-3 py-1 rounded-md font-mono text-xs font-black uppercase flex items-center gap-1.5 shadow-sm ${
                          a.direction === "BUY" ? "bg-emerald-500 text-white" :
                          a.direction === "SELL" ? "bg-red-500 text-white" :
                          "bg-secondary text-muted-foreground"
                        }`}>
                          <DirIcon size={14} />
                          {a.direction === "BUY" ? `BUY ${modalEvent.currency} (BULLISH)` : a.direction === "SELL" ? `SELL ${modalEvent.currency} (BEARISH)` : `NEUTRAL ${modalEvent.currency}`}
                        </span>
                      </div>
                      <div className="font-mono text-xs font-extrabold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                        {a.confidence}% Confidence
                      </div>
                    </div>

                    {/* What Happened Section */}
                    {a.what_happened && (
                      <div className="p-3.5 rounded-lg bg-secondary/50 border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="badge badge-info">{a.what_happened.verdict_title}</span>
                          <span className="font-mono text-xs font-bold text-primary">{a.what_happened.surprise_delta}</span>
                        </div>
                        <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                          {a.what_happened.macro_impact}
                        </p>
                      </div>
                    )}

                    {/* Post-News Trend Section */}
                    {a.post_news_trend ? (
                      <div
                        className="p-3.5 rounded-lg space-y-3"
                        style={{
                          background: a.direction === "BUY" ? "oklch(var(--gz-pos) / 0.08)" : a.direction === "SELL" ? "oklch(var(--gz-neg) / 0.08)" : "oklch(var(--gz-s2) / 0.5)",
                          border: `1px solid ${dirColor}40`,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <DirIcon size={18} style={{ color: dirColor }} />
                            <span className="font-extrabold text-sm" style={{ color: dirColor }}>
                              {a.post_news_trend.trend_headline}
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: `${dirColor}20`, color: dirColor }}>
                            {a.post_news_trend.confidence}% Confidence
                          </span>
                        </div>

                        <div className="text-xs space-y-1">
                          <div>
                            <span className="font-bold text-muted-foreground mr-1">Macro Trend Driver:</span>
                            <span className="text-foreground/90">{a.post_news_trend.key_drivers}</span>
                          </div>
                          <div>
                            <span className="font-bold text-muted-foreground mr-1">Projected Duration:</span>
                            <span className="text-foreground/90">{a.post_news_trend.duration_horizon}</span>
                          </div>
                        </div>

                        {a.post_news_trend.recommended_pairs.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase">High-Conviction Currency Pairs:</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {a.post_news_trend.recommended_pairs.map((p) => (
                                <div key={p.pair} className="p-2 rounded bg-card border border-border text-xs flex justify-between items-center">
                                  <span className="font-mono font-bold text-foreground">{p.pair} ({p.direction})</span>
                                  <span className="font-mono font-bold text-primary">{p.target_pips}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="p-2 rounded bg-card/80 border border-border text-xs">
                          <span className="font-bold text-primary mr-1">Pullback Entry Rule:</span>
                          <span className="text-foreground/90">{a.post_news_trend.pullback_entry_rule}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-card border border-border text-xs space-y-2">
                        <p className="text-foreground/90 leading-relaxed">{a.analysis}</p>
                        <div className="p-2 rounded bg-secondary/50 border border-border/40">
                          <span className="font-bold text-primary mr-1">Setup:</span>
                          <span className="text-foreground/90">{a.trade_setup}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* STRATEGY RULES */}
      <div className="panel" style={{ padding: "0.8rem 1rem" }}>
        <p className="section-label mb-2">Strategy Rules</p>
        <ul className="space-y-1 text-[12px]" style={{ color: "oklch(var(--gz-mut))" }}>
          <li>• NO pending orders within ±30 minutes of RED (HIGH) folder news events.</li>
          <li>• Avoid placing new orders 2–3 hours before scheduled high-impact events.</li>
          <li>• After news completes, wait for the initial 5–15M wick to settle before trading confirmed trend continuation.</li>
          <li>• If an order is already filled and in profit before news, move SL to breakeven immediately.</li>
        </ul>
      </div>
    </div>
  );
}
