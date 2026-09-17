import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { computeRecovery } from "@/lib/recovery";
import { marketStatus } from "@/lib/market-hours";
import { classifyHazard } from "@/lib/news-hazard";
import {
  ShieldCheck, ShieldX, AlertTriangle, AlertOctagon, Lock,
  Clock, Activity, TrendingDown, Eye, EyeOff, ChevronDown,
  ChevronUp, Zap, Target, Shield, Radio,
} from "lucide-react";
import { getEasternTime } from "@/lib/timezone";

/* ── Types ────────────────────────────────────────────────────── */

type SentinelLevel = "red" | "amber" | "green";

interface SentinelMessage {
  id: string;
  level: SentinelLevel;
  title: string;
  message: string;
  page?: string;
  timestamp: number;
}

interface NewsEvent {
  id: string;
  impact: string;
  event: string;
  datetime: number;
  pairs: string[];
}

/* ── Hook: useRiskSentinel ────────────────────────────────────── */

export function useRiskSentinel() {
  const { engine, journal, accounts, meta } = useStore();
  const r = useEngine();
  const recovery = computeRecovery(r, journal);
  const selectedAccount = accounts.find((a) => a.id === engine.selectedAccountId);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const market = marketStatus();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const wonToday = journal.some((t) => t.date === today && t.result === "WIN");

  // ── Fetch economic calendar events for news check ──
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const fetchingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const fetchNews = async () => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        const res = await fetch("/api/events?days=7");
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        const items: NewsEvent[] = (data.events || [])
          .filter((e: any) => e.time && e.event)
          .map((e: any) => ({
            id: e.id,
            impact: e.impact || "low",
            event: e.event || "",
            datetime: e.datetime || 0,
            pairs: e.pairs || [],
          }));
        setNewsEvents(items);
      } catch {
        // fail silently
      } finally {
        fetchingRef.current = false;
      }
    };
    fetchNews();
    const interval = setInterval(fetchNews, 120_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // ── Analyze all pages ──────────────────────────────────────────
  const analysis = useMemo(() => {
    const messages: SentinelMessage[] = [];
    let currentLevel: SentinelLevel = "green";
    let coachingTip = "";

    const bumpLevel = (l: SentinelLevel) => {
      if (l === "red") currentLevel = "red";
      else if (l === "amber" && currentLevel !== "red") currentLevel = "amber";
    };

    // 1. Weekend check
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const isWeekend = (day === 5 && hour >= 22) || day === 6 || (day === 0 && hour < 22);
    if (isWeekend) {
      messages.push({
        id: "weekend",
        level: "red",
        title: "MARKET CLOSED",
        message: "Weekend. No trading.",
        timestamp: Date.now(),
      });
      currentLevel = "red";
      coachingTip = "Step away from the charts. Rest.";
      return { messages, currentLevel, coachingTip };
    }

    // 2. Daily cap lock
    if (wonToday && selectedAccount?.dailyProfitCap != null) {
      messages.push({
        id: "daily-cap",
        level: "red",
        title: "DAILY CAP LOCK",
        message: `Won today. Do not trade until tomorrow.`,
        page: "Journal",
        timestamp: Date.now(),
      });
      bumpLevel("red");
      coachingTip = "You already won today. Close the laptop.";
    }

    // 3. Buffer depleted
    if (recovery.bufferDepleted) {
      messages.push({
        id: "buffer",
        level: "red",
        title: "BUFFER DEPLETED",
        message: `Deposit $${recovery.depositNeeded.toFixed(2)} to Exness.`,
        page: "Engine",
        timestamp: Date.now(),
      });
      bumpLevel("red");
      coachingTip = "Deposit to Exness before trading.";
    }

    // 4. Critical legs
    if (recovery.adjustedRemainingLosses <= 2 && recovery.adjustedRemainingLosses > 0) {
      messages.push({
        id: "critical-legs",
        level: "red",
        title: "CRITICAL LEGS",
        message: `${recovery.adjustedRemainingLosses} legs left. Extreme caution.`,
        page: "Engine",
        timestamp: Date.now(),
      });
      bumpLevel("red");
      coachingTip = "Near blowout. Only A+ setups.";
    }

    // 5. Slippage debt
    if (recovery.slippageDebt > 0) {
      messages.push({
        id: "slippage-debt",
        level: "amber",
        title: "SLIPPAGE DEBT",
        message: `$${recovery.slippageDebt.toFixed(2)} debt. Target bumped to $${recovery.newExnessWinTarget.toFixed(2)}.`,
        page: "Engine",
        timestamp: Date.now(),
      });
      bumpLevel("amber");
    }

    // 6. Economic news check — uses shared classifyHazard logic (same as Calendar)
    const nowSec = Math.floor(Date.now() / 1000);
    const classifiedEvents = newsEvents.map((e) => ({
      ...e,
      secsUntil: e.datetime - nowSec,
      hazardLevel: classifyHazard(e.datetime - nowSec, e.impact as "high" | "medium" | "low"),
    }));

    const newsCritical = classifiedEvents.filter((e) => e.hazardLevel === "critical");
    const newsWarning = classifiedEvents.filter((e) => e.hazardLevel === "warning");
    const newsCaution = classifiedEvents.filter((e) => e.hazardLevel === "caution");

    // CRITICAL: HIGH news within 30 minutes
    if (newsCritical.length > 0) {
      const ev = newsCritical[0]!;
      const mins = Math.abs(Math.round(ev.secsUntil / 60));
      messages.push({
        id: "news-critical",
        level: "red",
        title: "NEWS BLOCKED",
        message: `${ev.event.slice(0, 35)} — ${mins <= 0 ? "NOW" : `${mins}min`}`,
        page: "Calendar",
        timestamp: Date.now(),
      });
      bumpLevel("red");
      if (!coachingTip) coachingTip = `High-impact news: ${ev.event.slice(0, 30)}. Wait.`;
    }
    // WARNING: HIGH news within 2 hours
    else if (newsWarning.length > 0) {
      const ev = newsWarning[0]!;
      const mins = Math.round(ev.secsUntil / 60);
      messages.push({
        id: "news-warning",
        level: "amber",
        title: "NEWS APPROACHING",
        message: `${ev.event.slice(0, 35)} in ${mins}min`,
        page: "Calendar",
        timestamp: Date.now(),
      });
      bumpLevel("amber");
      if (!coachingTip) coachingTip = `News approaching: ${ev.event.slice(0, 30)} in ${mins}min.`;
    }
    // CAUTION: MEDIUM news within 30 minutes
    else if (newsCaution.length > 0) {
      const ev = newsCaution[0]!;
      const mins = Math.abs(Math.round(ev.secsUntil / 60));
      messages.push({
        id: "news-caution",
        level: "amber",
        title: "NEWS CAUTION",
        message: `${ev.event.slice(0, 35)} — ${mins <= 0 ? "NOW" : `${mins}min`}`,
        page: "Calendar",
        timestamp: Date.now(),
      });
      bumpLevel("amber");
      if (!coachingTip) coachingTip = `Medium news: ${ev.event.slice(0, 30)}.`;
    }

    // 7. Session & Overlap Check — Active across all major session overlaps & market hours
    const et = getEasternTime();
    const etSec = et.totalSeconds;
    const inLondonNyOverlap = etSec >= 8 * 3600 && etSec < 12 * 3600;
    const inSydneyTokyoOverlap = etSec >= 19 * 3600 || etSec < 2 * 3600;
    const inTokyoLondonOverlap = etSec >= 3 * 3600 && etSec < 4 * 3600;
    const inLondon = etSec >= 3 * 3600 && etSec < 12 * 3600;
    const inNY = etSec >= 8 * 3600 && etSec < 17 * 3600;
    const inTokyo = etSec >= 19 * 3600 || etSec < 4 * 3600;
    const inSydney = etSec >= 17 * 3600 || etSec < 2 * 3600;

    const inAnyOverlap = inLondonNyOverlap || inSydneyTokyoOverlap || inTokyoLondonOverlap;
    const inActiveSession = inLondon || inNY || inTokyo || inSydney;
    const inTradeableWindow = inAnyOverlap || inActiveSession;

    if (!coachingTip && market.open) {
      if (inLondonNyOverlap) {
        coachingTip = "London/NY overlap live — peak liquidity. Follow SMC rules.";
      } else if (inTokyoLondonOverlap) {
        coachingTip = "Tokyo/London overlap live — European open transition.";
      } else if (inSydneyTokyoOverlap) {
        coachingTip = "Sydney/Tokyo overlap live — Asian session volume.";
      } else if (inLondon) {
        coachingTip = "London session open — solid trend continuation.";
      } else if (inNY) {
        coachingTip = "New York session open — high volume.";
      } else if (inTokyo) {
        coachingTip = "Tokyo session open — Asian range active.";
      } else if (inSydney) {
        coachingTip = "Sydney session open — Pacific market flow.";
      }
    }

    // 7b. Late-Day Cutoff & Rollover Defense (3:00 PM - 7:00 PM ET / 8:00 PM - 12:00 AM WAT)
    const isLateAfternoon = etSec >= 15 * 3600 && etSec < 19 * 3600;
    const isNightRollover = etSec >= 16.5 * 3600 && etSec < 18 * 3600;

    if (isNightRollover) {
      messages.push({
        id: "rollover-danger",
        level: "red",
        title: "ROLLOVER SPREAD DANGER",
        message: "5:00 PM ET (10:00 PM WAT) broker rollover active. Extreme spread widening & swap! Trading blocked.",
        page: "Calendar",
        timestamp: Date.now(),
      });
      bumpLevel("red");
      if (!coachingTip) coachingTip = "5 PM rollover active. Spreads widen up to 10x. Wait for Asian session.";
    } else if (isLateAfternoon) {
      messages.push({
        id: "late-cutoff",
        level: "amber",
        title: "LATE DAY CUTOFF",
        message: "Past 3:00 PM ET (8:00 PM WAT). High risk of rollover spread widening & overnight slippage.",
        page: "Calendar",
        timestamp: Date.now(),
      });
      bumpLevel("amber");
      if (!coachingTip) coachingTip = "Past 3 PM ET cutoff. Avoid new entries to protect against night slippage.";
    }

    // 8. Phase 2 warning
    if (engine.phase === 2) {
      messages.push({
        id: "phase2",
        level: "amber",
        title: "FUNDED PHASE",
        message: "Phase 2 active. Verify lot size and risk parameters.",
        page: "Engine",
        timestamp: Date.now(),
      });
      bumpLevel("amber");
    }

    // 9. No MT5 connection
    if (!meta.token || !meta.exnessAccountId) {
      messages.push({
        id: "no-mt5",
        level: "amber",
        title: "MT5 NOT CONNECTED",
        message: "Add MetaApi credentials in Settings.",
        page: "Settings",
        timestamp: Date.now(),
      });
      bumpLevel("amber");
      if (!coachingTip) coachingTip = "Connect MT5 in Settings before trading.";
    }

    // 10. Bad journal data
    const badTrade = journal.find((t) => t.result === "WIN" && t.exPnl > 0);
    if (badTrade) {
      messages.push({
        id: "bad-data",
        level: "red",
        title: "BAD JOURNAL DATA",
        message: `Trade #${badTrade.id} has wrong P&L signs.`,
        page: "Journal",
        timestamp: Date.now(),
      });
      bumpLevel("red");
      if (!coachingTip) coachingTip = "Fix bad journal data before trading.";
    }

    // 11. All clear
    if (messages.length === 0) {
      coachingTip = "All clear. Follow your rules and execute with discipline.";
    }

    return { messages, currentLevel, coachingTip };
  }, [tick, engine, journal, accounts, meta, recovery, r, selectedAccount, wonToday, newsEvents, now]);

  return analysis;
}

/* ── Component: GlobalRiskSentinel ────────────────────────────── */

export function GlobalRiskSentinel() {
  const [expanded, setExpanded] = useState(false);
  const [requireGreen, setRequireGreen] = useState(() => {
    try { return localStorage.getItem("gizzyfx.sentinel.requireGreen") === "true"; } catch { return false; }
  });
  const [active, setActive] = useState(() => {
    try { return localStorage.getItem("gizzyfx.sentinel.active") !== "false"; } catch { return true; }
  });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const analysis = useRiskSentinel();

  const toggleRequireGreen = () => {
    const next = !requireGreen;
    setRequireGreen(next);
    try { localStorage.setItem("gizzyfx.sentinel.requireGreen", String(next)); } catch {}
  };

  const toggleActive = () => {
    const next = !active;
    setActive(next);
    try { localStorage.setItem("gizzyfx.sentinel.active", String(next)); } catch {}
  };

  const dismissMessage = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      setExpanded(false); // collapse on resize
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const visibleMessages = analysis.messages.filter((m) => !dismissed.has(m.id));
  const level = analysis.currentLevel;

  const levelColors = {
    red: { bg: "oklch(var(--gz-neg) / 0.15)", border: "oklch(var(--gz-neg) / 0.4)", text: "oklch(var(--gz-neg))", dot: "oklch(var(--gz-neg))" },
    amber: { bg: "oklch(var(--gz-warn) / 0.12)", border: "oklch(var(--gz-warn) / 0.3)", text: "oklch(var(--gz-warn))", dot: "oklch(var(--gz-warn))" },
    green: { bg: "oklch(var(--gz-pos) / 0.12)", border: "oklch(var(--gz-pos) / 0.3)", text: "oklch(var(--gz-pos))", dot: "oklch(var(--gz-pos))" },
    hidden: { bg: "transparent", border: "transparent", text: "transparent", dot: "transparent" },
  };

  const colors = levelColors[level];

  // If hidden via eye icon, render a discrete floating eye button so you can bring the coach back anytime
  if (!active) {
    return (
      <button
        onClick={toggleActive}
        style={{
          position: "fixed",
          bottom: isMobile ? 70 : 16,
          right: 16,
          zIndex: 99990,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          borderRadius: 20,
          background: "oklch(var(--gz-s1) / 0.95)",
          border: `1.5px solid ${colors.border}`,
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          cursor: "pointer",
          color: colors.text,
          transition: "all 0.2s ease",
        }}
        title="Click to show Risk Coach"
      >
        <div style={{ position: "relative" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.dot }} />
          <div className="animate-ping" style={{ position: "absolute", inset: 0, width: 8, height: 8, borderRadius: "50%", background: colors.dot, opacity: 0.4 }} />
        </div>
        <Eye size={14} style={{ color: colors.text }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {level === "red" ? "STOP" : level === "amber" ? "CAUTION" : "COACH"}
        </span>
      </button>
    );
  }

  // Mobile: top-right badge BELOW header, with expandable panel
  if (isMobile) {
    return (
      <>
        {/* Compact badge */}
        <div
          style={{
            position: "fixed",
            ...(isMobile
              ? { bottom: 74, right: 12 }
              : { top: "calc(var(--cmdbar-h, 90px) + 8px)", right: 16 }),
            zIndex: 99990,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: "oklch(var(--gz-s1))",
            border: `1.5px solid ${colors.border}`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <div style={{ position: "relative" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.dot }} />
            <div className="animate-ping" style={{ position: "absolute", inset: 0, width: 8, height: 8, borderRadius: "50%", background: colors.dot, opacity: 0.3 }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: colors.text }}>
            {level === "red" ? "STOP" : level === "amber" ? "CAUTION" : "COACH"}
          </span>
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, background: requireGreen ? "oklch(var(--gz-pos) / 0.15)" : "oklch(var(--gz-mut) / 0.1)", color: requireGreen ? "oklch(var(--gz-pos))" : "oklch(var(--gz-mut))" }}>
            {requireGreen ? "STRICT" : "RELAXED"}
          </span>
          {expanded ? <ChevronUp size={12} style={{ color: "oklch(var(--gz-mut))" }} /> : <ChevronDown size={12} style={{ color: "oklch(var(--gz-mut))" }} />}
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div
            style={{
              position: "fixed",
              ...(isMobile
                ? { bottom: 120, left: 12, right: 12, maxHeight: "55vh" }
                : { top: "calc(var(--cmdbar-h, 90px) + 52px)", right: 16, width: 380, maxHeight: "50vh" }),
              zIndex: 99989,
              overflowY: "auto",
              background: "oklch(var(--gz-s1))",
              border: `1.5px solid ${colors.border}`,
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            }}
          >
            {/* Coaching tip */}
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, paddingRight: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 4 }}>
                  {level === "red" ? "STOP" : level === "amber" ? "CAUTION" : "COACH"}
                </div>
                <div style={{ fontSize: 12, color: "oklch(var(--gz-txt))", lineHeight: 1.5 }}>
                  {analysis.coachingTip}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); toggleActive(); }}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
                title="Minimize coach to floating eye icon"
              >
                <EyeOff size={14} />
              </button>
            </div>
            {/* Messages */}
            {visibleMessages.length > 0 && (
              <div style={{ padding: "10px 16px" }}>
                {visibleMessages.slice(0, 3).map((msg) => {
                  const msgColors = levelColors[msg.level];
                  return (
                    <div key={msg.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                      {msg.level === "red" ? <AlertOctagon size={12} style={{ color: msgColors.text }} /> :
                       msg.level === "amber" ? <AlertTriangle size={12} style={{ color: msgColors.text }} /> :
                       <ShieldCheck size={12} style={{ color: msgColors.text }} />}
                      <span style={{ fontSize: 11, fontWeight: 600, color: msgColors.text }}>{msg.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  // Desktop: original bottom-right panel

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 1000,
        width: expanded ? 380 : 280,
        maxHeight: expanded ? "70vh" : "auto",
        background: "oklch(var(--gz-s1) / 0.95)",
        backdropFilter: "blur(12px)",
        border: `2px solid ${colors.border}`,
        borderRadius: 12,
        boxShadow: "0 8px 32px oklch(0 0 0 / 0.4)",
        overflow: "hidden",
        transition: "all 0.2s ease",
      }}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        style={{ background: colors.bg }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: colors.dot }}
            />
            <div
              className="h-2.5 w-2.5 rounded-full absolute inset-0 animate-ping"
              style={{ background: colors.dot, opacity: 0.3 }}
            />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.text }}>
            Risk Sentinel
          </span>
          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "oklch(var(--gz-p) / 0.15)", color: "oklch(var(--gz-p))" }}>
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); toggleRequireGreen(); }}
            className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: requireGreen ? "oklch(var(--gz-pos) / 0.15)" : "oklch(var(--gz-mut) / 0.1)",
              color: requireGreen ? "oklch(var(--gz-pos))" : "oklch(var(--gz-mut))",
              border: `1px solid ${requireGreen ? "oklch(var(--gz-pos) / 0.3)" : "oklch(var(--gz-mut) / 0.2)"}`,
            }}
            title={requireGreen ? "Green check required (click to disable)" : "Green check optional (click to enable)"}
          >
            {requireGreen ? "STRICT" : "RELAXED"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleActive(); }}
            className="p-0.5 rounded transition-colors hover:bg-white/10"
            style={{ color: "oklch(var(--gz-mut))" }}
            title="Minimize coach to floating eye icon (click to restore anytime)"
          >
            <EyeOff size={12} />
          </button>
          {expanded ? <ChevronUp size={14} style={{ color: "oklch(var(--gz-mut))" }} /> : <ChevronDown size={14} style={{ color: "oklch(var(--gz-mut))" }} />}
        </div>
      </div>

      {/* ── Coaching Tip ────────────────────────────────────── */}
      <div className="px-3 py-2" style={{ borderTop: `1px solid ${colors.border}` }}>
        <div className="text-[11px] font-bold mb-0.5" style={{ color: colors.text }}>
          {level === "red" ? "STOP" : level === "amber" ? "CAUTION" : "COACH"}
        </div>
        <div className="text-[10px]" style={{ color: "oklch(var(--gz-txt))", opacity: 0.85 }}>
          {analysis.coachingTip}
        </div>
      </div>

      {/* ── Expanded: Messages ─────────────────────────────── */}
      {expanded && (
        <div className="px-3 py-2 space-y-2" style={{ borderTop: `1px solid ${colors.border}`, maxHeight: "40vh", overflowY: "auto" }}>
          {visibleMessages.length === 0 ? (
            <div className="text-[10px] text-center py-2" style={{ color: "oklch(var(--gz-pos))" }}>
              All systems nominal. No alerts.
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const msgColors = levelColors[msg.level];
              return (
                <div
                  key={msg.id}
                  className="rounded-lg p-2"
                  style={{ background: msgColors.bg, border: `1px solid ${msgColors.border}` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {msg.level === "red" ? <AlertOctagon size={12} style={{ color: msgColors.text }} /> :
                       msg.level === "amber" ? <AlertTriangle size={12} style={{ color: msgColors.text }} /> :
                       <ShieldCheck size={12} style={{ color: msgColors.text }} />}
                      <span className="text-[10px] font-bold" style={{ color: msgColors.text }}>
                        {msg.title}
                      </span>
                    </div>
                    <button
                      onClick={() => dismissMessage(msg.id)}
                      className="text-[8px] font-bold px-1 py-0.5 rounded hover:bg-white/10"
                      style={{ color: "oklch(var(--gz-mut))" }}
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: msgColors.text, opacity: 0.85 }}>
                    {msg.message}
                  </div>
                  {msg.page && (
                    <div className="text-[8px] mt-0.5 font-mono" style={{ color: "oklch(var(--gz-mut))" }}>
                      Page: {msg.page}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Footer: Status Indicators ───────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: `1px solid ${colors.border}`, background: "oklch(var(--gz-s2) / 0.5)" }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: "oklch(var(--gz-pos))" }} />
            <span className="text-[8px]" style={{ color: "oklch(var(--gz-mut))" }}>Market</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: level === "red" ? "oklch(var(--gz-neg))" : "oklch(var(--gz-pos))" }} />
            <span className="text-[8px]" style={{ color: "oklch(var(--gz-mut))" }}>Status</span>
          </div>
        </div>
        <span className="text-[8px] font-mono" style={{ color: "oklch(var(--gz-mut))" }}>
          {visibleMessages.length} alert{visibleMessages.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

/* ── Hook: useGreenCheckRequired ─────────────────────────────── */

export function useGreenCheckRequired(): { canTrade: boolean; reason: string } {
  const { engine, journal, accounts, meta } = useStore();
  const r = useEngine();
  const recovery = computeRecovery(r, journal);
  const selectedAccount = accounts.find((a) => a.id === engine.selectedAccountId);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const requireGreen = (() => {
    try { return localStorage.getItem("gizzyfx.sentinel.requireGreen") === "true"; } catch { return false; }
  })();

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const wonToday = journal.some((t) => t.date === today && t.result === "WIN");
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const isWeekend = (day === 5 && hour >= 22) || day === 6 || (day === 0 && hour < 22);

  if (!requireGreen) {
    return { canTrade: true, reason: "Relaxed mode — no green check required." };
  }

  if (isWeekend) return { canTrade: false, reason: "Market closed (weekend)." };
  if (wonToday && selectedAccount?.dailyProfitCap != null) return { canTrade: false, reason: "Daily cap lock — already won today." };
  if (recovery.bufferDepleted) return { canTrade: false, reason: "Buffer depleted — deposit required." };
  if (recovery.adjustedRemainingLosses <= 2 && recovery.adjustedRemainingLosses > 0) return { canTrade: false, reason: "Critical legs — near blowout." };
  if (!meta.token || !meta.exnessAccountId) return { canTrade: false, reason: "MT5 not connected." };

  const isNightRollover = etSec >= 16.5 * 3600 && etSec < 18 * 3600;
  if (isNightRollover) return { canTrade: false, reason: "Rollover danger zone (4:30–6:00 PM ET / 9:30–11:00 PM WAT). Extreme spread widening." };

  // Check tradeable sessions & overlaps
  const et = getEasternTime();
  const etSec = et.totalSeconds;
  const inLondonNy = etSec >= 8 * 3600 && etSec < 12 * 3600;
  const inSydneyTokyo = etSec >= 19 * 3600 || etSec < 2 * 3600;
  const inTokyoLondon = etSec >= 3 * 3600 && etSec < 4 * 3600;
  const inLondon = etSec >= 3 * 3600 && etSec < 12 * 3600;
  const inNY = etSec >= 8 * 3600 && etSec < 17 * 3600;
  const inTokyo = etSec >= 19 * 3600 || etSec < 4 * 3600;
  const inSydney = etSec >= 17 * 3600 || etSec < 2 * 3600;
  const inTradeableWindow = inLondonNy || inSydneyTokyo || inTokyoLondon || inLondon || inNY || inTokyo || inSydney;

  if (!inTradeableWindow && isWeekend) return { canTrade: false, reason: "Market closed (weekend)." };

  return { canTrade: true, reason: "All checks green. Cleared for entry." };
}
