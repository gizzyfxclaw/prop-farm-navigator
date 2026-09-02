import { useState, useEffect, useMemo, useCallback } from "react";
import { money } from "@/lib/engine/calc";
import { useEngine } from "@/lib/useEngine";
import { useStore } from "@/lib/store";
import { computeRecovery } from "@/lib/recovery";
import { marketStatus } from "@/lib/market-hours";

/* ── Types ────────────────────────────────────────────────────── */

interface Rule {
  id: string;
  category: "compliance" | "execution" | "journal" | "risk";
  text: string;
  detail: string;
  critical?: boolean;
}

interface LiveRuleState {
  rule: Rule;
  status: "ok" | "warning" | "critical" | "info";
  message: string;
  countdown?: string | undefined; // live countdown if applicable
}

interface NewsEvent {
  id: string;
  impact: "high" | "medium" | "low";
  event: string;
  datetime: number;
  pairs: string[];
}

/* ── Constants ────────────────────────────────────────────────── */

const RULES: Rule[] = [
  {
    id: "dpc",
    category: "compliance",
    text: "Daily Profit Cap: $100/day max",
    detail: "Engine auto-reduces risk if reward exceeds cap. Never override manually.",
    critical: true,
  },
  {
    id: "session",
    category: "execution",
    text: "Trade London/NY overlap (13:00–16:00 ET)",
    detail: "Best liquidity window. Avoid low-volume sessions for execution.",
  },
  {
    id: "news",
    category: "execution",
    text: "NO pending orders ±30min HIGH impact news",
    detail: "Calendar data checked in real-time. Red = news within danger window.",
    critical: true,
  },
  {
    id: "news-gap",
    category: "execution",
    text: "Avoid new entries 2-3hr before HIGH news",
    detail: "Spreads widen as major events approach. Wait for the window to clear.",
  },
  {
    id: "entry-time",
    category: "execution",
    text: "Vary entry times: 08:13, 10:42, 14:05",
    detail: "Avoids prop firm AI bot detection. Never trade at round times.",
  },
  {
    id: "sl-pips",
    category: "execution",
    text: "Vary SL pips: 28, 35, 22",
    detail: "Avoids prop firm AI bot detection. Rotate between these values.",
  },
  {
    id: "order-exec",
    category: "execution",
    text: "Exness FIRST → Prop SECOND",
    detail: "Place Exness trade, wait for green confirmation, THEN place Prop manually.",
    critical: true,
  },
  {
    id: "mt5-check",
    category: "execution",
    text: "Check Live MT5 tab before trading",
    detail: "Confirms MetaApi/VPS online. Must show live balance.",
  },
  {
    id: "signs",
    category: "journal",
    text: "Log P&L signs correctly",
    detail: "Prop WIN → Exness P&L MUST be negative. Prop LOSS → Exness P&L MUST be positive.",
    critical: true,
  },
  {
    id: "bad-data",
    category: "journal",
    text: "Clear bad Journal data immediately",
    detail: "If Exness P&L is positive for a Prop Win, click 'Clear all' and start fresh.",
  },
];

const TICK_MS = 1_000;
const API_REFRESH_MS = 120_000;

/* ── Helpers ──────────────────────────────────────────────────── */

function getEasternTime(): { hours: number; minutes: number; seconds: number; totalSeconds: number } {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etStr);
  const h = etDate.getHours();
  const m = etDate.getMinutes();
  const s = etDate.getSeconds();
  return { hours: h, minutes: m, seconds: s, totalSeconds: h * 3600 + m * 60 + s };
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds < 0) {
    const ago = Math.abs(totalSeconds);
    const h = Math.floor(ago / 3600);
    const m = Math.floor((ago % 3600) / 60);
    const s = ago % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ago`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s ago`;
    return `${s}s ago`;
  }
  if (totalSeconds === 0) return "NOW";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/* ── Component ────────────────────────────────────────────────── */

export function RulesAlertPanel() {
  const r = useEngine();
  const { engine, journal } = useStore();
  const recovery = computeRecovery(r, journal);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);
  const [tick, setTick] = useState(0);
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);

  // ── Fetch calendar events for news rules ──
  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/events?days=7");
      if (!res.ok) return;
      const data = await res.json();
      setNewsEvents(
        (data.events || []).map((e: any) => ({
          id: e.id,
          impact: e.impact || "low",
          event: e.event || "",
          datetime: e.datetime || 0,
          pairs: e.pairs || [],
        }))
      );
    } catch {
      // fail silently — news data is supplementary
    }
  }, []);

  // ── Timers ──
  useEffect(() => {
    fetchNews();
    const ticker = setInterval(() => setTick((t) => t + 1), TICK_MS);
    const apiFetcher = setInterval(fetchNews, API_REFRESH_MS);
    return () => {
      clearInterval(ticker);
      clearInterval(apiFetcher);
    };
  }, [fetchNews]);

  // ── Live state — recalculated every second ──
  const nowSec = Math.floor(Date.now() / 1000);
  const et = getEasternTime();
  const market = marketStatus();

  const liveRules: LiveRuleState[] = useMemo(() => {
    const etSec = et.totalSeconds;

    // Session overlap: 13:00–16:00 ET
    const overlapStart = 13 * 3600;
    const overlapEnd = 16 * 3600;
    const inOverlap = etSec >= overlapStart && etSec < overlapEnd;
    const secsToOverlap = inOverlap ? 0 : etSec < overlapStart ? overlapStart - etSec : 86400 - etSec + overlapStart;
    const secsInOverlap = inOverlap ? overlapEnd - etSec : 0;

    // News analysis
    const highEvents = newsEvents.filter((e) => e.impact === "high");
    const medEvents = newsEvents.filter((e) => e.impact === "medium");

    // Find nearest HIGH event (future only)
    const futureHigh = highEvents
      .map((e) => ({ ...e, secsUntil: e.datetime - nowSec }))
      .filter((e) => e.secsUntil > -1800) // include events up to 30min ago (still in danger zone AFTER event)
      .sort((a, b) => Math.abs(a.secsUntil) - Math.abs(b.secsUntil));

    const nearestHigh = futureHigh[0];
    const highWithin30min = futureHigh.filter((e) => Math.abs(e.secsUntil) <= 1800);
    const highWithin2h = futureHigh.filter((e) => e.secsUntil > 0 && e.secsUntil <= 7200);
    const highWithin3h = futureHigh.filter((e) => e.secsUntil > 0 && e.secsUntil <= 10800);

    // Find nearest MEDIUM event
    const futureMed = medEvents
      .map((e) => ({ ...e, secsUntil: e.datetime - nowSec }))
      .filter((e) => e.secsUntil > -900)
      .sort((a, b) => Math.abs(a.secsUntil) - Math.abs(b.secsUntil));

    // Bad trade data
    const badTrade = journal.find((t) => t.result === "WIN" && t.exPnl > 0);

    const result: LiveRuleState[] = [
      // 1. Daily Profit Cap
      {
        rule: RULES[0]!,
        status: r.riskCapped ? "warning" as const : "ok" as const,
        message: r.riskCapped
          ? `Risk capped → $${r.cappedPropRisk.toFixed(2)} (reward $${(r.cappedPropRisk * r.rr).toFixed(2)})`
          : `Reward $${r.propWinPerTrade.toFixed(2)} — under $100 cap`,
      },

      // 2. Session overlap
      {
        rule: RULES[1]!,
        status: inOverlap ? "ok" : "info",
        message: inOverlap
          ? `IN OVERLAP — ${formatCountdown(secsInOverlap)} remaining`
          : `Overlap starts in ${formatCountdown(secsToOverlap)}`,
        countdown: inOverlap ? formatCountdown(secsInOverlap) : formatCountdown(secsToOverlap),
      },

      // 3. News ±30min rule (CRITICAL)
      {
        rule: RULES[2]!,
        status: highWithin30min.length > 0 ? "critical" : "ok",
        message: highWithin30min.length > 0
          ? `🚫 ${highWithin30min[0]!.event.slice(0, 30)} — ${formatCountdown(highWithin30min[0]!.secsUntil)}`
          : nearestHigh && nearestHigh.secsUntil > 0
          ? `Next HIGH: ${nearestHigh.event.slice(0, 25)} in ${formatCountdown(nearestHigh.secsUntil)}`
          : `No HIGH news in danger window`,
        countdown: highWithin30min.length > 0
          ? formatCountdown(highWithin30min[0]!.secsUntil)
          : nearestHigh && nearestHigh.secsUntil > 0
          ? formatCountdown(nearestHigh.secsUntil)
          : undefined,
      },

      // 4. News 2-3hr gap rule
      {
        rule: RULES[3]!,
        status: highWithin2h.length > 0 ? "warning" : highWithin3h.length > 0 ? "info" : "ok",
        message: highWithin2h.length > 0
          ? `⚠️ ${highWithin2h[0]!.event.slice(0, 30)} — ${formatCountdown(highWithin2h[0]!.secsUntil)}`
          : highWithin3h.length > 0
          ? `CAUTION: ${highWithin3h[0]!.event.slice(0, 25)} in ${formatCountdown(highWithin3h[0]!.secsUntil)}`
          : `No HIGH news in next 3 hours`,
        countdown: highWithin2h.length > 0
          ? formatCountdown(highWithin2h[0]!.secsUntil)
          : highWithin3h.length > 0
          ? formatCountdown(highWithin3h[0]!.secsUntil)
          : undefined,
      },

      // 5. Entry times
      {
        rule: RULES[4]!,
        status: "info",
        message: `Current ET: ${String(et.hours).padStart(2, "0")}:${String(et.minutes).padStart(2, "0")}:${String(et.seconds).padStart(2, "0")}`,
      },

      // 6. SL pips
      {
        rule: RULES[5]!,
        status: "info",
        message: `Current SL: ${r.propSlPips} pips — rotate between 28, 35, 22`,
      },

      // 7. Exness FIRST
      {
        rule: RULES[6]!,
        status: "info",
        message: "Manual check — always Exness first, wait for green, then Prop",
      },

      // 8. MT5 check
      {
        rule: RULES[7]!,
        status: "info",
        message: "Check Live MT5 tab shows balance before trading",
      },

      // 9. P&L signs
      {
        rule: RULES[8]!,
        status: badTrade ? "critical" : "ok",
        message: badTrade
          ? `BAD DATA: Trade #${badTrade.id} — Exness positive on Prop Win!`
          : "P&L signs correct in all journal entries",
      },

      // 10. Bad data
      {
        rule: RULES[9]!,
        status: badTrade ? "critical" : "ok",
        message: badTrade
          ? "Bad trade data detected! Click 'Clear all' in Journal."
          : "No bad data detected",
      },
    ];
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, newsEvents, r, journal, et]);

  // ── Buffer depleted alert (from recovery engine) ──
  const bufferAlert: LiveRuleState | null = recovery.bufferDepleted
    ? {
        rule: { id: "buffer", category: "risk", text: "Exness Buffer Depleted", detail: "Deposit needed to continue trading.", critical: true },
        status: "critical",
        message: `Deposit $${recovery.depositNeeded.toFixed(2)} to Exness to continue`,
      }
    : null;

  // ── Counts ──
  const criticalCount = liveRules.filter((r) => r.status === "critical").length + (bufferAlert ? 1 : 0);
  const warningCount = liveRules.filter((r) => r.status === "warning").length;
  const okCount = liveRules.filter((r) => r.status === "ok").length;

  const statusIcon = (status: LiveRuleState["status"]) => {
    switch (status) {
      case "critical": return "🔴";
      case "warning": return "🟡";
      case "ok": return "🟢";
      case "info": return "🔵";
    }
  };

  const statusBg = (status: LiveRuleState["status"]) => {
    switch (status) {
      case "critical": return { background: "oklch(0.55 0.25 29 / 0.12)", border: "1px solid oklch(0.55 0.25 29 / 0.3)" };
      case "warning": return { background: "oklch(0.75 0.18 80 / 0.1)", border: "1px solid oklch(0.75 0.18 80 / 0.25)" };
      case "ok": return { background: "oklch(0.55 0.2 155 / 0.08)", border: "1px solid oklch(0.55 0.2 155 / 0.2)" };
      case "info": return { background: "oklch(0.680 0.230 295 / 0.05)", border: "1px solid oklch(0.680 0.230 295 / 0.1)" };
    }
  };

  const statusTextColor = (status: LiveRuleState["status"]) => {
    switch (status) {
      case "critical": return "oklch(0.70 0.22 29)";
      case "warning": return "oklch(0.80 0.16 80)";
      case "ok": return "oklch(0.65 0.2 155)";
      case "info": return "oklch(0.680 0.230 295)";
    }
  };

  const etClock = `${String(et.hours).padStart(2, "0")}:${String(et.minutes).padStart(2, "0")}:${String(et.seconds).padStart(2, "0")} ET`;

  return (
    <div style={{ background: "oklch(0.13 0.01 295)", border: "1px solid oklch(0.680 0.230 295 / 0.13)", borderRadius: "12px", overflow: "hidden" }}>
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid oklch(0.680 0.230 295 / 0.1)", background: "oklch(0.15 0.01 295)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "oklch(0.680 0.230 295)" }}>
            Rules & Alerts
          </span>
          {/* Live status badges */}
          {criticalCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white animate-pulse"
              style={{ background: "oklch(0.55 0.25 29)" }}>
              {criticalCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
              style={{ background: "oklch(0.75 0.18 80 / 0.3)", color: "oklch(0.80 0.16 80)" }}>
              {warningCount}
            </span>
          )}
          {criticalCount === 0 && warningCount === 0 && (
            <span className="flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-bold"
              style={{ background: "oklch(0.55 0.2 155 / 0.15)", color: "oklch(0.65 0.2 155)" }}>
              ALL OK
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Live pulse */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <div className="h-1.5 w-1.5 rounded-full animate-ping absolute" style={{ background: "oklch(0.680 0.230 295)", opacity: 0.4 }} />
              <div className="h-1.5 w-1.5 rounded-full relative" style={{ background: "oklch(0.680 0.230 295)" }} />
            </div>
            <span className="font-mono text-[10px] tabular-nums" style={{ color: "oklch(0.680 0.230 295)" }}>
              {etClock}
            </span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] transition-colors"
            style={{ color: "oklch(0.680 0.230 295 / 0.6)" }}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </header>

      {expanded && (
        <div className="p-3 space-y-1.5">
          {/* Buffer depleted alert (injected) */}
          {bufferAlert && (
            <div className="rounded-lg p-2.5 flex items-start gap-2.5" style={statusBg("critical")}>
              <span className="text-[12px] mt-0.5">{statusIcon("critical")}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold" style={{ color: statusTextColor("critical") }}>
                    {bufferAlert.rule.text}
                  </span>
                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
                    style={{ background: "oklch(0.55 0.25 29 / 0.2)", color: "oklch(0.70 0.22 29)" }}>
                    CRITICAL
                  </span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: statusTextColor("critical"), opacity: 0.8 }}>
                  {bufferAlert.message}
                </div>
              </div>
            </div>
          )}

          {/* All rules — live status */}
          {liveRules
            .filter((lr) => !dismissed.has(lr.rule.id))
            .map((lr) => (
              <div
                key={lr.rule.id}
                className="rounded-lg p-2.5 flex items-start gap-2.5 transition-all duration-300"
                style={statusBg(lr.status)}
              >
                <span className="text-[12px] mt-0.5">{statusIcon(lr.status)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold" style={{ color: statusTextColor(lr.status) }}>
                      {lr.rule.text}
                    </span>
                    {lr.rule.critical && (
                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          background: lr.status === "critical" ? "oklch(0.55 0.25 29 / 0.2)" : "oklch(0.55 0.25 29 / 0.1)",
                          color: lr.status === "critical" ? "oklch(0.70 0.22 29)" : "oklch(0.55 0.2 29 / 0.6)",
                        }}>
                        CRITICAL
                      </span>
                    )}
                    <span className="text-[8px] uppercase" style={{ color: "oklch(0.680 0.230 295 / 0.4)" }}>
                      {lr.rule.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px]" style={{ color: statusTextColor(lr.status), opacity: 0.8 }}>
                      {lr.message}
                    </span>
                    {lr.countdown && (
                      <span className="font-mono text-[10px] tabular-nums font-bold whitespace-nowrap"
                        style={{ color: statusTextColor(lr.status) }}>
                        {lr.countdown}
                      </span>
                    )}
                  </div>
                </div>
                {/* Dismiss */}
                <button
                  onClick={() => setDismissed((prev) => new Set([...prev, lr.rule.id]))}
                  className="text-[10px] mt-0.5 opacity-30 hover:opacity-80 transition-opacity"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            ))}

          {/* Market Status Bar */}
          <div className="mt-2 rounded-lg p-2.5 flex items-center gap-3" style={{ background: "oklch(0.680 0.230 295 / 0.03)", border: "1px solid oklch(0.680 0.230 295 / 0.08)" }}>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <div
                  className={`h-2 w-2 rounded-full ${market.open ? "animate-ping" : ""} absolute`}
                  style={{ background: market.open ? "oklch(0.55 0.2 155)" : "oklch(0.55 0.25 29)", opacity: 0.4 }}
                />
                <div
                  className="h-2 w-2 rounded-full relative"
                  style={{ background: market.open ? "oklch(0.55 0.2 155)" : "oklch(0.55 0.25 29)" }}
                />
              </div>
              <span className="text-[10px] font-bold" style={{ color: market.open ? "oklch(0.65 0.2 155)" : "oklch(0.70 0.22 29)" }}>
                {market.open ? "MARKET OPEN" : "MARKET CLOSED"}
              </span>
            </div>
            <span className="text-[9px]" style={{ color: "oklch(0.680 0.230 295 / 0.5)" }}>
              {market.detail.slice(0, 60)}
            </span>
            <span className="ml-auto font-mono text-[9px] tabular-nums" style={{ color: "oklch(0.680 0.230 295 / 0.5)" }}>
              {market.changesIn}
            </span>
            <span className="font-mono text-[9px]" style={{ color: "oklch(0.680 0.230 295 / 0.4)" }}>
              {r.phase === 1 ? "Phase 1" : "Phase 2"} · R:R 1:{r.rr}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
