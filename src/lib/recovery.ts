import type { EngineResult } from "./engine/calc";
import type { JournalTrade } from "./store";

/**
 * Targeted Slippage Martingale (TSM) recovery state.
 */
export interface RecoveryState {
  loggedWins: number;
  loggedLosses: number;
  remainingWins: number;
  remainingLosses: number;

  totalPropProfitLogged: number;
  totalPropLossLogged: number;
  remainingPropTarget: number;
  remainingDrawdown: number;

  actualExnessPnl: number;
  totalExnessWins: number;
  totalExnessLosses: number;
  initialExnessDeposit: number;
  actualExnessBalance: number;

  slippageDebt: number;
  totalSlippageAccrued: number;
  baseExnessWinTarget: number;
  baseExnessLossTarget: number;
  newExnessWinTarget: number;
  newExnessLossTarget: number;
  adjustmentNeeded: boolean;
  dynamicExnessCapital: number;

  propFee: number;
  exnessFuelExhausted: number;
  realMoneyNet: number;
  netResultAfterPayout: number;
  /** Total money actually lost over the run: Exness fuel exhausted + prop fee
   *  (audit §5.9 — this field was read by the UI but never defined, so the
   *  UI always showed $0.00). */
  totalMoneyLost: number;

  /** Today's P&L on the prop account (deduped mirror legs, audit §5.8). */
  dailyPropPnl: number;
  /** Today's combined (prop + Exness) P&L, deduped the same way. */
  dailyNetPnl: number;
  /** The account's daily profit cap in $ (0 = no cap set). */
  dailyProfitCap: number;
  /** True once today's prop P&L reaches the daily profit cap. */
  dailyCapLocked: boolean;
  /** Mirror trades whose P&L signs are impossible (prop WIN and Exness WIN
   *  on the same trade) — bad journal data, skipped, never silently fixed. */
  anomalousMirrorTrades: number;

  challengePassed: boolean;
  bufferDepleted: boolean;
  depositNeeded: number;

  phase: 1 | 2;

  totalPropSlippage: number;
  rePacedExnessTarget: number;
  dynamicBaseTarget: number;
  adjustedRemainingLosses: number;
  recoveryShortfall: number;
  effectiveBaseTarget: number;
  exnessWinsNeeded: number;

  isDefensiveMode: boolean;
  standardPropRisk: number;
  expandedLossesToBlow: number;
}

function expectedExnessPnl(
  r: EngineResult,
  result: "WIN" | "LOSS",
  rr: number,
  trade?: JournalTrade,
): number {
  let baseTarget: number;
  if (trade?.details?.baseExnessWinTarget != null && trade.details.baseExnessWinTarget > 0) {
    baseTarget = trade.details.baseExnessWinTarget;
  } else if (trade?.details?.propRiskAtLog != null && trade.details.propRiskAtLog > 0) {
    const legsAtLog = Math.max(1, Math.floor(r.maxDdUsd / trade.details.propRiskAtLog));
    // Audit §5.7: trueDeficit ALREADY includes the fee (fee + Exness losses),
    // so in Phase 2 use it alone — propFee + trueDeficit double-counted the
    // fee ($14.30 instead of $9.53 on the $5k clean case).
    const recoveryTotal = r.phase === 2 ? r.trueDeficit : r.propFee;
    baseTarget = recoveryTotal / legsAtLog;
  } else if (trade?.details?.phase != null) {
    const chain = trade.details.phase === 1 ? r.phase1 : r.phase2;
    baseTarget = chain.exnessWinTarget;
  } else {
    baseTarget = r.exnessWinTarget;
  }

  if (result === "LOSS") return baseTarget;
  return -(baseTarget * rr);
}

/** Local YYYY-MM-DD, matching how the journal stamps trade dates. */
export function localToday(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Today's P&L from the journal, counting each mirror outcome ONCE.
 * The engine logs one journal entry per leg, and each settled leg carries
 * the FULL mirror P&L — summing raw entries would double-count a trade.
 * Legs of one mirror share date + pair + entry + result, so that key dedupes
 * them. Two genuinely different trades at the same entry on the same day
 * would also collapse into one — a known, documented approximation; the
 * journal's per-leg entries do not carry a shared mirror id to join on.
 */
export function dailyPnl(journal: JournalTrade[], today = localToday()): { propPnl: number; netPnl: number } {
  const seen = new Set<string>();
  let propPnl = 0;
  let netPnl = 0;
  for (const t of journal) {
    if (t.result === "OPEN" || t.date !== today) continue;
    const key = [t.date, t.pair, t.details?.entry ?? "", t.result, t.details?.phase ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    propPnl += t.propPnl;
    netPnl += t.netPnl;
  }
  return { propPnl, netPnl };
}

export function computeRecovery(r: EngineResult, journal: JournalTrade[]): RecoveryState {
  const closed = journal.filter((t) => t.result !== "OPEN");

  const loggedWins   = closed.filter((t) => t.result === "WIN").length;
  const loggedLosses = closed.filter((t) => t.result === "LOSS").length;

  const totalPropProfitLogged = closed
    .filter((t) => t.propPnl > 0)
    .reduce((s, t) => s + t.propPnl, 0);

  const totalPropLossLogged = closed
    .filter((t) => t.propPnl < 0)
    .reduce((s, t) => s + Math.abs(t.propPnl), 0);

  const currentEquity = totalPropProfitLogged - totalPropLossLogged;
  const remainingPropTarget = Math.max(0, r.targetUsd - currentEquity);

  const drawdownFromStart = Math.max(0, -currentEquity);
  const remainingDrawdown = Math.max(0, r.maxDdUsd - drawdownFromStart);

  const totalExnessWins   = closed
    .filter((t) => t.exPnl > 0)
    .reduce((s, t) => s + t.exPnl, 0);
  const totalExnessLosses = closed
    .filter((t) => t.exPnl < 0)
    .reduce((s, t) => s + Math.abs(t.exPnl), 0);
  const actualExnessPnl     = totalExnessWins - totalExnessLosses;

  // Starting/Initial Exness deposit (e.g. $40.66)
  // Audit §5.9: the old code read r.bufferedExnessCapital, which does not
  // exist on EngineResult (TS error, runtime undefined → NaN balance).
  // The active chain's buffered capital is requiredExnessCapital.
  const initialExnessDeposit = (r.actualExnessBalance != null && r.actualExnessBalance > 0)
    ? r.actualExnessBalance
    : r.requiredExnessCapital;

  // Real-time Current Exness balance = Initial Deposit + Net Exness PnL made so far
  const actualExnessBalance = initialExnessDeposit + actualExnessPnl;

  const currentRiskPerTrade = r.cappedPropRisk > 0 ? r.cappedPropRisk : (r.lossesToBlow > 0 ? r.maxDdUsd / r.lossesToBlow : r.propWinPerTrade);
  const totalPropSlippage = closed
    .filter((t) => t.result === "LOSS")
    .reduce((s, t) => {
      const riskAtTrade = t.details?.propRiskAtLog ?? currentRiskPerTrade;
      const actualLoss = Math.abs(t.propPnl);
      return s + (actualLoss > riskAtTrade ? actualLoss - riskAtTrade : 0);
    }, 0);

  const adjustedRemainingLosses = remainingDrawdown <= 0
    ? 0
    : Math.max(0, Math.floor(remainingDrawdown / currentRiskPerTrade));

  // Use NET retained (wins minus losses) — gross wins overstate recovery because
  // Exness loses money on every prop win, erasing prior gains.
  const netRetained = Math.max(0, totalExnessWins - totalExnessLosses);
  const recoveryShortfall = Math.max(0, r.propFee - netRetained);

  const rePacedExnessTarget = adjustedRemainingLosses > 0
    ? recoveryShortfall / adjustedRemainingLosses
    : recoveryShortfall;

  let slippageDebt = 0;
  let totalSlippageAccrued = 0;
  let anomalousMirrorTrades = 0;
  for (const t of closed) {
    if (t.result === "OPEN") continue;

    const tradePhase = t.details?.phase ?? r.phase;
    if (r.phase === 2 && tradePhase === 1) continue;

    const rr = t.details?.rr ?? 1.5;
    // Audit §5.11: the expectation is the BUMPED target, not the base one.
    // Debt raised the target to base + debt, so an Exness win of exactly the
    // old base target did NOT cover the bumped target — it must not wipe the
    // debt, it must grow it by the remaining gap.
    const expectedBase = expectedExnessPnl(r, t.result, rr, t);
    const expected =
      t.result === "LOSS"
        ? expectedBase + slippageDebt
        : -(Math.abs(expectedBase) + slippageDebt * rr);

    // A prop WIN where Exness ALSO won is impossible in a true mirror — bad
    // journal data. Count it and skip it instead of silently ignoring it.
    if (t.result === "WIN" && t.exPnl > 0) {
      anomalousMirrorTrades += 1;
      continue;
    }
    if (t.result === "LOSS" && t.exPnl < 0) continue;

    if (t.result === "LOSS") {
      // The Exness win PAYS DOWN the debt. Obligation = bumped target
      // (logged base + outstanding debt — the journal logs the chain base,
      // never the bumped override, so recovery must add the debt itself).
      // New debt = the unrecovered shortfall, NOT old debt + shortfall:
      // winning exactly the base with $0.74 outstanding leaves $0.74 owed,
      // it does not double it to $1.48.
      if (t.exPnl >= expected) {
        if (slippageDebt > 0) slippageDebt = 0;
      } else {
        const newDebt = expected - t.exPnl;
        totalSlippageAccrued += Math.max(0, newDebt - slippageDebt);
        slippageDebt = newDebt;
      }
    } else {
      const expectedLoss = -expected;
      const actualLoss   = Math.abs(t.exPnl);
      if (actualLoss > expectedLoss) {
        const slip = actualLoss - expectedLoss;
        slippageDebt += slip;
        totalSlippageAccrued += slip;
      }
    }
  }

  const activeChain = r.phase === 1 ? r.phase1 : r.phase2;
  const baseExnessWinTarget = Math.max(0, activeChain.exnessWinTarget);
  const baseExnessLossTarget = baseExnessWinTarget * r.rr;

  // Defensive Mode: Triggered when user manually lowers Prop Risk below the standard baseline (1% of account size)
  const standardPropRisk = r.account?.size ? r.account.size * 0.01 : 50;
  const isDefensiveMode = r.cappedPropRisk < standardPropRisk - 0.001;
  const expandedLossesToBlow = adjustedRemainingLosses > 0 ? adjustedRemainingLosses : r.lossesToBlow;

  // Dynamic Base Target: When trades are logged and re-pacing / defensive mode is active, use rePacedExnessTarget
  const dynamicBaseTarget = (closed.length > 0 && adjustedRemainingLosses > 0 && (totalPropSlippage > 0 || isDefensiveMode))
    ? rePacedExnessTarget
    : baseExnessWinTarget;
  const effectiveBaseTarget = dynamicBaseTarget;
  const newExnessWinTarget  = effectiveBaseTarget + slippageDebt;
  const newExnessLossTarget = newExnessWinTarget * r.rr;
  const adjustmentNeeded    = slippageDebt > 0.005 || totalPropSlippage > 0 || (isDefensiveMode && closed.length > 0 && Math.abs(newExnessWinTarget - baseExnessWinTarget) > 0.005);

  const pureDynamicCapital     = newExnessLossTarget * r.winsToPass;
  const bufferMultiplier       = 1 + r.bufferPct / 100;
  const dynamicExnessCapital   = pureDynamicCapital * bufferMultiplier;

  const challengePassed = remainingPropTarget <= 0 && loggedWins > 0;

  // Simple counter logic for clear user-facing numbers.
  // Audit §5.10: ONE legs-left definition everywhere — the dollar-based one.
  // Count-based (lossesToBlow − loggedLosses) says 4 legs left after two
  // $57/$56 losses, but the drawdown actually left only funds 3 legs at
  // $50 risk. The dollar figure is the honest one.
  const remainingWins = Math.max(0, r.winsToPass - loggedWins);
  const remainingLosses = adjustedRemainingLosses;

  const exnessNeededToFinish = newExnessLossTarget * Math.max(1, remainingWins);
  const bufferDepleted = !challengePassed && actualExnessBalance < exnessNeededToFinish;
  const depositNeeded  = bufferDepleted
    ? Math.max(0, exnessNeededToFinish - actualExnessBalance)
    : 0;

  const propFee = r.propFee;
  const exnessFuelExhausted = Math.max(0, -actualExnessPnl);
  const realMoneyNet = actualExnessPnl - propFee;
  const netResultAfterPayout = r.propPayout + actualExnessPnl - propFee;
  // Audit §5.9: total money lost = Exness fuel exhausted + the prop fee.
  const totalMoneyLost = exnessFuelExhausted + propFee;

  // Audit §5.8: a REAL $ daily cap. The old rule locked trading after ANY
  // win today, however small, and the engine's per-trade reward cap did not
  // stop two $60 wins ($120) in a day. Now the lock is the account's daily
  // profit cap in dollars (e.g. $100 on a $5k E8 account).
  const { propPnl: dailyPropPnl, netPnl: dailyNetPnl } = dailyPnl(journal);
  const dailyProfitCap = r.account.dailyProfitCap ?? 0;
  const dailyCapLocked = dailyProfitCap > 0 && dailyPropPnl >= dailyProfitCap;

  // Recovery Countdown: how many Exness wins are needed to fully recover the fee?
  const exnessWinsNeeded = recoveryShortfall > 0 && newExnessWinTarget > 0
    ? Math.ceil(recoveryShortfall / newExnessWinTarget)
    : 0;

  return {
    loggedWins,
    loggedLosses,
    remainingWins,
    remainingLosses,
    totalPropProfitLogged,
    totalPropLossLogged,
    remainingPropTarget,
    remainingDrawdown,
    actualExnessPnl,
    totalExnessWins,
    totalExnessLosses,
    initialExnessDeposit,
    actualExnessBalance,
    slippageDebt,
    totalSlippageAccrued,
    baseExnessWinTarget,
    baseExnessLossTarget,
    newExnessWinTarget,
    newExnessLossTarget,
    adjustmentNeeded,
    dynamicExnessCapital,
    propFee,
    exnessFuelExhausted,
    realMoneyNet,
    netResultAfterPayout,
    totalMoneyLost,
    dailyPropPnl,
    dailyNetPnl,
    dailyProfitCap,
    dailyCapLocked,
    anomalousMirrorTrades,
    challengePassed,
    bufferDepleted,
    depositNeeded,
    phase: r.phase,
    totalPropSlippage,
    rePacedExnessTarget,
    dynamicBaseTarget,
    adjustedRemainingLosses,
    recoveryShortfall,
    effectiveBaseTarget,
    exnessWinsNeeded,
    isDefensiveMode,
    standardPropRisk,
    expandedLossesToBlow,
  };
}
