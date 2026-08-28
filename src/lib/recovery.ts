import type { EngineResult } from "./engine/calc";
import type { JournalTrade } from "./store";

export interface RecoveryState {
  loggedWins: number;
  loggedLosses: number;
  remainingWins: number;
  remainingLosses: number;
  /** Running sum of the exPnl column across all closed trades. */
  actualExnessPnl: number;
  /** bufferedExnessCapital (what you started with) + actualExnessPnl */
  actualExnessBalance: number;
  /** Amount Exness still needs to net-earn to fully recover fee + desired profit. */
  recoveryShortfall: number;
  /** Adjusted per-trade Exness win target so the shortfall closes by the last remaining prop loss.
   *  null when no prop losses remain (recovery target already met or not applicable). */
  newExnessWinTarget: number | null;
  /** true when newExnessWinTarget differs materially from the current engine target. */
  adjustmentNeeded: boolean;
}

export function computeRecovery(r: EngineResult, journal: JournalTrade[]): RecoveryState {
  const closed = journal.filter((t) => t.result !== "OPEN");
  const loggedWins = closed.filter((t) => t.result === "WIN").length;
  const loggedLosses = closed.filter((t) => t.result === "LOSS").length;

  const remainingWins = Math.max(0, r.winsToPass - loggedWins);
  const remainingLosses = Math.max(0, r.lossesToBlow - loggedLosses);

  const actualExnessPnl = closed.reduce((s, t) => s + t.exPnl, 0);
  // Start with the capital that was deployed into Exness (buffered), then track actual drift.
  const actualExnessBalance = r.requiredExnessCapital + actualExnessPnl;

  // totalRecovery is fee + desiredProfit — the net amount Exness must earn in total.
  const totalExnessNeedToEarn = r.phase1.totalRecovery;
  const recoveryShortfall = Math.max(0, totalExnessNeedToEarn - actualExnessPnl);

  // Each remaining prop LOSS = one Exness WIN. Spread the shortfall across those wins.
  const newExnessWinTarget = remainingLosses > 0 ? recoveryShortfall / remainingLosses : null;

  const adjustmentNeeded =
    newExnessWinTarget !== null && Math.abs(newExnessWinTarget - r.exnessWinTarget) > 0.01;

  return {
    loggedWins,
    loggedLosses,
    remainingWins,
    remainingLosses,
    actualExnessPnl,
    actualExnessBalance,
    recoveryShortfall,
    newExnessWinTarget,
    adjustmentNeeded,
  };
}
