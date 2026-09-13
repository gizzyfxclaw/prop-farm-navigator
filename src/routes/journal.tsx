import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, Card, Field, Row, Select, Stat, TextInput } from "@/components/terminal/ui";
import { money, tradePnl, type Direction } from "@/lib/engine/calc";
import { PAIRS } from "@/lib/engine/pairs";
import { fetchHistoryDeals, fetchOpenState } from "@/lib/metaapi.functions";
import { useStore, type JournalTrade } from "@/lib/store";
import { useEngineWithRecovery } from "@/lib/useEngine";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trading Journal — GizzyFx" },
      { name: "description", content: "Automated hedge journal: prop and Exness P&L derived from live engine values, with equity curve, win rate and profit factor." },
      { property: "og:title", content: "Trading Journal — GizzyFx" },
      { property: "og:description", content: "Log each mirrored trade and watch net P&L, win rate and profit factor update instantly." },
    ],
  }),
  component: JournalPage,
});

/* ── Live P&L hook for OPEN journal trades ──────────────────────────────── */

function useLiveOpenPnl(
  openTrades: JournalTrade[],
  token: string,
  exnessAccountId: string,
  exnessSymbolSuffix: string,
  pollMs = 10_000,
): Map<string, number> {
  const [liveMap, setLiveMap] = useState<Map<string, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!token || !exnessAccountId || openTrades.length === 0) {
      setLiveMap(new Map());
      return;
    }
    const res = await fetchOpenState({ data: { token, accountId: exnessAccountId } });
    if (!res.ok) return;

    const positions = res.data.positions;
    const posMap = new Map<string, number>();
    for (const p of positions) {
      const sym = p.symbol.replace(new RegExp(`${exnessSymbolSuffix}$`), "").toUpperCase();
      const dir = p.type.includes("BUY") ? "LONG" : "SHORT";
      const key = `${sym}|${dir}`;
      posMap.set(key, (posMap.get(key) ?? 0) + p.profit);
    }

    const next = new Map<string, number>();
    for (const t of openTrades) {
      const key = `${t.pair.toUpperCase()}|${t.dir}`;
      if (posMap.has(key)) {
        next.set(t.id, posMap.get(key)!);
      }
    }
    setLiveMap(next);
  }, [token, exnessAccountId, exnessSymbolSuffix, openTrades]);

  useEffect(() => {
    void poll();
    timerRef.current = setInterval(() => void poll(), pollMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll, pollMs]);

  return liveMap;
}

/* ── Component ──────────────────────────────────────────────────────────── */

function JournalPage() {
  const { journal, addTrade, updateTrade, deleteTrade, clearJournal, engine, meta, setEngine } = useStore();
  const { result: r, recovery } = useEngineWithRecovery();
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [pair, setPair] = useState<string>(engine.pair);
  const [dir, setDir] = useState<Direction>(engine.direction);
  const [actualPropPnl, setActualPropPnl] = useState("");
  const [actualExPnl, setActualExPnl] = useState("");
  const [settleId, setSettleId] = useState<string | null>(null);
  const [settlePropPnl, setSettlePropPnl] = useState("");
  const [settleExPnl, setSettleExPnl] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingDeal, setPendingDeal] = useState<{
    id: string;
    time: string;
    symbol: string;
    type: string;
    volume: number;
    price: number;
    profit: number;
    commission: number;
    swap: number;
  } | null>(null);
  const [showTransition, setShowTransition] = useState(false);
  const [hermesOpen, setHermesOpen] = useState(false);

  const openTrades = journal.filter((t) => t.result === "OPEN");
  const liveMap = useLiveOpenPnl(
    openTrades,
    meta.token,
    meta.exnessAccountId,
    meta.exnessSymbolSuffix ?? "",
  );

  // ── Hermes AI Journal Analysis ────────────────────────────────────
  // Understands the Inverted Mirror Hedge strategy:
  //   Prop and Exness take OPPOSITE directions on the same pair.
  //   Prop WIN  → Exness LOSS (pay from Exness tank)
  //   Prop LOSS → Exness WIN (refill Exness tank)
  //   Net P&L should be positive or zero for the loop to work.
  const hermesAnalysis = useMemo(() => {
    if (journal.length === 0) return null;
    const closed = journal.filter((t) => t.result !== "OPEN");
    if (closed.length === 0) return null;

    const wins = closed.filter((t) => t.result === "WIN").length;
    const losses = closed.filter((t) => t.result === "LOSS").length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
    const netPnl = closed.reduce((s, t) => s + t.netPnl, 0);
    const totalPropProfit = closed.filter((t) => t.propPnl > 0).reduce((s, t) => s + t.propPnl, 0);
    const totalPropLoss = closed.filter((t) => t.propPnl < 0).reduce((s, t) => s + Math.abs(t.propPnl), 0);
    const totalExWins = closed.filter((t) => t.exPnl > 0).reduce((s, t) => s + t.exPnl, 0);
    const totalExLosses = closed.filter((t) => t.exPnl < 0).reduce((s, t) => s + Math.abs(t.exPnl), 0);
    const exnessRecoveryPct = totalPropLoss > 0 ? (totalExWins / totalPropLoss) * 100 : 0;
    const avgWin = wins > 0 ? totalPropProfit / wins : 0;
    const avgLoss = losses > 0 ? totalPropLoss / losses : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Count trades where Exness moved opposite to expected (slippage)
    const slippageTrades = closed.filter((t) => {
      if (t.result === "LOSS") return t.exPnl < 0; // Exness should win but lost
      if (t.result === "WIN") return t.exPnl > 0;  // Exness should lose but won
      return false;
    }).length;

    // ═══════════════════════════════════════════════════════════════════
    // FEE RECOVERY ANALYSIS — The REAL metric that matters
    // ═══════════════════════════════════════════════════════════════════
    const propFeeNum = r.propFee;
    const feeRecoveryPct = propFeeNum > 0 ? (totalExWins / propFeeNum) * 100 : 0;
    const remainingFeeToRecover = Math.max(0, propFeeNum - totalExWins);
    const exnessNetRecovery = totalExWins - totalExLosses;
    const feeFullyRecovered = exnessNetRecovery >= propFeeNum;
    const propLossTrades = closed.filter((t) => t.result === "LOSS");
    const recoveredTrades = propLossTrades.filter((t) => t.exPnl > 0).length;
    const failedRecoveryTrades = propLossTrades.filter((t) => t.exPnl <= 0).length;
    const avgExnessRecoveryPerLoss = propLossTrades.length > 0 ? totalExWins / propLossTrades.length : 0;

    // Strategy flow analysis
    const analysis: string[] = [];
    
    // Fee recovery assessment (PRIMARY METRIC)
    if (feeFullyRecovered) {
      analysis.push(`🎉 FEE FULLY RECOVERED! Exness net (${money(exnessNetRecovery, true)}) covers the ${money(propFeeNum, true)} fee.`);
    } else if (feeRecoveryPct >= 80) {
      analysis.push(`Close: ${feeRecoveryPct.toFixed(0)}% of fee recovered. Only ${money(remainingFeeToRecover, true)} left.`);
    } else if (feeRecoveryPct >= 50) {
      analysis.push(`In progress: ${feeRecoveryPct.toFixed(0)}% of fee recovered. ${money(remainingFeeToRecover, true)} to go.`);
    } else if (feeRecoveryPct > 0) {
      analysis.push(`Behind: ${feeRecoveryPct.toFixed(0)}% of fee recovered. Need ${money(remainingFeeToRecover, true)} more.`);
    } else {
      analysis.push("No recovery yet.");
    }

    if (recoveredTrades > 0) analysis.push(`${recoveredTrades}/${recoveredTrades + failedRecoveryTrades} prop-loss legs recovered.`);
    if (failedRecoveryTrades > 0) analysis.push(`⚠️ ${failedRecoveryTrades} prop-loss leg(s) failed.`);
    if (slippageTrades > 0) analysis.push(`${slippageTrades} trade(s) show Exness moved opposite.`);
    if (payoffRatio >= 2) analysis.push(`Payoff ${payoffRatio.toFixed(2)} — wins outsize.`);
    else if (payoffRatio >= 1) analysis.push(`Payoff ${payoffRatio.toFixed(2)} — adequate.`);
    else analysis.push(`Payoff < 1 — losses outsize.`);
    if (recovery.adjustmentNeeded) analysis.push(`Martingale: target ${money(recovery.newExnessWinTarget, true)}.`);
    if (recovery.challengePassed) analysis.push("Challenge PASSED!");
    if (netPnl > 0) analysis.push(`Net P&L positive ${money(netPnl, true)}.`);
    else if (netPnl < 0) analysis.push(`Net P&L negative ${money(netPnl, true)}.`);

    return { winRate, netPnl, totalPropProfit, totalPropLoss, totalExWins, totalExLosses, exnessRecoveryPct, avgWin, avgLoss, payoffRatio, slippageTrades, analysis, feeRecoveryPct, remainingFeeToRecover, exnessNetRecovery, feeFullyRecovered, recoveredTrades, failedRecoveryTrades, avgExnessRecoveryPerLoss, propFee: propFeeNum, wins, losses };
  }, [journal, recovery]);

  // ── Recovery timeline: narrative of each trade ──────────────────────
  // Fix: start from INITIAL balance (current - sum of all exPnl) to avoid
  // double-counting. Running balance must progress chronologically.
  const recoveryTimeline = useMemo(() => {
    const closedTrades = journal.filter((t) => t.result !== "OPEN");
    const totalExPnlSoFar = closedTrades.reduce((s, t) => s + t.exPnl, 0);
    const startingBalance = r.actualExnessBalance - totalExPnlSoFar;
    let runningBalance = startingBalance;
    let runningPropEquity = 0;
    const trades = closedTrades.map((t, i) => {
      const prevBalance = runningBalance;
      runningBalance += t.exPnl;
      runningPropEquity += t.propPnl;
      return { ...t, index: i + 1, exnessBalanceBefore: prevBalance, exnessBalanceAfter: runningBalance, runningPropEquity, startingBalance };
    });
    return { trades, startingBalance };
  }, [journal, r.actualExnessBalance]);

  function log(result: "WIN" | "LOSS") {
    const derived = tradePnl(r, result === "WIN", engine.rr);
    const propPnl = actualPropPnl !== "" ? Number(actualPropPnl) : derived.propPnl;
    const exPnl = actualExPnl !== "" ? Number(actualExPnl) : derived.exPnl;
    const netPnl = propPnl + exPnl;
    const now = new Date();
    // Use local date for consistency with daily cap check
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    addTrade({
      id: `${now.getTime()}`,
      date: localDate,
      time: now.toTimeString().slice(0, 8),
      pair,
      dir,
      result,
      propPnl,
      exPnl,
      netPnl,
      details: {
        entry: r.entryPrice,
        propSl: r.propSl,
        propTp: r.propTp,
        exSl: r.exnessSl,
        exTp: r.exnessTp,
        propLots: r.propLots,
        exLots: r.exnessLots,
        rr: engine.rr,
        phase: r.phase,
        baseExnessWinTarget: r.phase === 1 ? r.phase1.exnessWinTarget : r.phase2.exnessWinTarget,
        propRiskAtLog: r.cappedPropRisk,
      },
    });
    setActualPropPnl("");
    setActualExPnl("");
    toast.success(`${result} logged — net ${money(netPnl, true)}`);
  }

  async function syncExnessHistory() {
    if (!meta.token || !meta.exnessAccountId) {
      toast.error("Add your MetaApi token and Exness account ID in Settings first.");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetchHistoryDeals({ data: { token: meta.token, accountId: meta.exnessAccountId, days: 7 } });
      if (!res.ok) {
        toast.error(`Sync failed: ${res.error}`);
        return;
      }
      const deals = res.data;
      const loggedIds = new Set(journal.map((t) => t.ticket));
      const newDeal = deals.find((d) => !loggedIds.has(d.id) && !loggedIds.has(d.orderId));
      if (!newDeal) {
        toast.success("No new deals to sync — journal is up to date.");
        setLastSync(new Date().toLocaleTimeString());
        return;
      }
      const netD = newDeal.profit + newDeal.commission + newDeal.swap;
      setPendingDeal({
        id: newDeal.id,
        time: newDeal.time,
        symbol: newDeal.symbol,
        type: newDeal.type,
        volume: newDeal.volume,
        price: newDeal.price,
        profit: newDeal.profit,
        commission: newDeal.commission,
        swap: newDeal.swap,
      });
      const closeTime = newDeal.time ? new Date(newDeal.time) : new Date();
      const syncDate = `${closeTime.getFullYear()}-${String(closeTime.getMonth() + 1).padStart(2, "0")}-${String(closeTime.getDate()).padStart(2, "0")}`;
      setDate(syncDate);
      setActualExPnl(netD.toFixed(2));
      toast.success(`Synced deal ${newDeal.id} — net ${money(netD, true)}. Did the Prop win or lose?`);
      setLastSync(new Date().toLocaleTimeString());
    } finally {
      setSyncing(false);
    }
  }

  function confirmSyncedDeal(propResult: "WIN" | "LOSS") {
    if (!pendingDeal) return;
    const netD = pendingDeal.profit + pendingDeal.commission + pendingDeal.swap;
    const derived = tradePnl(r, propResult === "WIN", engine.rr);
    const propPnl = derived.propPnl;
    const exPnl = netD;
    const closeTime = pendingDeal.time ? new Date(pendingDeal.time) : new Date();
    // Use local date for consistency with daily cap check
    const localDate = `${closeTime.getFullYear()}-${String(closeTime.getMonth() + 1).padStart(2, "0")}-${String(closeTime.getDate()).padStart(2, "0")}`;
    addTrade({
      id: `deal-${pendingDeal.id}-${Date.now()}`,
      date: localDate,
      time: closeTime.toTimeString().slice(0, 8),
      pair: pendingDeal.symbol.replace(new RegExp(`${meta.exnessSymbolSuffix ?? ""}$`), "").toUpperCase(),
      dir: pendingDeal.type.includes("BUY") ? "LONG" : "SHORT",
      result: propResult,
      propPnl,
      exPnl,
      netPnl: propPnl + exPnl,
      ticket: pendingDeal.id,
      note: `Auto-synced from MetaApi deal ${pendingDeal.id}`,
      details: {
        entry: pendingDeal.price,
        propSl: 0,
        propTp: 0,
        exSl: 0,
        exTp: 0,
        propLots: 0,
        exLots: pendingDeal.volume,
        rr: engine.rr,
        phase: r.phase,
        leg: "exness",
        baseExnessWinTarget: r.phase === 1 ? r.phase1.exnessWinTarget : r.phase2.exnessWinTarget,
        propRiskAtLog: r.cappedPropRisk,
      },
    });
    setPendingDeal(null);
    toast.success(`${propResult} logged from synced deal — net ${money(propPnl + exPnl, true)}`);
  }

  function triggerPhaseTransition() {
    if (recovery.challengePassed && r.phase === 1) {
      // Use phase1TotalSpent (not totalRequiredCapital) — the latter may be
      // inflated by an active martingale override and would distort Phase 2 math.
      const p1Spent = r.phase1TotalSpent;
      setEngine({
        phase: 2,
        carryPhase1TotalSpent: Math.round(p1Spent * 100) / 100,
        carryPhase1Leftover: Math.round(recovery.actualExnessBalance * 100) / 100,
      });
      setShowTransition(true);
      toast.success(`CHALLENGE PASSED! Phase 2 Mega Shield activated. P1 spent: ${money(p1Spent)}`);
    }
  }

  function settle(trade: JournalTrade, result: "WIN" | "LOSS") {
    if (settleId === trade.id && (settlePropPnl !== "" || settleExPnl !== "")) {
      const propPnl = settlePropPnl !== "" ? Number(settlePropPnl) : trade.propPnl;
      const exPnl = settleExPnl !== "" ? Number(settleExPnl) : trade.exPnl;
      const netPnl = propPnl + exPnl;
      updateTrade(trade.id, { result, propPnl, exPnl, netPnl });
      toast.success(`Settled as ${result} — net ${money(netPnl, true)}`);
    } else {
      // Use the trade's stored R:R and base target if available, so that settling
      // an old OPEN trade doesn't use current-phase engine values.
      const rr = trade.details?.rr ?? engine.rr;
      const baseTarget = trade.details?.baseExnessWinTarget
        ?? (trade.details?.phase != null
          ? (trade.details.phase === 1 ? r.phase1.exnessWinTarget : r.phase2.exnessWinTarget)
          : r.exnessWinTarget);
      const storedRisk = trade.details?.propRiskAtLog ?? r.cappedPropRisk;
      const propPnl = result === "WIN" ? storedRisk * rr : -storedRisk;
      const exPnl = result === "WIN" ? -(baseTarget * rr) : baseTarget;
      updateTrade(trade.id, {
        result,
        propPnl,
        exPnl,
        netPnl: propPnl + exPnl,
      });
      toast.success(`Settled as ${result}`);
    }
    setSettleId(null);
    setSettlePropPnl("");
    setSettleExPnl("");
  }

  const closed = journal.filter((t) => t.result !== "OPEN");
  const wins = closed.filter((t) => t.result === "WIN");
  const losses = closed.filter((t) => t.result === "LOSS");
  const net = closed.reduce((s, t) => s + t.netPnl, 0);
  const gross = closed.filter((t) => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(closed.filter((t) => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0));
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? gross / grossLoss : gross > 0 ? Infinity : 0;

  // ── DATA VALIDATION: Check P&L signs ─────────────────────────────────────
  // If Prop WON, Exness should LOSE (negative P&L)
  // If Prop LOSES, Exness should WIN (positive P&L)
  const [dataValidationError, setDataValidationError] = useState<string | null>(null);
  
  function validateAndLog(result: "WIN" | "LOSS") {
    const exPnlNum = actualExPnl !== "" ? Number(actualExPnl) : null;
    
    // Validate: Prop WIN → Exness should LOSE (negative)
    if (result === "WIN" && exPnlNum !== null && exPnlNum > 0) {
      setDataValidationError("❌ DATA ERROR: If Prop WON, Exness P&L MUST be negative. Please check your numbers.");
      return;
    }
    
    // Validate: Prop LOSS → Exness should WIN (positive)
    if (result === "LOSS" && exPnlNum !== null && exPnlNum < 0) {
      setDataValidationError("❌ DATA ERROR: If Prop LOST, Exness P&L MUST be positive. Please check your numbers.");
      return;
    }
    
    setDataValidationError(null);
    log(result);
  }

  const moneyLost = recovery.totalMoneyLost;
  const fuelExhausted = recovery.exnessFuelExhausted;

  let running = 0;
  const curve = closed.map((t, i) => {
    running += t.netPnl;
    return { i: i + 1, equity: Number(running.toFixed(2)) };
  });

  const distribution = [
    { name: "Wins", value: wins.length, fill: "var(--color-success)" },
    { name: "Losses", value: losses.length, fill: "var(--color-destructive)" },
  ];

  return (
    <div className="engine-cockpit">
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div className="cockpit-header">
        <div className="cockpit-header-left">
          <span className="cockpit-title">Trade Journal</span>
          <Badge tone="blue">{journal.length} trades</Badge>
          {openTrades.length > 0 && <Badge tone="amber">{openTrades.length} open</Badge>}

        </div>
        <div className="cockpit-header-right">
          <span className="cockpit-pair">{pair}</span>
          <span className="cockpit-price">R:R 1:{engine.rr}</span>
        </div>
      </div>

      {/* ── HERMES AI ANALYSIS ────────────────────────────────────── */}
      <div className="panel hermes-panel" style={{ padding: 0, borderColor: "oklch(var(--gz-p) / 0.25)", marginBottom: "1.5rem" }}>
        <div
          className="panel-head"
          style={{ background: "oklch(var(--gz-p) / 0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 1.1rem", minHeight: "44px" }}
          onClick={() => setHermesOpen(!hermesOpen)}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "14px" }}>🤖</span>
            <h2 className="panel-head-title" style={{ fontSize: "13px", fontWeight: 600, margin: 0 }}>Hermes Journal Analysis</h2>
            {hermesAnalysis && (
              <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))", fontSize: "11px" }}>
                {closed.length} trades analyzed
              </span>
            )}
          </div>
          <span style={{ fontSize: "12px", color: "oklch(var(--gz-p))" }}>
            {hermesOpen ? "▲" : "▼"}
          </span>
        </div>
        {hermesOpen && (
          <div style={{ padding: "1rem" }}>
            {hermesAnalysis ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Win rate" value={`${hermesAnalysis.winRate.toFixed(1)}%`} tone={hermesAnalysis.winRate >= 50 ? "text-success" : "text-destructive"} />
                  <Stat label="Net P&L" value={money(hermesAnalysis.netPnl, true)} tone={hermesAnalysis.netPnl >= 0 ? "text-success" : "text-destructive"} />
                  <Stat label="Exness recovery" value={`${hermesAnalysis.exnessRecoveryPct.toFixed(0)}%`} tone={hermesAnalysis.exnessRecoveryPct >= 70 ? "text-success" : "text-amber-400"} />
                  <Stat label="Payoff ratio" value={hermesAnalysis.payoffRatio.toFixed(2)} tone={hermesAnalysis.payoffRatio >= 1.5 ? "text-success" : "text-amber-400"} />
                </div>
                <div className="rounded-lg p-3" style={{ background: "oklch(var(--gz-s2) / 0.5)", border: "1px solid oklch(var(--gz-p) / 0.15)" }}>
                  <p className="text-[11px] font-semibold mb-2" style={{ color: "oklch(var(--gz-p))" }}>🤖 Hermes Assessment:</p>
                  <ul className="space-y-1">
                    {hermesAnalysis.analysis.map((line, i) => (
                      <li key={i} className="text-[11px]" style={{ color: "oklch(var(--gz-txt) / 0.85)" }}>• {line}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg p-3" style={{ background: "oklch(var(--gz-s2) / 0.3)", border: "1px solid oklch(var(--gz-p) / 0.1)" }}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: "oklch(var(--gz-p))" }}>📋 Strategy: Inverted Mirror Hedge</p>
                  <p className="text-[10px]" style={{ color: "oklch(var(--gz-mut))" }}>
                    Prop and Exness take opposite directions. Prop WIN pays from Exness tank, Prop LOSS refills it. Net P&L should stay positive.<br/>
                    <span style={{ color: "oklch(var(--gz-p))" }}>Data check:</span> {hermesAnalysis.correctDirection}/{hermesAnalysis.wins + hermesAnalysis.losses} trades correct direction.
                    {hermesAnalysis.bothPositive > 0 && <span style={{ color: "oklch(var(--gz-neg))" }}> ❌ {hermesAnalysis.bothPositive} both-positive!</span>}
                    {hermesAnalysis.bothNegative > 0 && <span style={{ color: "oklch(var(--gz-neg))" }}> ❌ {hermesAnalysis.bothNegative} both-negative!</span>}
                    {hermesAnalysis.bothPositive === 0 && hermesAnalysis.bothNegative === 0 && <span style={{ color: "oklch(var(--gz-pos))" }}> ✅</span>}
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "oklch(var(--gz-s2) / 0.3)", border: "1px solid oklch(var(--gz-p) / 0.1)" }}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: "oklch(var(--gz-p))" }}>💰 Fee Recovery Status</p>
                  <p className="text-[10px]" style={{ color: "oklch(var(--gz-mut))" }}>
                    Prop Fee: <strong style={{ color: "oklch(var(--gz-txt))" }}>{money(hermesAnalysis.propFee, true)}</strong><br/>
                    Exness recovered: <strong style={{ color: hermesAnalysis.feeRecoveryPct >= 100 ? "oklch(var(--gz-pos))" : hermesAnalysis.feeRecoveryPct >= 70 ? "oklch(var(--gz-p))" : "oklch(var(--gz-neg))" }}>{money(hermesAnalysis.totalExWins, true)} ({hermesAnalysis.feeRecoveryPct.toFixed(0)}%)</strong><br/>
                    {hermesAnalysis.feeFullyRecovered ? (
                      <span style={{ color: "oklch(var(--gz-pos))" }}>✅ Fee FULLY RECOVERED! Net profit: {money(hermesAnalysis.exnessNetRecovery - hermesAnalysis.propFee, true)}</span>
                    ) : (
                      <span style={{ color: "oklch(var(--gz-neg))" }}>❌ Fee NOT recovered. Still need: {money(hermesAnalysis.remainingFeeToRecover, true)}</span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "oklch(var(--gz-s2) / 0.3)", border: "1px solid oklch(var(--gz-p) / 0.1)" }}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: "oklch(var(--gz-p))" }}>🔄 Recovery Per Prop Loss</p>
                  <p className="text-[10px]" style={{ color: "oklch(var(--gz-mut))" }}>
                    {hermesAnalysis.recoveredTrades} of {hermesAnalysis.recoveredTrades + hermesAnalysis.failedRecoveryTrades} prop-loss trades recovered.<br/>
                    Avg recovery per loss: <strong>{money(hermesAnalysis.avgExnessRecoveryPerLoss, true)}</strong><br/>
                    {hermesAnalysis.failedRecoveryTrades > 0 && <span style={{ color: "oklch(var(--gz-neg))" }}>⚠️ {hermesAnalysis.failedRecoveryTrades} trade(s) failed to recover (Exness lost on prop-loss leg).</span>}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Log at least one closed trade to see Hermes analysis.</p>
            )}
          </div>
        )}
      </div>

      {/* ── RECOVERY TIMELINE ───────────────────────────────────────── */}
      {recoveryTimeline.trades.length > 0 && (
        <Card title="Recovery Timeline" badge={<Badge tone="blue">Step by step</Badge>}>
          <div className="mb-3 rounded border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary">
            Starting Exness balance: <strong>{money(recoveryTimeline.startingBalance, true)}</strong> → Current: <strong>{money(r.actualExnessBalance, true)}</strong> (after {recoveryTimeline.trades.length} trades)
          </div>
          <div className="space-y-2">
            {recoveryTimeline.trades.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-lg p-3"
                style={{
                  background: t.result === "WIN" ? "oklch(var(--gz-pos) / 0.08)" : "oklch(var(--gz-neg) / 0.08)",
                  border: `1px solid ${t.result === "WIN" ? "oklch(var(--gz-pos) / 0.2)" : "oklch(var(--gz-neg) / 0.2)"}`,
                }}
              >
                <div className="flex items-center gap-2 min-w-[80px]">
                  <Badge tone={t.result === "WIN" ? "green" : "red"}>{t.result}</Badge>
                  <span className="text-[10px] text-muted-foreground">#{t.index}</span>
                </div>
                <div className="flex items-center gap-2 min-w-[100px]">
                  <span className="text-[11px] font-mono text-foreground">{t.pair}</span>
                  <span className="text-[10px] mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>{t.dir}</span>
                </div>
                <div className="flex items-center gap-4 flex-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Prop:</span>
                    <span className="text-[11px] font-mono" style={{ color: t.propPnl >= 0 ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))" }}>
                      {money(t.propPnl, true)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Exness:</span>
                    <span className="text-[11px] font-mono" style={{ color: t.exPnl >= 0 ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))" }}>
                      {money(t.exPnl, true)}
                    </span>
                  </div>
                  {t.result === "LOSS" && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Recovered:</span>
                      <span className="text-[11px] font-mono font-semibold" style={{ color: t.exPnl > 0 ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))" }}>
                        {t.exPnl > 0 ? `✓ ${money(t.exPnl, true)}` : "✗ No recovery"}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Exness bal:</span>
                    <span className="text-[11px] font-mono" style={{ color: t.exnessBalanceAfter >= 0 ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))" }}>
                      {money(t.exnessBalanceAfter, true)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Net equity:</span>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: t.runningPropEquity >= 0 ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))" }}>
                      {money(t.runningPropEquity, true)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── STATS GRID ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Closed trades" value={closed.length} />
        <Stat label="Win rate" value={`${winRate.toFixed(1)}%`} tone="text-primary" />
        <Stat label="Net P&L" value={money(net, true)} tone={net >= 0 ? "text-success" : "text-destructive"} />
        <Stat
          label="Profit factor"
          value={Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞"}
          tone="text-primary"
        />
      </div>

      {/* ── MARTINGALE + MONEY LOST ─────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Targeted Slippage Martingale"
          badge={
            <Badge tone={recovery.adjustmentNeeded ? "amber" : "green"}>
              {recovery.adjustmentNeeded ? "Debt active" : "No debt"}
            </Badge>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Current slippage debt"
              value={money(recovery.slippageDebt, true)}
              tone={recovery.slippageDebt > 0 ? "text-amber-400" : "text-muted-foreground"}
            />
            <Stat label="Base Exness win target" value={money(recovery.baseExnessWinTarget)} tone="text-muted-foreground" />
            <Stat
              label="Next trade target (martingale)"
              value={money(recovery.newExnessWinTarget, true)}
              tone={recovery.adjustmentNeeded ? "text-amber-400" : "text-success"}
            />
            <Stat
              label="Dynamic Exness risk (prop wins)"
              value={money(-recovery.newExnessLossTarget)}
              tone={recovery.adjustmentNeeded ? "text-amber-400" : "text-destructive"}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {recovery.adjustmentNeeded ? (
              <>Slippage debt of <strong>{money(recovery.slippageDebt)}</strong> — the next Exness win wipes it. Target bumped from {money(recovery.baseExnessWinTarget)} to <strong>{money(recovery.newExnessWinTarget)}</strong>; lot size already adjusted.</>
            ) : (
              <>No debt open. Next Exness win target stays at the base pace of {money(recovery.baseExnessWinTarget)}. Any slippage on a future trade will accrue into a one-leg martingale bump that wipes on the next Exness win.</>
            )}
          </p>
        </Card>

        <Card title="Money lost over the run" badge={<Badge tone="red">Real cash</Badge>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Exness fuel exhausted" value={money(fuelExhausted)} tone={fuelExhausted > 0 ? "text-destructive" : "text-muted-foreground"} />
            <Stat label="Prop fee" value={money(recovery.propFee)} tone="text-destructive" />
            <Stat label="Total money lost" value={money(moneyLost)} tone={moneyLost > 0 ? "text-destructive" : "text-muted-foreground"} />
            <Stat
              label={recovery.challengePassed ? "Net result after payout" : "Net result if passed now"}
              value={money(recovery.netResultAfterPayout, true)}
              tone={recovery.netResultAfterPayout >= 0 ? "text-success" : "text-destructive"}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {recovery.challengePassed ? (
              <>Challenge passed. Of the {money(recovery.totalExnessLosses)} in gross Exness losses, {money(recovery.totalExnessWins)} was recovered by prop-loss legs — net fuel burn {money(fuelExhausted)}. Exness balance still holds {money(recovery.actualExnessBalance)} (returnable principal). Collect the payout: <strong>{money(r.propPayout, true)}</strong>.</>
            ) : (
              <>Running totals. Gross Exness losses so far: {money(recovery.totalExnessLosses)}; recovered by prop-loss legs: {money(recovery.totalExnessWins)} — net fuel burn {money(fuelExhausted)}. The Exness tank still holds {money(recovery.actualExnessBalance)}.</>
            )}
          </p>
        </Card>
      </div>

      {/* ── LOG A TRADE ─────────────────────────────────────────────── */}
      <Card title="Log a trade">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Pair">
            <Select value={pair} onChange={(e) => setPair(e.target.value)}>
              {PAIRS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Prop direction">
            <Select value={dir} onChange={(e) => setDir(e.target.value as Direction)}>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button variant="success" onClick={() => validateAndLog("WIN")}>Log win</Button>
            <Button variant="danger" onClick={() => validateAndLog("LOSS")}>Log loss</Button>
          </div>
        </div>

        {dataValidationError && (
          <div className="mt-3 rounded border border-red-500/50 bg-red-500/10 p-2 text-[10px] text-red-400">
            {dataValidationError}
          </div>
        )}

        {/* Auto-Sync section */}
        <div className="mt-4 rounded border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={syncExnessHistory} disabled={syncing}>
              {syncing ? "Syncing…" : "🔄 Sync Exness History"}
            </Button>
            {lastSync && <span className="text-[11px] text-muted-foreground">Last sync: {lastSync}</span>}
            {!meta.token || !meta.exnessAccountId ? (
              <span className="text-[11px] text-amber-400">Add MetaApi credentials in Settings</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">Fetches last 7 days of closed deals from MetaApi</span>
            )}
          </div>

          {pendingDeal && (
            <div className="mt-3 rounded border border-primary/50 bg-primary/10 p-3">
              <p className="text-[12px] text-primary font-semibold">
                Synced deal {pendingDeal.id} — {pendingDeal.symbol} {pendingDeal.type.replace("DEAL_TYPE_", "")} {pendingDeal.volume} lots @ {pendingDeal.price}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Net Exness P&L: {money(pendingDeal.profit + pendingDeal.commission + pendingDeal.swap, true)}
              </p>
              <p className="mt-2 text-[12px] text-foreground">Did the Prop account WIN or LOSE this trade?</p>
              <div className="mt-2 flex gap-2">
                <Button variant="success" onClick={() => confirmSyncedDeal("WIN")}>Prop WON ✓</Button>
                <Button variant="danger" onClick={() => confirmSyncedDeal("LOSS")}>Prop LOST ✗</Button>
                <Button variant="ghost" onClick={() => setPendingDeal(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Override actual P&L below (leave blank to use engine values):</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Actual Prop P&L ($)" hint="e.g. +125.00 or -62.50">
            <TextInput type="number" step="0.01" value={actualPropPnl} onChange={(e) => setActualPropPnl(e.target.value)} placeholder={`engine: ${money(tradePnl(r, true, engine.rr).propPnl, true)}`} />
          </Field>
          <Field label="Actual Exness P&L ($)" hint="e.g. -250.00 or +125.00">
            <TextInput type="number" step="0.01" value={actualExPnl} onChange={(e) => setActualExPnl(e.target.value)} placeholder={`engine: ${money(tradePnl(r, true, engine.rr).exPnl, true)}`} />
          </Field>
        </div>
      </Card>

      {/* ── NEXT STEPS ──────────────────────────────────────────────── */}
      <Card title="Next steps">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Wins remaining" value={recovery.remainingWins} />
          <Stat label="Losses remaining" value={recovery.remainingLosses} />
          <Stat label="Exness balance" value={money(recovery.actualExnessBalance)} tone={recovery.actualExnessBalance >= 0 ? "text-success" : "text-destructive"} />
          <Stat
            label={recovery.adjustmentNeeded ? "Next target (martingale)" : "Win target"}
            value={money(recovery.newExnessWinTarget)}
            tone={recovery.adjustmentNeeded ? "text-amber-400" : undefined}
          />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[11px] text-muted-foreground">
          <div>Prop profit logged: <span className="text-success font-mono">{money(recovery.totalPropProfitLogged, true)}</span></div>
          <div>Prop loss logged: <span className="text-destructive font-mono">{money(-recovery.totalPropLossLogged)}</span></div>
          <div>Remaining target: <span className="font-mono text-foreground">{money(recovery.remainingPropTarget)}</span></div>
          <div>Remaining drawdown: <span className={`font-mono ${recovery.remainingDrawdown < r.maxDdUsd * 0.25 ? "text-destructive" : "text-foreground"}`}>{money(recovery.remainingDrawdown)}</span></div>
        </div>

        {recovery.challengePassed && (
          <div className="mt-3 space-y-2">
            <p className="rounded border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-success font-semibold">
              Challenge Passed! Request your payout. Switch to Phase 2 (Mega Shield) for the Funded Stage.
            </p>
            {r.phase === 1 && (
              <Button variant="success" onClick={triggerPhaseTransition}>🚀 Activate Phase 2 Mega Shield</Button>
            )}
            {showTransition && r.phase === 2 && (
              <p className="rounded border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-success">
                Phase 2 activated! P1 spent: <strong>{money(r.phase1TotalSpent)}</strong>, Exness balance: <strong>{money(recovery.actualExnessBalance)}</strong>. Deposit the Phase 2 refill to start the Funded Stage.
              </p>
            )}
          </div>
        )}

        {recovery.bufferDepleted && !recovery.challengePassed && (
          <p className="mt-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive font-semibold">
            CRITICAL: Exness Buffer Depleted — deposit <strong>{money(recovery.depositNeeded)}</strong> to maintain the zero-loss loop.
          </p>
        )}

        {recovery.adjustmentNeeded && !recovery.challengePassed && (
          <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
            Martingale active: debt <strong>{money(recovery.slippageDebt)}</strong> added to the next Exness target ({money(recovery.baseExnessWinTarget)} → {money(recovery.newExnessWinTarget, true)}). The next Exness win wipes it.
          </p>
        )}

        {!recovery.adjustmentNeeded && closed.length > 0 && !recovery.challengePassed && (
          <p className="mt-3 rounded border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-success">
            No slippage debt. Every Exness trade has come in on or better than script.
          </p>
        )}
      </Card>

      {/* ── EQUITY CURVE + WIN/LOSS ─────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Equity curve" className="lg:col-span-2">
          <div className="h-64">
            {curve.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis dataKey="i" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                  <Line type="monotone" dataKey="equity" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-[13px] text-muted-foreground">Log a trade to build the curve.</p>
            )}
          </div>
        </Card>
        <Card title="Win / loss">
          <div className="h-64">
            {closed.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                    {distribution.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-[13px] text-muted-foreground">No closed trades yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* ── TRADES TABLE ────────────────────────────────────────────── */}
      <Card
        title={`Trades (${journal.length})`}
        badge={
          journal.length ? (
            <Button variant="ghost" className="h-8 px-3 text-[11px]" onClick={() => clearJournal()}>
              Clear all
            </Button>
          ) : undefined
        }
      >
        {openTrades.length > 0 && meta.token && meta.exnessAccountId && (
          <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
            Live P&L updating from MetaApi every 10s
            {liveMap.size === 0 && " — matching positions…"}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Pair</th>
                <th className="py-2 pr-3 font-medium">Dir</th>
                <th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 pr-3 font-medium">Prop P&L</th>
                <th className="py-2 pr-3 font-medium">Exness P&L</th>
                <th className="py-2 pr-3 font-medium">Net</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="font-mono">
              {journal
                .slice()
                .reverse()
                .map((t) => {
                  const isOpen = t.result === "OPEN";
                  const livePnl = liveMap.get(t.id);
                  const hasLive = isOpen && livePnl !== undefined;
                  const displayProp = t.propPnl;
                  const displayEx = hasLive ? livePnl : t.exPnl;
                  const displayNet = hasLive ? livePnl : t.netPnl;

                  return (
                    <>
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-1.5 pr-3 text-[11px] text-muted-foreground">{t.date}</td>
                        <td className="py-1.5 pr-3 text-foreground">{t.pair}</td>
                        <td className="py-1.5 pr-3">{t.dir}</td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={t.result === "WIN" ? "green" : t.result === "LOSS" ? "red" : "amber"}>
                              {t.result}
                            </Badge>
                            {hasLive && (
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" title="Live from MetaApi" />
                            )}
                          </div>
                        </td>
                        <td className={displayProp >= 0 ? "py-1.5 pr-3 text-success" : "py-1.5 pr-3 text-destructive"}>
                          {money(displayProp, true)}
                        </td>
                        <td className={displayEx >= 0 ? "py-1.5 pr-3 text-success" : "py-1.5 pr-3 text-destructive"}>
                          {isOpen && hasLive ? (
                            <span className="font-semibold">{money(displayEx, true)}<span className="ml-1 text-[9px] text-muted-foreground">live</span></span>
                          ) : isOpen && !hasLive ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            money(displayEx, true)
                          )}
                        </td>
                        <td className={displayNet >= 0 ? "py-1.5 pr-3 font-semibold text-success" : "py-1.5 pr-3 font-semibold text-destructive"}>
                          {money(displayNet, true)}
                        </td>
                        <td className="py-1.5">
                          <div className="flex justify-end gap-1.5">
                            {isOpen && (
                              <button
                                onClick={() => {
                                  setSettleId(settleId === t.id ? null : t.id);
                                  setSettlePropPnl("");
                                  setSettleExPnl("");
                                }}
                                className="rounded border border-primary/40 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"
                              >
                                Settle…
                              </button>
                            )}
                            <button
                              onClick={() => deleteTrade(t.id)}
                              className="rounded border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {settleId === t.id && (
                        <tr key={`${t.id}-settle`} className="border-b border-primary/20 bg-primary/5">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <p className="w-full text-[11px] text-muted-foreground mb-1">Enter actual P&L, then click Win or Loss (blank = engine-derived):</p>
                              <div className="flex items-center gap-2">
                                <label className="text-[11px] text-muted-foreground w-24">Prop P&L ($)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={settlePropPnl}
                                  onChange={(e) => setSettlePropPnl(e.target.value)}
                                  placeholder={hasLive ? money(livePnl, true) : "engine value"}
                                  className="w-32 rounded border border-white/10 bg-background px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-[11px] text-muted-foreground w-24">Ex P&L ($)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={settleExPnl}
                                  onChange={(e) => setSettleExPnl(e.target.value)}
                                  placeholder="0.00"
                                  className="w-32 rounded border border-white/10 bg-background px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </div>
                              <button
                                onClick={() => settle(t, "WIN")}
                                className="rounded border border-success/40 bg-success/10 px-3 py-1 text-[10px] font-semibold text-success hover:bg-success/20"
                              >
                                ✓ Win
                              </button>
                              <button
                                onClick={() => settle(t, "LOSS")}
                                className="rounded border border-destructive/40 bg-destructive/10 px-3 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/20"
                              >
                                ✗ Loss
                              </button>
                              <button
                                onClick={() => setSettleId(null)}
                                className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
            </tbody>
          </table>
          {journal.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted-foreground">No trades yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
