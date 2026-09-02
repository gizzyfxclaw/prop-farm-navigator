import { livePipValue, pairSpec, roundPrice, type PairSymbol } from "./pairs";

/**
 * GizzyFx mathematical engine.
 *
 * Capital-requirement numbers are sized for the SELECTED R:R multiplier,
 * so the user sees exact capital needs for each R:R ratio (1:1.5 / 1:2 /
 * 1:2.5 / 1:3). The UI clamps at 1:3.
 *
 * Live trade sizing (lots, SL/TP prices) uses the R:R actually selected.
 */
export const MAX_RR = 3;

export type DrawdownType = "Static" | "Trailing";
export type Direction = "LONG" | "SHORT";
export type ExnessAccountType = "Standard" | "Cent";

export interface PropAccount {
  id: string;
  firm: string;
  size: number;
  /** one-time challenge fee in USD */
  fee: number;
  targetPct: number;
  ddPct: number;
  ddType: DrawdownType;
  /** profit split paid to the trader, in percent */
  splitPct: number;
  metaApiAccountId?: string;
  /** Daily profit cap in USD — engine auto-reduces risk to stay under this cap */
  dailyProfitCap?: number;
}

export interface EngineInputs {
  account: PropAccount;
  phase: 1 | 2;
  propRiskUsd: number;
  rr: number;
  slPips: number;
  desiredProfit: number;
  bufferPct: number;
  pair: PairSymbol | string;
  direction: Direction;
  entryPrice: number;
  exnessAccountType: ExnessAccountType;
  /** Actual Exness account balance (user-entered, overrides calculated) */
  actualExnessBalance?: number | null;
  /** Phase 2 carry-over overrides. When omitted the Phase 1 chain supplies them. */
  carryPhase1TotalSpent?: number | null;
  carryPhase1Leftover?: number | null;
  /** Recovery override: replaces the computed exnessWinTarget for lot-size calculation only. */
  exnessWinTargetOverride?: number | null;
}

export interface PhaseChain {
  totalRecovery: number;
  exnessWinTarget: number;
  exnessLossTarget: number;
  pureExnessCapital: number;
  bufferedExnessCapital: number;
  exnessBurnIfPassed: number;
  leftoverIfPassed: number;
}

export interface EngineResult {
  // account level
  targetUsd: number;
  maxDdUsd: number;
  /** Challenge fee paid upfront (real cash). */
  propFee: number;
  propWinPerTrade: number;
  lossesToBlow: number;
  winsToPass: number;
  /** Selected R:R multiplier (1.5 / 2 / 2.5 / 3). */
  rr: number;

  // pips / prices
  pipValue: number;
  exnessPipValue: number;
  pipSize: number;
  decimals: number;
  propSlPips: number;
  propTpPips: number;
  exnessSlPips: number;
  exnessTpPips: number;
  propDirection: Direction;
  exnessDirection: Direction;
  entryPrice: number;
  propSl: number;
  propTp: number;
  exnessSl: number;
  exnessTp: number;
  propLots: number;
  exnessLots: number;
  /** Prop risk actually used (may be reduced by daily profit cap). */
  cappedPropRisk: number;
  /** True when daily profit cap forced a risk reduction. */
  riskCapped: boolean;

  // shield chains (worst-case R:R = 2)
  phase1: PhaseChain;
  phase2: PhaseChain;
  phase1TotalSpent: number;
  phase1Leftover: number;
  phase2RefillRequired: number;

  // active phase figures
  phase: 1 | 2;
  exnessWinTarget: number;
  exnessLossTarget: number;
  requiredExnessCapital: number;
  totalRequiredCapital: number;
  /** Actual Exness balance (user-entered, used for buffer depletion checks) */
  actualExnessBalance: number;
  /** User-selected safety buffer (e.g. 20). Exposed so the recovery layer can
   *  recompute the buffered Exness capital when the martingale bumps the
   *  win target up. */
  bufferPct: number;
  capitalBreakdown: { label: string; value: number }[];

  // final P&L
  propPayout: number;
  leftoverExnessBalance: number;
  netProfitIfPassed: number;
  verdict: {
    level: "green" | "red";
    title: string;
    detail: string;
  };
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function buildChain(totalRecovery: number, lossesToBlow: number, winsToPass: number, bufferPct: number, rr: number): PhaseChain {
  const exnessWinTarget = totalRecovery / lossesToBlow;
  const exnessLossTarget = exnessWinTarget * rr;
  const pureExnessCapital = exnessLossTarget * winsToPass;
  const bufferedExnessCapital = pureExnessCapital * (1 + bufferPct / 100);
  const exnessBurnIfPassed = exnessLossTarget * winsToPass;
  return {
    totalRecovery,
    exnessWinTarget,
    exnessLossTarget,
    pureExnessCapital,
    bufferedExnessCapital,
    exnessBurnIfPassed,
    leftoverIfPassed: bufferedExnessCapital - exnessBurnIfPassed,
  };
}

export function calculate(input: EngineInputs): EngineResult {
  const spec = pairSpec(String(input.pair));
  const account = input.account;

  const size = Math.max(0, num(account.size));
  const fee = Math.max(0, num(account.fee));
  const bufferPct = Math.max(0, num(input.bufferPct));
  const desiredProfit = Math.max(0, num(input.desiredProfit));
  const rr = num(input.rr, 2) > 0 ? num(input.rr, 2) : 2;
  const slPips = Math.max(0.1, num(input.slPips, 30));
  const entryPrice = num(input.entryPrice);

  const targetUsd = (size * num(account.targetPct)) / 100;
  const maxDdUsd = (size * num(account.ddPct)) / 100;
  const propRiskUsd = Math.max(0.01, num(input.propRiskUsd, 1));
  const propWinPerTrade = propRiskUsd * rr;

  // ---- Daily Profit Cap compliance ----
  // If the account has a dailyProfitCap, ensure prop reward doesn't exceed it.
  // If propRiskUsd * rr > dailyProfitCap, reduce risk to stay compliant.
  let cappedPropRisk = propRiskUsd;
  let riskCapped = false;
  const dailyCap = account.dailyProfitCap != null && account.dailyProfitCap > 0 ? num(account.dailyProfitCap) : 0;
  if (dailyCap > 0 && propWinPerTrade > dailyCap) {
    cappedPropRisk = Math.floor((dailyCap / rr) * 100) / 100; // round down to cents
    riskCapped = true;
  }
  // Use capped risk for all downstream calculations
  const effectivePropRisk = cappedPropRisk;
  const effectivePropWinPerTrade = effectivePropRisk * rr;

  // Full losses the prop account can absorb before the drawdown floor is hit.
  const lossesToBlow = Math.max(1, Math.floor(maxDdUsd / effectivePropRisk) || 1);
  const winsToPass = Math.max(1, Math.ceil(targetUsd / effectivePropWinPerTrade) || 1);

  // ---- Escalating shield (sized by selected R:R) ----
  const phase1 = buildChain(fee + desiredProfit, lossesToBlow, winsToPass, bufferPct, rr);
  const phase1TotalSpent =
    input.phase === 2 && input.carryPhase1TotalSpent != null && input.carryPhase1TotalSpent > 0
      ? num(input.carryPhase1TotalSpent)
      : fee + phase1.bufferedExnessCapital;
  const phase1Leftover =
    input.phase === 2 && input.carryPhase1Leftover != null
      ? num(input.carryPhase1Leftover)
      : phase1.leftoverIfPassed;

  // Phase 2 recovery target: Deficit-Based Recovery
  // Recovers Prop Fee + ALL exhausted fuel (planned burn + martingale slippage)
  // trueDeficit = fee + exnessBurnIfPassed + (bufferedCapital - currentBalance)
  const actualExnessBalance = input.actualExnessBalance != null && input.actualExnessBalance > 0
    ? num(input.actualExnessBalance)
    : phase1.bufferedExnessCapital; // fallback: assume no extra exhaustion
  const totalExhaustedFuel = phase1.exnessBurnIfPassed + (phase1.bufferedExnessCapital - actualExnessBalance);
  const trueDeficit = fee + totalExhaustedFuel;
  const phase2 = buildChain(trueDeficit + desiredProfit, lossesToBlow, winsToPass, bufferPct, rr);
  const phase2RefillRequired = phase2.bufferedExnessCapital - phase1Leftover;

  const active = input.phase === 1 ? phase1 : phase2;
  const totalRequiredCapital =
    input.phase === 1 ? phase1TotalSpent : phase1TotalSpent + phase2RefillRequired;

  const capitalBreakdown =
    input.phase === 1
      ? [
          { label: "Prop challenge fee", value: fee },
          { label: `Exness fuel (R:R 1:${rr})`, value: phase1.pureExnessCapital },
          { label: `Safety buffer (${bufferPct}%)`, value: phase1.bufferedExnessCapital - phase1.pureExnessCapital },
          { label: "Total capital needed", value: totalRequiredCapital },
        ]
      : [
          { label: "Phase 1 total already spent", value: phase1TotalSpent },
          { label: "Phase 1 leftover Exness balance", value: -phase1Leftover },
          { label: `Phase 2 Exness fuel (R:R 1:${rr})`, value: phase2.pureExnessCapital },
          { label: `Safety buffer (${bufferPct}%)`, value: phase2.bufferedExnessCapital - phase2.pureExnessCapital },
          { label: "Total capital needed", value: totalRequiredCapital },
        ];

  // ---- Live trade geometry (selected R:R) ----
  const propSlPips = slPips;
  const propTpPips = slPips * rr;
  const exnessSlPips = propTpPips;
  const exnessTpPips = propSlPips;

  // Exact for USD-quote pairs (EURUSD, GBPUSD) regardless of rate; for
  // USD-base pairs (USDJPY) derived from the live entry price instead of a
  // static approximation that drifts as the real rate moves — see pairs.ts.
  const pipValue = livePipValue(input.pair, entryPrice);
  const exnessPipValue = input.exnessAccountType === "Cent" ? pipValue / 100 : pipValue;

  const propLots = effectivePropRisk / (propSlPips * pipValue);
  const effectiveWinTarget =
    input.exnessWinTargetOverride != null && input.exnessWinTargetOverride > 0
      ? input.exnessWinTargetOverride
      : active.exnessWinTarget;
  const exnessLots = effectiveWinTarget / (exnessTpPips * exnessPipValue);

  // When a recovery override is active, recalculate the capital figures using
  // the effective win target so that "Total Capital Needed" and "Exness risk"
  // update correctly when R:R or any other input changes — the override must
  // propagate through the ENTIRE result, not just lot sizing.
  const effectiveLossTarget = effectiveWinTarget * rr;
  const effectivePureCapital = effectiveLossTarget * winsToPass;
  const effectiveBufferedCapital = effectivePureCapital * (1 + bufferPct / 100);

  // Override only applies when the recovery system is actually active.
  const overrideActive =
    input.exnessWinTargetOverride != null && input.exnessWinTargetOverride > 0;

  const activeExnessWinTarget  = overrideActive ? effectiveWinTarget    : active.exnessWinTarget;
  const activeExnessLossTarget = overrideActive ? effectiveLossTarget   : active.exnessLossTarget;
  const activeRequiredCapital  = overrideActive ? effectiveBufferedCapital : active.bufferedExnessCapital;

  // Rebuild totalRequiredCapital with the effective capital when override is on.
  const effectiveTotalRequired = overrideActive
    ? (input.phase === 1
        ? fee + effectiveBufferedCapital
        : phase1TotalSpent + (effectiveBufferedCapital - phase1Leftover))
    : totalRequiredCapital;

  const slDistance = propSlPips * spec.pipSize;
  const tpDistance = propTpPips * spec.pipSize;
  const long = input.direction === "LONG";
  const propSl = roundPrice(long ? entryPrice - slDistance : entryPrice + slDistance, spec.decimals);
  const propTp = roundPrice(long ? entryPrice + tpDistance : entryPrice - tpDistance, spec.decimals);
  const exnessSl = roundPrice(long ? entryPrice + tpDistance : entryPrice - tpDistance, spec.decimals);
  const exnessTp = roundPrice(long ? entryPrice - slDistance : entryPrice + slDistance, spec.decimals);

  // ---- Final P&L (fee + phase 1 burn always accounted for via totalRequiredCapital) ----
  const propPayout = targetUsd * (num(account.splitPct) / 100);
  const leftoverExnessBalance = phase2.bufferedExnessCapital - phase2.exnessBurnIfPassed;
  const netProfitIfPassed = propPayout + leftoverExnessBalance - (phase1TotalSpent + phase2RefillRequired);

  let verdict: EngineResult["verdict"];
  if (account.ddType === "Trailing") {
    verdict = {
      level: "red",
      title: "Strategy Broken: Trailing Drawdown",
      detail:
        "The loss floor trails open profit, so the inverted mirror cannot guarantee recovery. Do not trade this account.",
    };
  } else if (netProfitIfPassed < 20) {
    verdict = {
      level: "red",
      title: "Not Profitable: Payout too small for Exness fuel",
      detail: `Net profit if passed is only $${netProfitIfPassed.toFixed(2)}, below the $20 floor.`,
    };
  } else {
    verdict = {
      level: "green",
      title: "Highly Profitable: Safe to trade",
      detail: `Estimated net profit $${netProfitIfPassed.toFixed(2)} after fee, Exness fuel and Phase 1 burn.`,
    };
  }

  return {
    targetUsd,
    maxDdUsd,
    propFee: fee,
    propWinPerTrade: effectivePropWinPerTrade,
    lossesToBlow,
    winsToPass,
    rr,
    pipValue,
    exnessPipValue,
    pipSize: spec.pipSize,
    decimals: spec.decimals,
    propSlPips,
    propTpPips,
    exnessSlPips,
    exnessTpPips,
    propDirection: input.direction,
    exnessDirection: long ? "SHORT" : "LONG",
    entryPrice: roundPrice(entryPrice, spec.decimals),
    propSl,
    propTp,
    exnessSl,
    exnessTp,
    propLots,
    exnessLots,
    cappedPropRisk: effectivePropRisk,
    riskCapped,
    phase1,
    phase2,
    phase1TotalSpent,
    phase1Leftover,
    phase2RefillRequired,
    phase: input.phase,
    exnessWinTarget: activeExnessWinTarget,
    exnessLossTarget: activeExnessLossTarget,
    requiredExnessCapital: activeRequiredCapital,
    totalRequiredCapital: effectiveTotalRequired,
    actualExnessBalance: input.actualExnessBalance ?? active.bufferedExnessCapital,
    bufferPct,
    capitalBreakdown: overrideActive
      ? (input.phase === 1
          ? [
              { label: "Prop challenge fee", value: fee },
              { label: `Exness fuel — adjusted (R:R 1:${rr})`, value: effectivePureCapital },
              { label: `Safety buffer (${bufferPct}%)`, value: effectiveBufferedCapital - effectivePureCapital },
              { label: "Total capital needed (adjusted)", value: effectiveTotalRequired },
            ]
          : [
              { label: "Phase 1 total already spent", value: phase1TotalSpent },
              { label: "Phase 1 leftover Exness balance", value: -phase1Leftover },
              { label: `Phase 2 Exness fuel — adjusted (R:R 1:${rr})`, value: effectivePureCapital },
              { label: `Safety buffer (${bufferPct}%)`, value: effectiveBufferedCapital - effectivePureCapital },
              { label: "Total capital needed (adjusted)", value: effectiveTotalRequired },
            ])
      : capitalBreakdown,
    propPayout,
    leftoverExnessBalance,
    netProfitIfPassed,
    verdict,
  };
}

/** Journal P&L derived from the live engine state. */
export function tradePnl(result: EngineResult, propWon: boolean, rr: number) {
  const propPnl = propWon ? result.propWinPerTrade : -(result.propWinPerTrade / rr);
  const exPnl = propWon ? -(result.exnessWinTarget * rr) : result.exnessWinTarget;
  return { propPnl, exPnl, netPnl: propPnl + exPnl };
}

/** MT5 pending order type from the mirrored direction versus the live market price. */
export function pendingOrderType(
  direction: Direction,
  entryPrice: number,
  livePrice: number,
): "ORDER_TYPE_BUY_LIMIT" | "ORDER_TYPE_BUY_STOP" | "ORDER_TYPE_SELL_LIMIT" | "ORDER_TYPE_SELL_STOP" {
  if (direction === "LONG") {
    return entryPrice < livePrice ? "ORDER_TYPE_BUY_LIMIT" : "ORDER_TYPE_BUY_STOP";
  }
  return entryPrice > livePrice ? "ORDER_TYPE_SELL_LIMIT" : "ORDER_TYPE_SELL_STOP";
}

export const money = (v: number, sign = false): string => {
  const n = Number.isFinite(v) ? v : 0;
  const s = `$${Math.abs(n).toFixed(2)}`;
  if (n < 0) return `-${s}`;
  return sign ? `+${s}` : s;
};
