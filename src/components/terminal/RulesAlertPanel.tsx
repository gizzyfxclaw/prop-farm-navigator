import { useState, useEffect, useMemo, useCallback } from "react";
import { money } from "@/lib/engine/calc";
import { useEngine } from "@/lib/useEngine";
import { useStore } from "@/lib/store";
import { computeRecovery } from "@/lib/recovery";
import { marketStatus } from "@/lib/market-hours";
import { getEasternTime, getWATTime, formatTime, etToWAT } from "@/lib/timezone";
import { classifyHazard } from "@/lib/news-hazard";
import { analyzeNewsEvent } from "@/lib/news-analyzer";
import {
  CheckCircle2, AlertTriangle, XCircle, Info, Clock, Shield, ShieldAlert,
  ShieldCheck, ShieldX, Activity, TrendingUp, TrendingDown, Zap, Radio, CircleDot,
  ArrowRightLeft, Monitor, FileWarning, Trash2, RefreshCw, Bot, Minus,
} from "lucide-react";

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
  countdown?: string | undefined;
}

interface NewsEvent {
  id: string;
  impact: "high" | "medium" | "low";
  event: string;
  currency?: string;
  datetime: number;
  pairs: string[];
}

/* ── Constants ────────────────────────────────────────────────── */

const RULES: Rule[] = [
  {
    id: "dpc",
    category: "compliance",
    text: "Daily Profit Cap: $100/day max",
    detail: "Engine auto-reduces risk if reward exceeds cap.",
    critical: true,
  },
  {
    id: "session",
    category: "execution",
    text: "Best window: London/NY overlap (18:00–21:00 WAT)",
    detail: "Peak liquidity. Acceptable: London (13:00–17:00 WAT) or NY (18:00–22:00 WAT).",
  },
  {
    id: "news",
    category: "execution",
    text: "NO pending orders ±30min HIGH impact news",
    detail: "Calendar checked live. Red = danger zone.",
    critical: true,
  },
  {
    id: "news-gap",
    category: "execution",
    text: "Avoid new entries 2-3hr before HIGH news",
    detail: "Spreads widen early. Wait for the window to clear.",
  },
  {
    id: "entry-time",
    category: "execution",
    text: "Vary entry times (avoid round numbers)",
    detail: "Suggested: 08:13, 10:42, 14:05. Never trade on the hour.",
  },
  {
    id: "sl-pips",
    category: "execution",
    text: "Vary SL pips: 28, 35, 22",
    detail: "Rotate to avoid prop AI detection.",
  },
  {
    id: "order-exec",
    category: "execution",
    text: "Exness FIRST → Prop SECOND",
    detail: "Place Exness, wait green confirm, THEN Prop.",
    critical: true,
  },
  {
    id: "mt5-check",
    category: "execution",
    text: "Check Live MT5 tab before trading",
    detail: "Confirms MetaApi/VPS online. Must show live balance.",
    critical: true,
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
  {
    id: "daily-cap-lock",
    category: "compliance",
    text: "Daily Cap Lock",
    detail: "You won a trade today. Do not trade again until tomorrow to avoid exceeding the daily profit cap.",
    critical: true,
  },
  {
    id: "margin-call",
    category: "risk",
    text: "Exness Buffer Depleted — Deposit Required",
    detail: "Exness balance is too low to safely execute the next trade. Deposit to unlock execution.",
    critical: true,
  },
  {
    id: "critical-legs",
    category: "risk",
    text: "Critical Legs — Near Blowout",
    detail: "Prop account has 2 or fewer legs left. Exness target is at maximum capacity. Trade with extreme caution.",
    critical: true,
  },
];

const TICK_MS = 1_000;
const API_REFRESH_MS = 120_000;

/* ── Helpers ──────────────────────────────────────────────────── */

// getEasternTime and getWATTime imported from @/lib/timezone

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
  const { engine, journal, accounts } = useStore();
  const recovery = computeRecovery(r, journal);
  const selectedAccount = accounts.find((a) => a.id === engine.selectedAccountId);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);
  const [tick, setTick] = useState(0);
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [hermesAnalyses, setHermesAnalyses] = useState<Record<string, ReturnType<typeof analyzeNewsEvent>>>({});
  const [analyzingEvents, setAnalyzingEvents] = useState<Set<string>>(new Set());

  // ── Fetch calendar events for news rules ──
  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/events?days=7", { cache: "no-store" });
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
    
    // Refresh immediately when page becomes visible
    const handleVisibility = () => {
      if (!document.hidden) fetchNews();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    
    return () => {
      clearInterval(ticker);
      clearInterval(apiFetcher);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [fetchNews]);

  // ── Live state — recalculated every second ──
  const nowSec = Math.floor(Date.now() / 1000);
  const et = getEasternTime();
  const market = marketStatus();

  const liveRules: LiveRuleState[] = useMemo(() => {
    const etSec = et.totalSeconds;

    // Session windows (ET)
    // Best: London/NY overlap 13:00-16:00
    // Good: London 08:00-12:00 or NY 13:00-17:00
    // Acceptable: Pre-London 07:00-08:00
    // Bad: Asian/off-hours
    const overlapStart = 13 * 3600;
    const overlapEnd = 16 * 3600;
    const londonStart = 8 * 3600;
    const londonEnd = 12 * 3600;
    const nyStart = 13 * 3600;
    const nyEnd = 17 * 3600;
    const preLondon = 7 * 3600;

    const inOverlap = etSec >= overlapStart && etSec < overlapEnd;
    const inLondon = etSec >= londonStart && etSec < londonEnd;
    const inNY = etSec >= nyStart && etSec < nyEnd;
    const inPreLondon = etSec >= preLondon && etSec < londonStart;
    const inGoodWindow = inOverlap || inLondon || inNY;

    const secsToOverlap = inOverlap ? 0 : etSec < overlapStart ? overlapStart - etSec : 86400 - etSec + overlapStart;
    const secsInOverlap = inOverlap ? overlapEnd - etSec : 0;
    const secsToLondon = inLondon ? 0 : etSec < londonStart ? londonStart - etSec : 86400 - etSec + londonStart;
    const secsToNY = inNY ? 0 : etSec < nyStart ? nyStart - etSec : 86400 - etSec + nyStart;

    // Next good window
    const nextGoodStart = etSec < londonStart ? londonStart - etSec
      : etSec < nyEnd ? 0 // currently in a good window
      : 86400 - etSec + londonStart; // after NY close, wait for next London

    // Suggested entry time (next odd-minute time from the list)
    const suggestedTimes = [
      { h: 8, m: 13 }, { h: 9, m: 37 }, { h: 10, m: 42 },
      { h: 11, m: 8 }, { h: 13, m: 17 }, { h: 14, m: 5 },
      { h: 14, m: 51 }, { h: 15, m: 23 },
    ];
    const currentETMinutes = et.hours * 60 + et.minutes;
    const nextSuggested = suggestedTimes.find(t => t.h * 60 + t.m > currentETMinutes);
    const suggestedStr = nextSuggested
      ? `${String(nextSuggested.h).padStart(2, "0")}:${String(nextSuggested.m).padStart(2, "0")} ET`
      : `${String(suggestedTimes[0]!.h).padStart(2, "0")}:${String(suggestedTimes[0]!.m).padStart(2, "0")} ET (tomorrow)`;

    // SL rotation suggestion
    const slOptions = [28, 35, 22];
    const currentSlIndex = slOptions.indexOf(r.propSlPips);
    const suggestedSl = currentSlIndex >= 0
      ? slOptions[(currentSlIndex + 1) % slOptions.length]
      : slOptions[Math.floor(Math.random() * slOptions.length)];

    // News analysis — uses shared classifyHazard logic (same as Calendar)
    const classifiedEvents = newsEvents.map((e) => ({
      ...e,
      secsUntil: e.datetime - nowSec,
      hazardLevel: classifyHazard(e.datetime - nowSec, e.impact),
    }));

    const newsCritical = classifiedEvents.filter((e) => e.hazardLevel === "critical");
    const newsWarning = classifiedEvents.filter((e) => e.hazardLevel === "warning");
    const newsCaution = classifiedEvents.filter((e) => e.hazardLevel === "caution");

    const nearestHigh = classifiedEvents
      .filter((e) => e.impact === "high" && e.secsUntil > -1800)
      .sort((a, b) => Math.abs(a.secsUntil) - Math.abs(b.secsUntil))[0];

    // Backward-compatible aliases
    const highWithin30min = newsCritical;
    const highWithin2h = newsWarning;
    const highWithin3h = newsCaution;

    // Bad trade data
    const badTrade = journal.find((t) => t.result === "WIN" && t.exPnl > 0);

    // Daily cap lock — check if won today (use local date for accuracy)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayTrades = journal.filter((t) => t.date === today && t.result !== "OPEN");
    const wonToday = todayTrades.some((t) => t.result === "WIN");
    const dailyCapLocked = wonToday && selectedAccount?.dailyProfitCap != null;
    const hasTradesToday = todayTrades.length > 0;

    // Margin call lock
    const marginCallLocked = recovery.bufferDepleted;

    // Critical legs warning
    const criticalLegs = recovery.adjustedRemainingLosses <= 2 && recovery.adjustedRemainingLosses > 0;

    const result: LiveRuleState[] = [
      // 1. Daily Profit Cap
      {
        rule: RULES[0]!,
        status: r.riskCapped ? "warning" as const : "ok" as const,
        message: r.riskCapped
          ? `Risk capped → $${r.cappedPropRisk.toFixed(2)} (reward $${(r.cappedPropRisk * r.rr).toFixed(2)})`
          : `Reward $${r.propWinPerTrade.toFixed(2)} — under $100 cap`,
      },

      // 1b. Daily Cap Lock — only green if all other conditions are also met
      {
        rule: RULES[10]!,
        status: dailyCapLocked ? "critical" as const : hasTradesToday ? "ok" as const : "info" as const,
        message: dailyCapLocked
          ? `You won a trade today. Do not trade again until tomorrow to avoid exceeding the $${selectedAccount?.dailyProfitCap} daily profit cap.`
          : hasTradesToday
            ? "You traded today but haven't won — you are clear to trade"
            : "No trades yet today — you are clear to trade",
      },

      // 2. Session — expanded windows with green/yellow/red
      {
        rule: RULES[1]!,
        status: inOverlap ? "ok" as const
          : inLondon || inNY ? "ok" as const
          : inPreLondon ? "info" as const
          : "warning" as const,
        message: inOverlap
          ? `PRIME TIME — London/NY overlap, ${formatCountdown(secsInOverlap)} left`
          : inLondon
          ? `London session active — overlap in ${formatCountdown(secsToOverlap)}`
          : inNY
          ? `NY session active — closes in ${formatCountdown(nyEnd - etSec)}`
          : inPreLondon
          ? `Pre-London — London opens in ${formatCountdown(secsToLondon)}`
          : nextGoodStart > 0
          ? `OFF-HOURS — next window (London) in ${formatCountdown(nextGoodStart)}`
          : `OFF-HOURS — wait for London open`,
        countdown: inOverlap ? formatCountdown(secsInOverlap)
          : inGoodWindow ? formatCountdown(inLondon ? secsToOverlap : nyEnd - etSec)
          : formatCountdown(nextGoodStart),
      },

      // 3. News ±30min rule (CRITICAL)
      {
        rule: RULES[2]!,
        status: highWithin30min.length > 0 ? "critical" : "ok",
        message: highWithin30min.length > 0
          ? `BLOCKED: ${highWithin30min[0]!.event.slice(0, 30)} — ${formatCountdown(highWithin30min[0]!.secsUntil)}`
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
          ? `WARNING: ${highWithin2h[0]!.event.slice(0, 30)} — ${formatCountdown(highWithin2h[0]!.secsUntil)}`
          : highWithin3h.length > 0
          ? `CAUTION: ${highWithin3h[0]!.event.slice(0, 25)} in ${formatCountdown(highWithin3h[0]!.secsUntil)}`
          : `No HIGH news in next 3 hours`,
        countdown: highWithin2h.length > 0
          ? formatCountdown(highWithin2h[0]!.secsUntil)
          : highWithin3h.length > 0
          ? formatCountdown(highWithin3h[0]!.secsUntil)
          : undefined,
      },

      // 5. Entry times — dynamic suggestion
      {
        rule: RULES[4]!,
        status: inGoodWindow ? "ok" as const : "info" as const,
        message: inGoodWindow
          ? `Next suggested entry: ${suggestedStr}`
          : `Outside trade window — next entry: ${suggestedStr}`,
        countdown: nextSuggested
          ? formatCountdown((nextSuggested.h * 3600 + nextSuggested.m * 60) - etSec)
          : undefined,
      },

      // 6. SL pips — rotation suggestion
      {
        rule: RULES[5]!,
        status: slOptions.includes(r.propSlPips) ? "ok" as const : "warning" as const,
        message: slOptions.includes(r.propSlPips)
          ? `Current: ${r.propSlPips} pips ✓ — next rotation: ${suggestedSl} pips`
          : `WARNING: SL ${r.propSlPips} not in rotation! Use ${slOptions.join(", ")}`,
      },

      // 7. Exness FIRST — reads from Daily Briefing checklist
      {
        rule: RULES[6]!,
        status: localStorage.getItem("gizzyfx.checklist.exnessFirst") === "true" ? "ok" : "info",
        message: "Manual check — always Exness first, wait for green, then Prop",
      },

      // 8. MT5 check — reads from Daily Briefing checklist
      {
        rule: RULES[7]!,
        status: localStorage.getItem("gizzyfx.checklist.mt5Check") === "true" ? "ok" : "info",
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

      // 10. Margin call lock
      {
        rule: RULES[11]!,
        status: marginCallLocked ? "critical" as const : "ok" as const,
        message: marginCallLocked
          ? `Exness buffer too low — deposit $${recovery.depositNeeded.toFixed(2)} to unlock execution`
          : "Exness buffer sufficient",
      },

      // 11. Critical legs warning
      {
        rule: RULES[12]!,
        status: criticalLegs ? "critical" as const : "ok" as const,
        message: criticalLegs
          ? `Prop account near blowout — ${recovery.adjustedRemainingLosses} legs left. Exness target at maximum capacity.`
          : `${recovery.adjustedRemainingLosses} legs remaining — safe`,
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

  // ── Auto-fetch Hermes analysis for high-impact events ──
  useEffect(() => {
    const upcomingHigh = newsEvents.filter(
      (e) => e.impact === "high" && e.datetime > nowSec && e.datetime - nowSec < 10800
    );
    for (const ev of upcomingHigh) {
      if (!hermesAnalyses[ev.id] && !analyzingEvents.has(ev.id)) {
        setAnalyzingEvents((prev) => new Set(prev).add(ev.id));
        // Simulate brief loading for UX
        setTimeout(() => {
          try {
            const result = analyzeNewsEvent({
              event_name: ev.event,
              currency: ev.pairs?.[0]?.slice(0, 3) || "USD",
              impact: ev.impact,
              forecast: "—",
              previous: "—",
            });
            setHermesAnalyses((prev) => ({ ...prev, [ev.id]: result }));
          } catch {
            // fail silently
          } finally {
            setAnalyzingEvents((prev) => {
              const next = new Set(prev);
              next.delete(ev.id);
              return next;
            });
          }
        }, 300);
      }
    }
  }, [newsEvents, tick]);

  // ── Master verdict — driven by the WORST rule status ──
  // If ANY rule is critical → DO NOT TRADE
  // If ANY rule is warning → CAUTION
  // Otherwise → CLEAR TO TRADE
  const sessionRule = liveRules.find((r) => r.rule.id === "session");
  const inTradingWindow = sessionRule?.status === "ok";
  const hasCritical = criticalCount > 0;
  const hasWarning = warningCount > 0;

  type Verdict = "GO" | "WAIT_NEWS" | "WAIT_SESSION" | "CAUTION";
  const verdict: Verdict = hasCritical ? "WAIT_NEWS"
    : !inTradingWindow ? "WAIT_SESSION"
    : hasWarning ? "CAUTION"
    : "GO";

  const verdictConfig = {
    GO: { icon: <ShieldCheck size={20} />, label: "CLEAR TO TRADE", bg: "oklch(var(--gz-pos) / 0.12)", border: "oklch(var(--gz-pos) / 0.3)", color: "oklch(var(--gz-pos))", sub: "All conditions met. Follow your entry rules." },
    CAUTION: { icon: <ShieldAlert size={20} />, label: "TRADE WITH CAUTION", bg: "oklch(var(--gz-warn) / 0.1)", border: "oklch(var(--gz-warn) / 0.25)", color: "oklch(var(--gz-warn))", sub: "News approaching. Enter only if setup is strong." },
    WAIT_NEWS: { icon: <ShieldX size={20} />, label: "DO NOT TRADE — NEWS", bg: "oklch(var(--gz-neg) / 0.12)", border: "oklch(var(--gz-neg) / 0.3)", color: "oklch(var(--gz-neg))", sub: "High-impact news within 30 minutes. Wait." },
    WAIT_SESSION: { icon: <Clock size={20} />, label: "WAIT FOR SESSION", bg: "oklch(var(--gz-warn) / 0.08)", border: "oklch(var(--gz-warn) / 0.2)", color: "oklch(var(--gz-warn))", sub: "Outside trading window. Wait for London or NY." },
  };
  const v = verdictConfig[verdict];

  const statusIcon = (status: LiveRuleState["status"]) => {
    const size = 14;
    switch (status) {
      case "critical": return <XCircle size={size} style={{ color: "oklch(var(--gz-neg))" }} />;
      case "warning": return <AlertTriangle size={size} style={{ color: "oklch(var(--gz-warn))" }} />;
      case "ok": return <CheckCircle2 size={size} style={{ color: "oklch(var(--gz-pos))" }} />;
      case "info": return <Info size={size} style={{ color: "oklch(var(--gz-p))" }} />;
    }
  };

  const statusBg = (status: LiveRuleState["status"]) => {
    switch (status) {
      case "critical": return { background: "oklch(var(--gz-neg) / 0.12)", border: "1px solid oklch(var(--gz-neg) / 0.3)" };
      case "warning": return { background: "oklch(var(--gz-warn) / 0.1)", border: "1px solid oklch(var(--gz-warn) / 0.25)" };
      case "ok": return { background: "oklch(var(--gz-pos) / 0.08)", border: "1px solid oklch(var(--gz-pos) / 0.2)" };
      case "info": return { background: "oklch(var(--gz-p) / 0.05)", border: "1px solid oklch(var(--gz-p) / 0.1)" };
    }
  };

  const statusTextColor = (status: LiveRuleState["status"]) => {
    switch (status) {
      case "critical": return "oklch(var(--gz-neg))";
      case "warning": return "oklch(var(--gz-warn))";
      case "ok": return "oklch(var(--gz-pos))";
      case "info": return "oklch(var(--gz-p))";
    }
  };

  const wat = getWATTime();
  const dualClock = `${formatTime(wat)} WAT · ${formatTime(et)} ET`;

  return (
    <div style={{ background: "oklch(var(--gz-bg))", border: "1px solid oklch(var(--gz-p) / 0.13)", borderRadius: "12px", overflow: "hidden" }}>
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid oklch(var(--gz-p) / 0.1)", background: "oklch(var(--gz-s1))" }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "oklch(var(--gz-p))" }}>
            Rules & Alerts
          </span>
          {/* Live status badges */}
          {criticalCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white animate-pulse"
              style={{ background: "oklch(var(--gz-neg))" }}>
              {criticalCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
              style={{ background: "oklch(var(--gz-warn) / 0.3)", color: "oklch(var(--gz-warn))" }}>
              {warningCount}
            </span>
          )}
          {criticalCount === 0 && warningCount === 0 && (
            <span className="flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-bold"
              style={{ background: "oklch(var(--gz-pos) / 0.15)", color: "oklch(var(--gz-pos))" }}>
              ALL OK
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Live pulse */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <div className="h-1.5 w-1.5 rounded-full animate-ping absolute" style={{ background: "oklch(var(--gz-p))", opacity: 0.4 }} />
              <div className="h-1.5 w-1.5 rounded-full relative" style={{ background: "oklch(var(--gz-p))" }} />
            </div>
            <span className="font-mono text-[10px] tabular-nums" style={{ color: "oklch(var(--gz-p))" }}>
              {dualClock}
            </span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] transition-colors"
            style={{ color: "oklch(var(--gz-p) / 0.6)" }}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </header>

      {expanded && (
        <div className="p-3 space-y-1.5">
          {/* ── MASTER TRADE VERDICT ── */}
          <div className="rounded-lg p-3 text-center" style={{
            background: v.bg,
            border: `2px solid ${v.border}`,
            borderLeftWidth: "5px",
          }}>
            <div className="text-[16px] font-black flex items-center justify-center gap-2" style={{ color: v.color }}>
              <span style={{ color: v.color }}>{v.icon}</span>
              {v.label}
            </div>
            <div className="text-[12px] mt-1" style={{ color: v.color, opacity: 0.8 }}>
              {v.sub}
            </div>
            <div className="flex justify-center gap-4 mt-2 text-[10px] font-mono tabular-nums" style={{ color: v.color, opacity: 0.6 }}>
              <span>{formatTime(wat)} WAT · {formatTime(et)} ET</span>
              <span>·</span>
              <span>{okCount} rules OK</span>
              {warningCount > 0 && <><span>·</span><span>{warningCount} warnings</span></>}
              {criticalCount > 0 && <><span>·</span><span>{criticalCount} critical</span></>}
            </div>
          </div>

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
                    style={{ background: "oklch(var(--gz-neg) / 0.2)", color: "oklch(var(--gz-neg))" }}>
                    CRITICAL
                  </span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: statusTextColor("critical"), opacity: 0.8 }}>
                  {bufferAlert.message}
                </div>
              </div>
            </div>
          )}

          {/* ── HERMES NEWS ANALYSIS ── */}
          {(() => {
            const eventsWithAnalysis = newsEvents
              .filter((e) => hermesAnalyses[e.id] && e.impact === "high" && e.datetime > nowSec && e.datetime - nowSec < 10800);
            
            if (eventsWithAnalysis.length === 0) return null;
            
            return (
              <div className="rounded-lg overflow-hidden" style={{ background: "oklch(var(--gz-p) / 0.03)", border: "1px solid oklch(var(--gz-p) / 0.15)" }}>
                <div className="px-3 py-2 flex items-center gap-2" style={{ background: "oklch(var(--gz-p) / 0.05)", borderBottom: "1px solid oklch(var(--gz-p) / 0.1)" }}>
                  <Bot size={14} style={{ color: "oklch(var(--gz-p))" }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "oklch(var(--gz-p))" }}>
                    Hermes News Analysis
                  </span>
                </div>
                <div className="p-2 space-y-2">
                  {eventsWithAnalysis.map((ev) => {
                    const analysis = hermesAnalyses[ev.id];
                    if (!analysis) return null;
                    const dirColor =
                      analysis.direction === "BUY" ? "oklch(var(--gz-pos))" :
                      analysis.direction === "SELL" ? "oklch(var(--gz-neg))" :
                      "oklch(var(--gz-mut))";
                    const DirIcon =
                      analysis.direction === "BUY" ? TrendingUp :
                      analysis.direction === "SELL" ? TrendingDown :
                      Minus;
                    return (
                      <div
                        key={ev.id}
                        className="rounded p-2.5"
                        style={{
                          background: "oklch(var(--gz-s2))",
                          border: `1px solid ${ev.impact === "high" ? "oklch(var(--gz-neg) / 0.2)" : "oklch(var(--gz-p) / 0.1)"}`,
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="badge badge-danger" style={{ fontSize: 8, padding: "1px 5px" }}>
                              {ev.impact.toUpperCase()}
                            </span>
                            <span className="text-[11px] font-bold" style={{ color: "oklch(var(--gz-txt))" }}>
                              {ev.event.slice(0, 30)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[9px] tabular-nums" style={{ color: "oklch(var(--gz-mut))" }}>
                              {formatCountdown(ev.datetime - nowSec)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ background: `${dirColor}15`, border: `1px solid ${dirColor}30` }}>
                            <DirIcon size={10} style={{ color: dirColor }} />
                            <span className="font-mono text-[10px] font-bold" style={{ color: dirColor }}>
                              {analysis.direction}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px]" style={{ color: "oklch(var(--gz-mut))" }}>Confidence</span>
                            <div className="h-1.5 w-12 rounded-full overflow-hidden" style={{ background: "oklch(var(--gz-s3))" }}>
                              <div className="h-full rounded-full" style={{ width: `${analysis.confidence}%`, background: dirColor }} />
                            </div>
                            <span className="font-mono text-[9px] font-bold" style={{ color: dirColor }}>
                              {analysis.confidence}%
                            </span>
                          </div>
                          <div className="flex gap-0.5 ml-auto">
                            {analysis.affected_pairs.slice(0, 3).map((p) => (
                              <span key={p} className="badge badge-neutral" style={{ fontSize: 7, padding: "0 3px" }}>
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-[9px] leading-relaxed" style={{ color: "oklch(var(--gz-txt) / 0.85)" }}>
                          {analysis.analysis}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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
                          background: lr.status === "critical" ? "oklch(var(--gz-neg) / 0.2)" : "oklch(var(--gz-neg) / 0.1)",
                          color: lr.status === "critical" ? "oklch(var(--gz-neg))" : "oklch(var(--gz-neg) / 0.6)",
                        }}>
                        CRITICAL
                      </span>
                    )}
                    <span className="text-[8px] uppercase" style={{ color: "oklch(var(--gz-p) / 0.4)" }}>
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
          <div className="mt-2 rounded-lg p-2.5 flex items-center gap-3" style={{ background: "oklch(var(--gz-p) / 0.03)", border: "1px solid oklch(var(--gz-p) / 0.08)" }}>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <div
                  className={`h-2 w-2 rounded-full ${market.open ? "animate-ping" : ""} absolute`}
                  style={{ background: market.open ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))", opacity: 0.4 }}
                />
                <div
                  className="h-2 w-2 rounded-full relative"
                  style={{ background: market.open ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))" }}
                />
              </div>
              <span className="text-[10px] font-bold" style={{ color: market.open ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))" }}>
                {market.open ? "MARKET OPEN" : "MARKET CLOSED"}
              </span>
            </div>
            <span className="text-[9px]" style={{ color: "oklch(var(--gz-p) / 0.5)" }}>
              {market.detail.slice(0, 60)}
            </span>
            <span className="ml-auto font-mono text-[9px] tabular-nums" style={{ color: "oklch(var(--gz-p) / 0.5)" }}>
              {market.changesIn}
            </span>
            <span className="font-mono text-[9px]" style={{ color: "oklch(var(--gz-p) / 0.4)" }}>
              {r.phase === 1 ? "Phase 1" : "Phase 2"} · R:R 1:{r.rr}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
