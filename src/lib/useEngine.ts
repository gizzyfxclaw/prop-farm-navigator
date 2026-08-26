import { useMemo } from "react";
import { calculate, type EngineResult } from "./engine/calc";
import { useSelectedAccount, useStore } from "./store";

export function useEngine(): EngineResult {
  const account = useSelectedAccount();
  const { engine } = useStore();

  return useMemo(
    () =>
      calculate({
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
      }),
    [account, engine],
  );
}
