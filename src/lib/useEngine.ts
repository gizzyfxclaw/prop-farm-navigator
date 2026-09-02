import { useMemo } from "react";
import { calculate, type EngineResult } from "./engine/calc";
import { computeRecovery, type RecoveryState } from "./recovery";
import { useSelectedAccount, useStore } from "./store";

export function useEngine(): EngineResult {
  const account = useSelectedAccount();
  const { engine, journal } = useStore();

  return useMemo(() => {
    // Compute actual Exness losses from journal for Phase 2 recovery
    const actualExnessLosses = journal
      .filter((t) => t.result !== "OPEN" && t.exPnl < 0)
      .reduce((s, t) => s + Math.abs(t.exPnl), 0);

    // First pass: compute without recovery override to get the base engine state.
    const base = calculate({
      account,
      phase: engine.phase,
      propRiskUsd: engine.propRiskUsd,
      rr: engine.rr,
      slPips: engine.slPips,
      desiredProfit: engine.desiredProfit,
      bufferPct: engine.bufferPct,
      pair: engine.pair,
      direction: engine.direction,
      entryPrice: engine.entryPrice,
      exnessAccountType: engine.exnessAccountType,
      actualExnessBalance: engine.actualExnessBalance,
      actualExnessLosses,
      carryPhase1TotalSpent: engine.carryPhase1TotalSpent,
      carryPhase1Leftover: engine.carryPhase1Leftover,
    });

    // Compute recovery and re-run with the adjusted win target when needed.
    const recovery = computeRecovery(base, journal);
    if (!recovery.adjustmentNeeded || recovery.newExnessWinTarget == null) return base;

    return calculate({
      account,
      phase: engine.phase,
      propRiskUsd: engine.propRiskUsd,
      rr: engine.rr,
      slPips: engine.slPips,
      desiredProfit: engine.desiredProfit,
      bufferPct: engine.bufferPct,
      pair: engine.pair,
      direction: engine.direction,
      entryPrice: engine.entryPrice,
      exnessAccountType: engine.exnessAccountType,
      actualExnessBalance: engine.actualExnessBalance,
      actualExnessLosses,
      carryPhase1TotalSpent: engine.carryPhase1TotalSpent,
      carryPhase1Leftover: engine.carryPhase1Leftover,
      exnessWinTargetOverride: recovery.newExnessWinTarget,
    });
  }, [account, engine, journal]);
}

/** useEngine with the recovery state exposed side-by-side. */
export function useEngineWithRecovery(): { result: EngineResult; recovery: RecoveryState } {
  const account = useSelectedAccount();
  const { engine, journal } = useStore();

  return useMemo(() => {
    // Compute actual Exness losses from journal for Phase 2 recovery
    const actualExnessLosses = journal
      .filter((t) => t.result !== "OPEN" && t.exPnl < 0)
      .reduce((s, t) => s + Math.abs(t.exPnl), 0);

    const base = calculate({
      account,
      phase: engine.phase,
      propRiskUsd: engine.propRiskUsd,
      rr: engine.rr,
      slPips: engine.slPips,
      desiredProfit: engine.desiredProfit,
      bufferPct: engine.bufferPct,
      pair: engine.pair,
      direction: engine.direction,
      entryPrice: engine.entryPrice,
      exnessAccountType: engine.exnessAccountType,
      actualExnessBalance: engine.actualExnessBalance,
      actualExnessLosses,
      carryPhase1TotalSpent: engine.carryPhase1TotalSpent,
      carryPhase1Leftover: engine.carryPhase1Leftover,
    });
    const recovery = computeRecovery(base, journal);

    const result =
      recovery.adjustmentNeeded && recovery.newExnessWinTarget != null
        ? calculate({
            account,
            phase: engine.phase,
            propRiskUsd: engine.propRiskUsd,
            rr: engine.rr,
            slPips: engine.slPips,
            desiredProfit: engine.desiredProfit,
            bufferPct: engine.bufferPct,
            pair: engine.pair,
            direction: engine.direction,
            entryPrice: engine.entryPrice,
            exnessAccountType: engine.exnessAccountType,
            actualExnessBalance: engine.actualExnessBalance,
            actualExnessLosses,
            carryPhase1TotalSpent: engine.carryPhase1TotalSpent,
            carryPhase1Leftover: engine.carryPhase1Leftover,
            exnessWinTargetOverride: recovery.newExnessWinTarget,
          })
        : base;

    return { result, recovery };
  }, [account, engine, journal]);
}
