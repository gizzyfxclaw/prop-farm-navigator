import { useMemo } from "react";
import { calculate, type EngineResult } from "./engine/calc";
import { computeRecovery, type RecoveryState } from "./recovery";
import { useSelectedAccount, useStore } from "./store";

export function useEngine(): EngineResult {
  const account = useSelectedAccount();
  const { engine, journal } = useStore();

  return useMemo(() => {
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
            carryPhase1TotalSpent: engine.carryPhase1TotalSpent,
            carryPhase1Leftover: engine.carryPhase1Leftover,
            exnessWinTargetOverride: recovery.newExnessWinTarget,
          })
        : base;

    return { result, recovery };
  }, [account, engine, journal]);
}
