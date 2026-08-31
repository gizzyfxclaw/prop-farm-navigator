import type { EngineResult } from "./engine/calc";
import { WORST_CASE_RR } from "./engine/calc";
import type { JournalTrade } from "./store";

export interface RecoveryState {
  // ── trade counts ────────────────────────────────────────────────────────────
  loggedWins: number;
  loggedLosses: number;

  // ── dynamic remaining counts (based on ACTUAL P&L logged) ───────────────────
  /**
   * How many more prop WINS are still needed to hit the challenge target,
   * computed from actual propPnl recorded — not static trade counts.
   */
  remainingWins: number;
  /**
   * How many more prop LOSSES the account can still absorb before hitting
   * max drawdown, computed from actual propPnl recorded.
   */
  remainingLosses: number;

  // ── prop progress ────────────────────────────────────────────────────────────
  totalPropProfitLogged: number;   // sum of positive propPnl entries
  totalPropLossLogged: number;     // sum of absolute negative propPnl entries
  remainingPropTarget: number;     // targetUsd - totalPropProfitLogged
  remainingDrawdown: number;       // maxDdUsd  - totalPropLossLogged

  // ── Exness P&L tracking ─────────────────────────────────────────────────────
  actualExnessPnl: number;         // net Exness PnL so far (wins - losses)
  totalExnessWins: number;         // gross positive Exness earnings
  totalExnessLosses: number;       // gross Exness losses (absolute)
  /** bufferedExnessCapital (starting stake) + actualExnessPnl */
  actualExnessBalance: number;

  // ── self-healing target ─────────────────────────────────────────────────────
  /** Net Exness still needs to earn to cover totalRecovery. */
  recoveryShortfall: number;
  /**
   * Adjusted per-trade Exness win target so the shortfall closes by the last
   * remaining prop loss. Null when no prop losses remain.
   */
  newExnessWinTarget: number | null;
  newExnessLossTarget: number | null;   // newExnessWinTarget * WORST_CASE_RR
  /** true when newExnessWinTarget differs materially from the current engine target. */
  adjustmentNeeded: boolean;

  // ── edge case alerts ────────────────────────────────────────────────────────
  /** Challenge is complete — prop target reached. */
  challengePassed: boolean;
  /** Exness buffer has been depleted — deposit required. */
  bufferDepleted: boolean;
  /** Amount needed to top up Exness so the loop stays funded. */
  depositNeeded: number;
}

export function computeRecovery(r: EngineResult, journal: JournalTrade[]): RecoveryState {
  const closed = journal.filter((t) => t.result !== "OPEN");

  const loggedWins   = closed.filter((t) => t.result === "WIN").length;
  const loggedLosses = closed.filter((t) => t.result === "LOSS").length;

  // ── PART 2: Dynamic remaining counts from ACTUAL P&L ──────────────────────

  const totalPropProfitLogged = closed
    .filter((t) => t.propPnl > 0)
    .reduce((s, t) => s + t.propPnl, 0);

  const totalPropLossLogged = closed
    .filter((t) => t.propPnl < 0)
    .reduce((s, t) => s + Math.abs(t.propPnl), 0);

  // How much prop profit still needed to pass the challenge
  const remainingPropTarget = Math.max(0, r.targetUsd - totalPropProfitLogged);

  // How much drawdown budget remains
  const remainingDrawdown = Math.max(0, r.maxDdUsd - totalPropLossLogged);

  // Prop win per trade (locked — never auto-changed)
  const propWinPerTrade = r.propWinPerTrade;   // propRiskUsd * rr
  const propRiskUsd     = r.propWinPerTrade / r.winsToPass / (r.winsToPass > 0 ? 1 : 1);
  // Better: derive propRiskUsd from the engine result directly
  // propWinPerTrade = propRiskUsd * rr  →  propRiskUsd = propWinPerTrade / rr
  // We don't have rr on EngineResult directly but we can derive it:
  const impliedPropRisk = r.propWinPerTrade / (r.winsToPass > 0
    ? r.winsToPass / (r.winsToPass > 0 ? 1 : 1)   // just use propWinPerTrade directly
    : 1);

  // remainingWins = ceil(remainingPropTarget / propWinPerTrade)
  const remainingWins = remainingPropTarget <= 0
    ? 0
    : Math.max(0, Math.ceil(remainingPropTarget / propWinPerTrade));

  // remainingLosses = floor(remainingDrawdown / propRisk)
  // We can back out propRisk: propWinPerTrade = propRisk * rr
  // But rr isn't stored on EngineResult — use lossesToBlow as the denominator ratio
  // Actually the cleanest: maxDdUsd / lossesToBlow = propRisk per trade
  const impliedPropRiskPerLoss = r.lossesToBlow > 0 ? r.maxDdUsd / r.lossesToBlow : r.propWinPerTrade;
  const remainingLosses = remainingDrawdown <= 0
    ? 0
    : Math.max(0, Math.floor(remainingDrawdown / impliedPropRiskPerLoss));

  // ── PART 3: Exness P&L tracking ───────────────────────────────────────────

  const totalExnessWins   = closed
    .filter((t) => t.exPnl > 0)
    .reduce((s, t) => s + t.exPnl, 0);

  const totalExnessLosses = closed
    .filter((t) => t.exPnl < 0)
    .reduce((s, t) => s + Math.abs(t.exPnl), 0);

  const actualExnessPnl     = totalExnessWins - totalExnessLosses;
  const actualExnessBalance = r.requiredExnessCapital + actualExnessPnl;

  // totalRecovery = fee + desiredProfit (Phase 1 default)
  // Phase 2 uses phase2.totalRecovery; we expose both via r
  const totalTargetRecovery = r.phase1.totalRecovery; // fee + desiredProfit always

  // How much Exness still needs to net-earn
  const recoveryShortfall = Math.max(0, totalTargetRecovery - actualExnessPnl);

  // Self-healing: spread remaining shortfall across remaining prop losses
  const newExnessWinTarget = remainingLosses > 0
    ? recoveryShortfall / remainingLosses
    : null;

  const newExnessLossTarget = newExnessWinTarget != null
    ? newExnessWinTarget * WORST_CASE_RR
    : null;

  const adjustmentNeeded =
    newExnessWinTarget !== null &&
    Math.abs(newExnessWinTarget - r.exnessWinTarget) > 0.01;

  // ── PART 4: Edge case alerts ───────────────────────────────────────────────

  // Challenge passed: remaining prop target is gone
  const challengePassed = remainingPropTarget <= 0 && loggedWins > 0;

  // Exness buffer depletion:
  // currentExnessBalance = bufferedExnessCapital + actualExnessPnl
  // Needed to finish = newExnessLossTarget * winsToPass
  // (winsToPass = how many more Exness LOSS scenarios can happen = remainingWins on prop)
  const exnessNeededToFinish = newExnessLossTarget != null
    ? newExnessLossTarget * remainingWins
    : r.exnessLossTarget * r.winsToPass;

  const bufferDepleted = !challengePassed && actualExnessBalance < exnessNeededToFinish;
  const depositNeeded  = bufferDepleted
    ? Math.max(0, exnessNeededToFinish - actualExnessBalance)
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
    actualExnessBalance,
    recoveryShortfall,
    newExnessWinTarget,
    newExnessLossTarget,
    adjustmentNeeded,
    challengePassed,
    bufferDepleted,
    depositNeeded,
  };
}
