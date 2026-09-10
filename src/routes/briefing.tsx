import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { computeRecovery } from "@/lib/recovery";
import { money } from "@/lib/engine/calc";
import { marketStatus } from "@/lib/market-hours";
import { getEasternTime } from "@/lib/timezone";
import { useRiskSentinel } from "@/components/terminal/GlobalRiskSentinel";
import {
  AlertOctagon, AlertTriangle, CheckCircle2, Clock, DollarSign, Shield,
  ShieldCheck, ShieldX, Target, TrendingUp, Wallet, Zap, Radio, ArrowRightLeft,
  FileWarning, Lock, RefreshCw, Activity, TrendingDown, BarChart3, ClipboardList,
} from "lucide-react";

export const Route = createFileRoute("/briefing")({
  head: () => ({
    meta: [
      { title: "Daily Briefing — GizzyFx" },
      { name: "description", content: "Morning checklist and real-time status report for GizzyFx traders." },
    ],
  }),
  component: DailyBriefingPage,
});

type StatusLevel = "red" | "amber" | "green";

interface StatusConfig {
  icon: React.ReactNode;
  title: string;
  message: string;
  steps?: string[];
  level: StatusLevel;
}

const statusStyles: Record<StatusLevel, { bg: string; border: string; text: string }> = {
  red: { bg: "oklch(var(--gz-neg) / 0.12)", border: "oklch(var(--gz-neg) / 0.3)", text: "oklch(var(--gz-neg))" },
  amber: { bg: "oklch(var(--gz-warn) / 0.1)", border: "oklch(var(--gz-warn) / 0.25)", text: "oklch(var(--gz-warn))" },
  green: { bg: "oklch(var(--gz-pos) / 0.12)", border: "oklch(var(--gz-pos) / 0.3)", text: "oklch(var(--gz-pos))" },
};

function DailyBriefingPage() {
  const { engine, journal, accounts, meta } = useStore();
  const r = useEngine();
  const recovery = computeRecovery(r, journal);
  const selectedAccount = accounts.find((a) => a.id === engine.selectedAccountId);
  const [tick, setTick] = useState(0);
  const [newItem, setNewItem] = useState("");
  const [tradeNumber, setTradeNumber] = useState(1);
  const [expandedTrades, setExpandedTrades] = useState<Set<number>>(new Set());

  // Checklist item structure
  interface CheckItem {
    label: string;
    checked: boolean;
  }

  // Completed trade history
  interface CompletedTrade {
    tradeNumber: number;
    date: string;
    items: CheckItem[];
    completedAt: string;
  }

  const defaultItems = {
    1: [
      "I have checked ForexFactory.com — NO red-folder news in the next 2 hours",
      "It is currently between 13:00–16:00 EST (best liquidity, lowest spread)",
      "Exness FIRST → Prop SECOND — CRITICAL execution — Manual check: always Exness first, wait for green, then Prop",
      "Check Live MT5 tab before trading — CRITICAL execution: verify Live MT5 tab shows balance before trading",
      "I will place the EXNESS trade FIRST via the Execute button and wait for green confirmation",
      "I will then manually place the PROP trade on my phone at the EXACT same price",
      "If I hit a WIN on Prop today, I will STOP TRADING for the rest of the day (Daily Cap Rule)",
      "If I hit a LOSS, I will log it in the Journal immediately using 'Sync Exness History'",
    ],
    2: [
      "I have checked ForexFactory.com — NO red-folder news in the next 2 hours",
      "It is currently between 13:00–16:00 EST (best liquidity, lowest spread)",
      "Exness FIRST → Prop SECOND — CRITICAL execution — Manual check: always Exness first, wait for green, then Prop",
      "Check Live MT5 tab before trading — CRITICAL execution: verify Live MT5 tab shows balance before trading",
      "I have confirmed the Funded Phase lot size and risk parameters",
      "I will place the EXNESS trade FIRST via the Execute button and wait for green confirmation",
      "I will then manually place the PROP trade on my phone at the EXACT same price",
      "If I hit a WIN on Prop today, I will STOP TRADING for the rest of the day (Daily Cap Rule)",
      "If I hit a LOSS, I will log it in the Journal immediately using 'Sync Exness History'",
      "I have verified the Funded Phase drawdown limit is not breached",
    ],
  };

  // Current trade items — always start fresh for each trade
  const [currentItems, setCurrentItems] = useState<CheckItem[]>(() => {
    const phaseDefaults = defaultItems[r.phase] || defaultItems[1];
    // Check if we have saved state in localStorage
    try {
      const saved = localStorage.getItem("gizzyfx.checklist.current");
      if (saved) {
        const parsed = JSON.parse(saved) as CheckItem[];
        // Validate structure matches current phase defaults
        if (parsed.length >= phaseDefaults.length) {
          return parsed;
        }
      }
    } catch {}
    return phaseDefaults.map((label) => ({ label, checked: false }));
  });

  // Completed trades history
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>(() => {
    try {
      const saved = localStorage.getItem("gizzyfx.checklist.history");
      if (saved) return JSON.parse(saved) as CompletedTrade[];
    } catch {}
    return [];
  });

  // Save current items (with localStorage for RulesAlertPanel bridge)
  const saveCurrentItems = (items: CheckItem[]) => {
    setCurrentItems(items);
    localStorage.setItem("gizzyfx.checklist.current", JSON.stringify(items));
  };

  // Save completed trades to localStorage
  const saveCompletedTrades = (trades: CompletedTrade[]) => {
    setCompletedTrades(trades);
    localStorage.setItem("gizzyfx.checklist.history", JSON.stringify(trades));
  };

  // ── Auto-validation: check if objective conditions are met ──
  const et = getEasternTime();
  const etSec = et.totalSeconds;
  const overlapStart = 13 * 3600;
  const overlapEnd = 16 * 3600;
  const londonStart = 8 * 3600;
  const londonEnd = 12 * 3600;
  const nyStart = 13 * 3600;
  const nyEnd = 17 * 3600;
  const inOverlap = etSec >= overlapStart && etSec < overlapEnd;
  const inLondon = etSec >= londonStart && etSec < londonEnd;
  const inNY = etSec >= nyStart && etSec < nyEnd;
  const inGoodWindow = inOverlap || inLondon || inNY;

  // Auto-condition functions per item
  const autoConditions: Record<string, boolean> = {
    "I have checked ForexFactory.com — NO red-folder news in the next 2 hours": false, // always manual
    "It is currently between 13:00–16:00 EST (best liquidity, lowest spread)": inOverlap,
    "Exness FIRST → Prop SECOND — CRITICAL execution — Manual check: always Exness first, wait for green, then Prop": false,
    "Check Live MT5 tab before trading — CRITICAL execution: verify Live MT5 tab shows balance before trading": false,
    "I will place the EXNESS trade FIRST via the Execute button and wait for green confirmation": false,
    "I will then manually place the PROP trade on my phone at the EXACT same price": false,
    "If I hit a WIN on Prop today, I will STOP TRADING for the rest of the day (Daily Cap Rule)": false,
    "If I hit a LOSS, I will log it in the Journal immediately using 'Sync Exness History'": false,
    "I have confirmed the Funded Phase lot size and risk parameters": false,
    "I have verified the Funded Phase drawdown limit is not breached": false,
  };

  // Toggle item checked (only if condition is met or item is manual)
  const toggleItem = (label: string) => {
    const next = currentItems.map((item) => {
      if (item.label !== label) return item;
      // If condition exists and is not met, don't allow checking
      const condition = autoConditions[label];
      if (condition !== undefined && !condition) {
        return item; // can't check — condition not met
      }
      return { ...item, checked: !item.checked };
    });
    saveCurrentItems(next);

    // Bridge to RulesAlertPanel: save checked state for execution rules
    const exnessFirstItem = next.find((i) =>
      i.label.startsWith("Exness FIRST → Prop SECOND")
    );
    if (exnessFirstItem) {
      localStorage.setItem("gizzyfx.checklist.exnessFirst", String(exnessFirstItem.checked));
    }
    const mt5CheckItem = next.find((i) =>
      i.label.startsWith("Check Live MT5 tab before trading")
    );
    if (mt5CheckItem) {
      localStorage.setItem("gizzyfx.checklist.mt5Check", String(mt5CheckItem.checked));
    }
  };

  // Add new item
  const addChecklistItem = (label: string) => {
    const next = [...currentItems, { label, checked: false }];
    saveCurrentItems(next);
    setNewItem("");
  };

  // Remove item
  const removeChecklistItem = (label: string) => {
    const next = currentItems.filter((item) => item.label !== label);
    saveCurrentItems(next);
  };

  // Start next trade (save current to history, reset)
  const resetChecklistForNextTrade = () => {
    const completed: CompletedTrade = {
      tradeNumber,
      date: today,
      items: [...currentItems],
      completedAt: new Date().toISOString(),
    };
    const newHistory = [...completedTrades, completed];
    saveCompletedTrades(newHistory);
    const phaseDefaults = defaultItems[r.phase] || defaultItems[1];
    const freshItems = phaseDefaults.map((label) => ({ label, checked: false }));
    saveCurrentItems(freshItems);
    // Clear localStorage bridge for RulesAlertPanel
    localStorage.setItem("gizzyfx.checklist.exnessFirst", "false");
    localStorage.setItem("gizzyfx.checklist.mt5Check", "false");
    setTradeNumber((n) => n + 1);
  };

  // Clear everything
  const clearAllChecklists = () => {
    const phaseDefaults = defaultItems[r.phase] || defaultItems[1];
    const freshItems = phaseDefaults.map((label) => ({ label, checked: false }));
    saveCurrentItems(freshItems);
    saveCompletedTrades([]);
    setTradeNumber(1);
    setExpandedTrades(new Set());
    // Clear localStorage bridge for RulesAlertPanel
    localStorage.setItem("gizzyfx.checklist.exnessFirst", "false");
    localStorage.setItem("gizzyfx.checklist.mt5Check", "false");
  };

  // ── Clear stale localStorage bridge on mount if all items unchecked ──
  useEffect(() => {
    const allUnchecked = currentItems.every((item) => !item.checked);
    if (allUnchecked) {
      localStorage.setItem("gizzyfx.checklist.exnessFirst", "false");
      localStorage.setItem("gizzyfx.checklist.mt5Check", "false");
    }
  }, []);

  // ── Auto-revert: uncheck items when conditions are no longer met ──
  useEffect(() => {
    const next = currentItems.map((item) => {
      const condition = autoConditions[item.label];
      if (condition === false && item.checked) {
        // Condition was previously met but now is not — revert to unchecked
        return { ...item, checked: false };
      }
      return item;
    });
    // Only update if something changed
    if (next.some((item, i) => item.checked !== currentItems[i]?.checked)) {
      saveCurrentItems(next);
      // Update localStorage bridge for RulesAlertPanel
      const exnessFirstItem = next.find((i) => i.label.startsWith("Exness FIRST → Prop SECOND"));
      if (exnessFirstItem) localStorage.setItem("gizzyfx.checklist.exnessFirst", String(exnessFirstItem.checked));
      const mt5CheckItem = next.find((i) => i.label.startsWith("Check Live MT5 tab before trading"));
      if (mt5CheckItem) localStorage.setItem("gizzyfx.checklist.mt5Check", String(mt5CheckItem.checked));
    }
  }, [inOverlap, inLondon, inNY]);

  // Toggle expanded trade
  const toggleExpanded = (num: number) => {
    setExpandedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  // All current items checked
  const allChecked = currentItems.length > 0 && currentItems.every((item) => item.checked);

  // Today's date (local time for consistency with journal)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const wonToday = journal.some((t) => t.date === today && t.result === "WIN");

  // Use the same risk analysis as GlobalRiskSentinel (coach)
  const sentinel = useRiskSentinel();

  // ── AI CO-PILOT: Dynamic Status Box (uses same data as coach) ──────
  const coPilot: StatusConfig = useMemo(() => {
    const level = sentinel.currentLevel;
    const messages = sentinel.messages;

    if (level === "red") {
      const redMsg = messages.find((m) => m.level === "red");
      return {
        icon: <ShieldX size={24} />,
        title: redMsg?.title ?? "STOP TRADING",
        message: redMsg?.message ?? "Critical issues detected. Fix them before trading.",
        level: "red" as const,
      };
    }

    if (level === "amber") {
      const amberMsg = messages.find((m) => m.level === "amber");
      return {
        icon: <AlertTriangle size={24} />,
        title: amberMsg?.title ?? "CAUTION",
        message: amberMsg?.message ?? "Some conditions are not optimal. Review before trading.",
        level: "amber" as const,
      };
    }

    // Green - All Clear (default)
    return {
      icon: <ShieldCheck size={24} />,
      title: "ALL CLEAR. YOU ARE CLEARED FOR ENTRY.",
      message: "Follow this exact sequence:",
      steps: [
        "Go to ForexFactory.com and verify no red news in the next 2 hours.",
        "Go to the Engine tab in this app.",
        "Input your exact Entry Price, Prop SL (pips), and R:R.",
        "Verify the Exness Lot Size and Total Capital Needed.",
        "Click 'Execute Exness Trade Automatically' and wait for the green confirmation.",
        "Immediately switch to your phone and place the Prop pending order at the EXACT same price.",
        "If the trade hits Take Profit, log it as a WIN and stop trading for the day.",
      ],
      level: "green" as const,
    };
  }, [sentinel]);

  // ── SECTION 1: Morning Status ─────────────────────────────────────────
  const morningStatus: StatusConfig = useMemo(() => {
    // 1. Weekend check
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const isWeekend = (day === 5 && hour >= 22) || day === 6 || (day === 0 && hour < 22);

    if (isWeekend) {
      return {
        icon: <ShieldX size={32} />,
        title: "MARKET CLOSED",
        message: "It's the weekend. Do not place pending orders. Enjoy your weekend — the market opens Sunday 22:00 UTC.",
        level: "red",
      };
    }

    // 2. Daily cap lock
    if (wonToday && selectedAccount?.dailyProfitCap != null) {
      return {
        icon: <Lock size={32} />,
        title: "DAILY CAP LOCK ACTIVE",
        message: `You already won a trade today. Do not trade again until tomorrow to avoid breaching the $${selectedAccount.dailyProfitCap} daily profit cap.`,
        level: "red",
      };
    }

    // 3. Critical legs
    if (recovery.adjustedRemainingLosses <= 2 && recovery.adjustedRemainingLosses > 0) {
      return {
        icon: <AlertOctagon size={32} />,
        title: "CRITICAL LEGS",
        message: `You are on your last ${recovery.adjustedRemainingLosses} losses before the account blows. Exness target is at maximum capacity. Trade with extreme caution.`,
        level: "red",
      };
    }

    // 4. Buffer depleted
    if (recovery.bufferDepleted) {
      return {
        icon: <AlertTriangle size={32} />,
        title: "DEPOSIT REQUIRED",
        message: `Your Exness buffer is too low. Deposit $${recovery.depositNeeded.toFixed(2)} before taking your next trade.`,
        level: "amber",
      };
    }

    // 5. All clear
    return {
      icon: <ShieldCheck size={32} />,
      title: "ALL CLEAR",
      message: "You are authorized to hunt for setups today. Follow your rules and execute with discipline.",
      level: "green",
    };
  }, [wonToday, recovery, selectedAccount, tick]);

  // ── SECTION 4: What to do next ────────────────────────────────────────
  const nextStep: StatusConfig = useMemo(() => {
    if (wonToday && selectedAccount?.dailyProfitCap != null) {
      return {
        icon: <Lock size={20} />,
        title: "Close the laptop",
        message: "You hit your daily cap. Come back tomorrow.",
        level: "red",
      };
    }
    if (recovery.bufferDepleted) {
      return {
        icon: <Wallet size={20} />,
        title: "Deposit funds",
        message: `Stop trading. Go to Exness and deposit $${recovery.depositNeeded.toFixed(2)}, then update your balance in Settings.`,
        level: "amber",
      };
    }
    if (recovery.adjustedRemainingLosses <= 2) {
      return {
        icon: <AlertOctagon size={20} />,
        title: "Trade with extreme caution",
        message: "You are near blowout. Only take A+ setups. Consider depositing to reset your buffer.",
        level: "red",
      };
    }
    const todayTrades = journal.filter((t) => t.date === today && t.result !== "OPEN");
    if (todayTrades.length > 0) {
      return {
        icon: <RefreshCw size={20} />,
        title: "Journal synced — hunt for next setup",
        message: "Target is adjusted if needed. You may take another trade if the setup is strong.",
        level: "green",
      };
    }
    return {
      icon: <Target size={20} />,
      title: "Find a 5-minute setup",
      message: "Set your Prop SL and R:R in the Engine, then execute the Exness trade first.",
      level: "green",
    };
  }, [wonToday, recovery, selectedAccount, journal, today]);

  const ms = statusStyles[morningStatus.level];
  const ns = statusStyles[nextStep.level];
  const cs = statusStyles[coPilot.level];

  return (
    <div className="engine-cockpit">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="cockpit-header">
        <div className="cockpit-header-left">
          <span className="cockpit-title">Daily Briefing</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "oklch(var(--gz-p) / 0.15)", color: "oklch(var(--gz-p))" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>
        <div className="cockpit-header-right">
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <div className="h-1.5 w-1.5 rounded-full animate-ping absolute" style={{ background: "oklch(var(--gz-p))", opacity: 0.4 }} />
              <div className="h-1.5 w-1.5 rounded-full relative" style={{ background: "oklch(var(--gz-p))" }} />
            </div>
            <span className="font-mono text-[10px] tabular-nums" style={{ color: "oklch(var(--gz-p))" }}>
              LIVE
            </span>
          </div>
        </div>
      </div>

      {/* ── AI CO-PILOT ───────────────────────────────────────────────── */}
      <div className="rounded-xl p-5" style={{ background: cs.bg, border: `2px solid ${cs.border}`, borderLeftWidth: "6px" }}>
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg" style={{ background: cs.text, color: "oklch(var(--gz-s1))" }}>
            <ShieldCheck size={24} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: cs.text }}>
                Risk Sentinel
              </span>
              <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "oklch(var(--gz-p) / 0.15)", color: "oklch(var(--gz-p))" }}>
                REAL-TIME
              </span>
            </div>
            <div className="text-[16px] font-bold mb-1" style={{ color: cs.text }}>
              {coPilot.title}
            </div>
            <div className="text-[13px]" style={{ color: cs.text, opacity: 0.85 }}>
              {coPilot.message}
            </div>
            {coPilot.steps && coPilot.steps.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {coPilot.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[10px] font-bold w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5" style={{ background: cs.text, color: "oklch(var(--gz-s1))" }}>
                      {i + 1}
                    </span>
                    <span className="text-[12px]" style={{ color: cs.text, opacity: 0.85 }}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 1: Morning Status ─────────────────────────────────── */}
      <div className="rounded-xl p-6 text-center" style={{ background: ms.bg, border: `3px solid ${ms.border}`, borderLeftWidth: "8px" }}>
        <div className="flex items-center justify-center gap-3 mb-3" style={{ color: ms.text }}>
          {morningStatus.icon}
          <span className="text-[24px] font-black">{morningStatus.title}</span>
        </div>
        <div className="text-[14px] max-w-2xl mx-auto" style={{ color: ms.text, opacity: 0.9 }}>
          {morningStatus.message}
        </div>
      </div>

      {/* ── SECTION 2: Current Loop Status ────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Zap size={16} />} label="Phase" value={r.phase === 1 ? "Phase 1 — Challenge" : "Phase 2 — Mega Shield"} />
        <StatCard icon={<TrendingUp size={16} />} label="Wins Remaining" value={`${recovery.remainingWins} of ${r.winsToPass}`} />
        <StatCard icon={<TrendingDown size={16} />} label="Losses Remaining" value={`${recovery.adjustedRemainingLosses} of ${r.lossesToBlow}`} />
        <StatCard icon={<Wallet size={16} />} label="Exness Balance" value={money(recovery.actualExnessBalance)} />
        <StatCard icon={<Target size={16} />} label="Next Exness Lot" value={`${r.exnessLots.toFixed(2)} lots`} />
        <StatCard icon={<Activity size={16} />} label="Slippage Debt" value={money(recovery.slippageDebt)} highlight={recovery.slippageDebt > 0} />
        <StatCard icon={<DollarSign size={16} />} label="Next Exness Target" value={money(recovery.newExnessWinTarget)} highlight={recovery.adjustmentNeeded} />
        <StatCard icon={<BarChart3 size={16} />} label="Prop R:R" value={`1:${r.rr}`} />
      </div>

      {/* ── SECTION 2b: Phase Alert ───────────────────────────────────── */}
      {r.phase === 2 && (
        <div className="rounded-xl p-4" style={{ background: "oklch(var(--gz-warn) / 0.1)", border: "2px solid oklch(var(--gz-warn) / 0.25)", borderLeftWidth: "6px" }}>
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ background: "oklch(var(--gz-warn))", color: "oklch(var(--gz-s1))" }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="text-[14px] font-bold" style={{ color: "oklch(var(--gz-warn))" }}>
                FUNDED PHASE ACTIVE
              </div>
              <div className="text-[12px]" style={{ color: "oklch(var(--gz-warn))", opacity: 0.85 }}>
                You are in Phase 2 — Mega Shield. Lot sizes and risk parameters have been adjusted. Verify all funded-phase rules before executing.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 3: Trade Pre-Flight Checklist ─────────────────────── */}
      <div className="panel" style={{ padding: "16px" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} style={{ color: "oklch(var(--gz-p))" }} />
            <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "oklch(var(--gz-p))" }}>
              Trade #{tradeNumber} — {r.phase === 1 ? "Challenge Phase" : "Funded Phase"} Checklist
            </span>
          </div>
          <button
            onClick={clearAllChecklists}
            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border transition-colors hover:bg-red-500/10"
            style={{ color: "oklch(var(--gz-neg))", borderColor: "oklch(var(--gz-neg) / 0.3)" }}
          >
            Clear All
          </button>
        </div>
        <div className="space-y-2">
          {currentItems.map((item) => {
            const condition = autoConditions[item.label];
            const hasCondition = condition !== undefined;
            const conditionMet = hasCondition && condition;
            const isManual = !hasCondition;
            const canCheck = isManual || conditionMet;
            const isAutoValidated = hasCondition && conditionMet;

            return (
              <div key={item.label} className="flex items-center gap-3 group">
                <button
                  onClick={() => toggleItem(item.label)}
                  className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0"
                  style={{
                    borderColor: item.checked 
                      ? "oklch(var(--gz-pos))" 
                      : "oklch(var(--gz-p) / 0.3)",
                    background: item.checked 
                      ? "oklch(var(--gz-pos))" 
                      : "transparent",
                    cursor: canCheck ? "pointer" : "not-allowed",
                  }}
                >
                  {item.checked && <CheckCircle2 size={10} style={{ color: "oklch(var(--gz-s1))" }} />}
                </button>
                {item.checked && (
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ background: "oklch(var(--gz-pos))", boxShadow: "0 0 6px oklch(var(--gz-pos))" }} />
                )}
                <span
                  className="text-[12px] flex-1 cursor-pointer"
                  style={{
                    color: "oklch(var(--gz-txt))",
                    textDecoration: item.checked ? "line-through" : "none",
                    opacity: item.checked ? 0.6 : hasCondition && !conditionMet ? 0.4 : 1,
                  }}
                  onClick={() => canCheck && toggleItem(item.label)}
                >
                  {item.label}
                  {isAutoValidated && !item.checked && (
                    <span className="ml-2 text-[10px] font-bold" style={{ color: "oklch(var(--gz-pos))" }}>
                      ✓ CONDITION MET
                    </span>
                  )}
                </span>
                <button
                  onClick={() => removeChecklistItem(item.label)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold px-1.5 py-0.5 rounded hover:bg-red-500/10 shrink-0"
                  style={{ color: "oklch(var(--gz-neg))" }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        {allChecked && (
          <div className="mt-4 p-3 rounded-lg text-center" style={{ background: "oklch(var(--gz-pos) / 0.12)", border: "1px solid oklch(var(--gz-pos) / 0.3)" }}>
            <div className="text-[12px] font-bold mb-2" style={{ color: "oklch(var(--gz-pos))" }}>
              ALL CHECKS COMPLETE — READY FOR TRADE #{tradeNumber}
            </div>
            <div className="text-[11px] mb-3" style={{ color: "oklch(var(--gz-txt))", opacity: 0.7 }}>
              Confirm all rules verified. Proceed with trade execution.
            </div>
            <button
              onClick={resetChecklistForNextTrade}
              className="text-[12px] font-bold px-4 py-2 rounded transition-colors"
              style={{ background: "oklch(var(--gz-p) / 0.15)", color: "oklch(var(--gz-p))" }}
            >
              Confirm &amp; Start Trade #{tradeNumber + 1} →
            </button>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { addChecklistItem(newItem.trim()); } }}
            placeholder="Add new rule..."
            className="flex-1 text-[12px] px-3 py-1.5 rounded border outline-none"
            style={{
              background: "oklch(var(--gz-s2))",
              borderColor: "oklch(var(--gz-p) / 0.2)",
              color: "oklch(var(--gz-txt))",
            }}
          />
          <button
            onClick={() => { if (newItem.trim()) { addChecklistItem(newItem.trim()); } }}
            className="text-[12px] font-bold px-3 py-1.5 rounded"
            style={{ background: "oklch(var(--gz-p) / 0.15)", color: "oklch(var(--gz-p))" }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* ── SECTION 3b: Completed Trades History ───────────────────────── */}
      {completedTrades.length > 0 && (
        <div className="panel" style={{ padding: "16px" }}>
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={16} style={{ color: "oklch(var(--gz-p))" }} />
            <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "oklch(var(--gz-p))" }}>
              Completed Trades ({completedTrades.length})
            </span>
          </div>
          <div className="space-y-2">
            {completedTrades.map((trade) => (
              <div key={trade.tradeNumber} className="rounded-lg overflow-hidden" style={{ border: "1px solid oklch(var(--gz-p) / 0.15)" }}>
                <button
                  onClick={() => toggleExpanded(trade.tradeNumber)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/5"
                  style={{ background: "oklch(var(--gz-s2))" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold" style={{ color: "oklch(var(--gz-txt))" }}>
                      Trade #{trade.tradeNumber}
                    </span>
                    <span className="text-[10px]" style={{ color: "oklch(var(--gz-mut))" }}>
                      {new Date(trade.completedAt).toLocaleTimeString()}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: "oklch(var(--gz-pos))" }}>
                      {trade.items.filter((i) => i.checked).length}/{trade.items.length} checks
                    </span>
                  </div>
                  <span className="text-[10px]" style={{ color: "oklch(var(--gz-mut))" }}>
                    {expandedTrades.has(trade.tradeNumber) ? "▲ Collapse" : "▼ Expand"}
                  </span>
                </button>
                {expandedTrades.has(trade.tradeNumber) && (
                  <div className="px-3 py-2 space-y-1.5" style={{ background: "oklch(var(--gz-s1))" }}>
                    {trade.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded border flex items-center justify-center shrink-0"
                          style={{
                            borderColor: item.checked ? "oklch(var(--gz-pos))" : "oklch(var(--gz-mut) / 0.3)",
                            background: item.checked ? "oklch(var(--gz-pos))" : "transparent",
                          }}
                        >
                          {item.checked && <CheckCircle2 size={8} style={{ color: "oklch(var(--gz-s1))" }} />}
                        </div>
                        <span
                          className="text-[11px]"
                          style={{
                            color: "oklch(var(--gz-txt))",
                            textDecoration: item.checked ? "line-through" : "none",
                            opacity: item.checked ? 0.6 : 0.8,
                          }}
                        >
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 4: What to do next ────────────────────────────────── */}
      <div className="rounded-xl p-5" style={{ background: ns.bg, border: `2px solid ${ns.border}` }}>
        <div className="flex items-center gap-3">
          <div style={{ color: ns.text }}>{nextStep.icon}</div>
          <div>
            <div className="text-[14px] font-bold" style={{ color: ns.text }}>
              {nextStep.title}
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: ns.text, opacity: 0.8 }}>
              {nextStep.message}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="panel-sunken" style={{ padding: "12px" }}>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: highlight ? "oklch(var(--gz-warn))" : "oklch(var(--gz-p))" }}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "oklch(var(--gz-mut))" }}>{label}</span>
      </div>
      <div className="text-[16px] font-bold" style={{ color: highlight ? "oklch(var(--gz-warn))" : "oklch(var(--gz-txt))" }}>
        {value}
      </div>
    </div>
  );
}


