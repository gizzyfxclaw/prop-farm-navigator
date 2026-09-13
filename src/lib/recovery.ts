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
  actualExnessBalance: number;

  slippageDebt: number;
  totalSlippageAccrued: number;
  baseExnessWinTarget: number;
  newExnessWinTarget: number;
  newExnessLossTarget: number;
  adjustmentNeeded: boolean;
  dynamicExnessCapital: number;

  propFee: number;
  exnessFuelExhausted: number;
  realMoneyNet: number;
  netResultAfterPayout: number;

  challengePassed: boolean;
  bufferDepleted: boolean;
  depositNeeded: number;

  phase: 1 | 2;

  totalPropSlippage: number;
  rePacedExnessTarget: number;
  adjustedRemainingLosses: number;
  recoveryShortfall: number;
  effectiveBaseTarget: number;
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
  } else if (trade?.details?.phase != null) {
    const chain = trade.details.phase === 1 ? r.phase1 : r.phase2;
    baseTarget = chain.exnessWinTarget;
  } else {
    baseTarget = r.exnessWinTarget;
  }

  if (result === "LOSS") return baseTarget;
  return -(baseTarget * rr);
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
  const actualExnessBalance = r.actualExnessBalance;

  const propRiskPerTrade = r.lossesToBlow > 0 ? r.maxDdUsd / r.lossesToBlow : r.propWinPerTrade;
  const totalPropSlippage = closed
    .filter((t) => t.result === "LOSS" && Math.abs(t.propPnl) > propRiskPerTrade)
    .reduce((s, t) => s + (Math.abs(t.propPnl) - propRiskPerTrade), 0);

  const adjustedRemainingLosses = remainingDrawdown <= 0
    ? 0
    : Math.max(0, Math.floor(remainingDrawdown / propRiskPerTrade));

  const recoveryShortfall = Math.max(0, r.propFee - totalExnessWins);

  const rePacedExnessTarget = adjustedRemainingLosses > 0
    ? recoveryShortfall / adjustedRemainingLosses
    : recoveryShortfall;

  let slippageDebt = 0;
  let totalSlippageAccrued = 0;
  for (const t of closed) {
    if (t.result === "OPEN") continue;

    const tradePhase = t.details?.phase ?? r.phase;
    if (r.phase === 2 && tradePhase === 1) continue;

    const rr = t.details?.rr ?? 1.5;
    const expected = expectedExnessPnl(r, t.result, rr, t);

    if (t.result === "WIN" && t.exPnl > 0) continue;
    if (t.result === "LOSS" && t.exPnl < 0) continue;

    if (t.result === "LOSS") {
      if (t.exPnl >= expected) {
        if (slippageDebt > 0) slippageDebt = 0;
      } else {
        const slip = expected - t.exPnl;
        slippageDebt += slip;
        totalSlippageAccrued += slip;
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
  const effectiveBaseTarget = totalPropSlippage > 0 ? rePacedExnessTarget : baseExnessWinTarget;
  const newExnessWinTarget  = effectiveBaseTarget + slippageDebt;
  const newExnessLossTarget = newExnessWinTarget * r.rr;
  const adjustmentNeeded    = slippageDebt > 0.005 || totalPropSlippage > 0;

  const pureDynamicCapital     = newExnessLossTarget * r.winsToPass;
  const bufferMultiplier       = 1 + r.bufferPct / 100;
  const dynamicExnessCapital   = pureDynamicCapital * bufferMultiplier;

  const challengePassed = remainingPropTarget <= 0 && loggedWins > 0;

  // Simple counter logic for clear user-facing numbers
  const remainingWins = Math.max(0, r.winsToPass - loggedWins);
  const remainingLosses = Math.max(0, r.lossesToBlow - loggedLosses);

  const exnessNeededToFinish = newExnessLossTarget * Math.max(1, remainingWins);
  const bufferDepleted = !challengePassed && actualExnessBalance < exnessNeededToFinish;
  const depositNeeded  = bufferDepleted
    ? Math.max(0, exnessNeededToFinish - actualExnessBalance)
    : 0;

  const propFee = r.propFee;
  const exnessFuelExhausted = Math.max(0, -actualExnessPnl);
  const realMoneyNet = actualExnessPnl - propFee;
  const netResultAfterPayout = r.propPayout + actualExnessPnl - propFee;

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
    actualExnessBalance,
    slippageDebt,
    totalSlippageAccrued,
    baseExnessWinTarget,
    newExnessWinTarget,
    newExnessLossTarget,
    adjustmentNeeded,
    dynamicExnessCapital,
    propFee,
    exnessFuelExhausted,
    realMoneyNet,
    netResultAfterPayout,
    challengePassed,
    bufferDepleted,
    depositNeeded,
    phase: r.phase,
    totalPropSlippage,
    rePacedExnessTarget,
    adjustedRemainingLosses,
    recoveryShortfall,
    effectiveBaseTarget,
  };
}
