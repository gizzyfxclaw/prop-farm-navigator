import { livePipValue, pairSpec, roundPrice, type PairSymbol } from "./pairs";

/**
 * GizzyFx mathematical engine.
 *
 * Shield capital is sized for the WORST-CASE R:R of 1:2, regardless of the
 * R:R the user selected (audit §5.1). The capital only covers the trade if
 * every trade uses exactly the selected R:R when it is sized for that R:R —
 * e.g. at 1:1.5 the engine funded $34.32, but trading those legs at 1:2
 * burns $9.53 per prop win and needs $38.13 to pass. Sizing the shield at
 * 1:2 (3 wins to pass on the $5k preset) funds $28.60 pure / $34.32 buffered
 * for ANY consistent R:R, because wins-to-pass falls as R:R rises.
 *
 * Live trade sizing (lots, SL/TP prices, prop win/loss per trade) still uses
 * the R:R actually selected.
 */
export const MAX_RR = 3;
/** R:R the shield capital is sized for, regardless of selection. */
export const WORST_CASE_RR = 2;

export type DrawdownType = "Static" | "Trailing";
export type Direction = "LONG" | "SHORT";
export type ExnessAccountType = "Standard" | "Cent";
export type CalculationMode = "pips" | "price";

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
  /** Calculation mode: 'pips' (SL pips & R:R) or 'price' (entry price, stop price, tp price). Default 'pips'. */
  calcMode?: CalculationMode;
  /** Prop Stop loss price when calcMode is 'price'. */
  stopPrice?: number | null;
  /** Prop Take profit price when calcMode is 'price'. */
  tpPrice?: number | null;
  /** Actual Exness account balance (user-entered, overrides calculated) */
  actualExnessBalance?: number | null;
  /** Actual Exness losses from journal (sum of absolute Exness P&L). */
  actualExnessLosses?: number | null;
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
  account: PropAccount;
  targetUsd: number;
  maxDdUsd: number;
  /** Challenge fee paid upfront (real cash). */
  propFee: number;
  propWinPerTrade: number;
  lossesToBlow: number;
  winsToPass: number;
  /** Selected or calculated R:R multiplier. */
  rr: number;

  // calculation mode & price inputs
  calcMode: CalculationMode;
  stopPrice: number;
  tpPrice: number;

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
  /** Lots before the 2-decimal broker rounding (for transparency). */
  propLotsUnrounded: number;
  exnessLotsUnrounded: number;
  /** Warning when 2-decimal rounding loses >5% of an intended leg, or null. */
  lotRoundingWarning: string | null;
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
  trueDeficit: number;

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
  const calcMode: CalculationMode = input.calcMode === "price" ? "price" : "pips";

  const size = Math.max(0, num(account.size));
  const fee = Math.max(0, num(account.fee));
  const bufferPct = Math.max(0, num(input.bufferPct));
  const desiredProfit = Math.max(0, num(input.desiredProfit));
  const entryPrice = num(input.entryPrice);
  const long = input.direction === "LONG";

  let slPips: number;
  let rr: number;
  let propSl: number;
  let propTp: number;

  if (calcMode === "price" && input.stopPrice != null && num(input.stopPrice) > 0) {
    const rawStopPrice = num(input.stopPrice);
    const slDist = Math.abs(entryPrice - rawStopPrice);
    const rawSlPips = slDist / spec.pipSize;

    // If stop price is stale or absurdly far away (> 120 pips), fallback to input.slPips (e.g. 30 pips)
    if (rawSlPips > 120 || rawSlPips < 1) {
      slPips = Math.min(100, Math.max(5, num(input.slPips, 30)));
      rr = Math.min(MAX_RR, Math.max(1.0, num(input.rr, 2)));
      const slDistance = slPips * spec.pipSize;
      const tpDistance = slPips * rr * spec.pipSize;
      propSl = roundPrice(long ? entryPrice - slDistance : entryPrice + slDistance, spec.decimals);
      propTp = roundPrice(long ? entryPrice + tpDistance : entryPrice - tpDistance, spec.decimals);
    } else {
      slPips = Math.min(100, Math.max(5, roundPrice(rawSlPips, 1)));
      let rawTpPrice: number;
      if (input.tpPrice != null && num(input.tpPrice) > 0) {
        rawTpPrice = num(input.tpPrice);
        const tpDist = Math.abs(rawTpPrice - entryPrice);
        const rawTpPips = tpDist / spec.pipSize;
        if (rawTpPips > 250 || rawTpPips < 1) {
          rr = Math.min(MAX_RR, Math.max(1.0, num(input.rr, 2)));
          rawTpPrice = long ? entryPrice + slPips * rr * spec.pipSize : entryPrice - slPips * rr * spec.pipSize;
        } else {
          const calculatedRR = rawTpPips / slPips;
          rr = Math.min(MAX_RR, Math.max(1.0, roundPrice(calculatedRR, 2)));
        }
      } else {
        rr = Math.min(MAX_RR, Math.max(1.0, num(input.rr, 2)));
        rawTpPrice = long ? entryPrice + slPips * rr * spec.pipSize : entryPrice - slPips * rr * spec.pipSize;
      }
      propSl = roundPrice(rawStopPrice, spec.decimals);
      propTp = roundPrice(rawTpPrice, spec.decimals);
    }
  } else {
    slPips = Math.min(100, Math.max(5, num(input.slPips, 30)));
    rr = Math.min(MAX_RR, Math.max(1.0, num(input.rr, 2)));

    const slDistance = slPips * spec.pipSize;
    const tpDistance = slPips * rr * spec.pipSize;

    propSl = roundPrice(long ? entryPrice - slDistance : entryPrice + slDistance, spec.decimals);
    propTp = roundPrice(long ? entryPrice + tpDistance : entryPrice - tpDistance, spec.decimals);
  }

  const propSlPips = roundPrice(slPips, 1);
  const propTpPips = roundPrice(slPips * rr, 1);
  const exnessSlPips = propTpPips;
  const exnessTpPips = propSlPips;

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
  // These describe the trade at the SELECTED R:R (live sizing, wins to pass).
  const lossesToBlow = Math.max(1, Math.floor(maxDdUsd / effectivePropRisk) || 1);
  const winsToPass = Math.max(1, Math.ceil(targetUsd / effectivePropWinPerTrade) || 1);

  // ---- Escalating shield (sized for WORST-CASE R:R 1:2, audit §5.1) ----
  // Shield losses/wins are computed at WORST_CASE_RR with the risk the
  // daily cap would allow at that R:R, so the funded capital covers any
  // consistent R:R the user actually trades at.
  const shieldRisk =
    dailyCap > 0 && propRiskUsd * WORST_CASE_RR > dailyCap
      ? Math.floor((dailyCap / WORST_CASE_RR) * 100) / 100
      : propRiskUsd;
  const shieldLossesToBlow = Math.max(1, Math.floor(maxDdUsd / Math.max(0.01, shieldRisk)) || 1);
  const shieldWinsToPass = Math.max(1, Math.ceil(targetUsd / (Math.max(0.01, shieldRisk) * WORST_CASE_RR)) || 1);
  const phase1 = buildChain(fee + desiredProfit, shieldLossesToBlow, shieldWinsToPass, bufferPct, WORST_CASE_RR);
  // Phase 2 recovery target: Deficit-Based Recovery
  // Recovers Prop Fee + ALL exhausted fuel (planned burn + martingale slippage)
  // trueDeficit = fee + actualExnessLosses (from journal)
  const actualExnessBalance = input.actualExnessBalance != null && input.actualExnessBalance > 0
    ? num(input.actualExnessBalance)
    : phase1.bufferedExnessCapital;
  const actualExnessLosses = input.actualExnessLosses != null && input.actualExnessLosses > 0
    ? num(input.actualExnessLosses)
    : phase1.exnessBurnIfPassed; // fallback: assume planned burn
  const totalExhaustedFuel = Math.max(0, actualExnessLosses);
  const trueDeficit = Math.max(0, fee + totalExhaustedFuel);
  const phase2 = buildChain(trueDeficit + desiredProfit, shieldLossesToBlow, shieldWinsToPass, bufferPct, WORST_CASE_RR);
  const phase1TotalSpent =
    input.phase === 2 && input.carryPhase1TotalSpent != null && input.carryPhase1TotalSpent > 0
      ? num(input.carryPhase1TotalSpent)
      : fee + phase1.bufferedExnessCapital;
  const phase1Leftover =
    input.phase === 2 && input.carryPhase1Leftover != null
      ? num(input.carryPhase1Leftover)
      : phase1.leftoverIfPassed;

  const phase2RefillRequired = phase2.bufferedExnessCapital - phase1Leftover;

  const active = input.phase === 1 ? phase1 : phase2;
  const totalRequiredCapital =
    input.phase === 1 ? phase1TotalSpent : phase1TotalSpent + phase2RefillRequired;

  const capitalBreakdown =
    input.phase === 1
      ? [
          { label: "Prop challenge fee", value: fee },
          { label: `Exness fuel (worst-case R:R 1:2)`, value: phase1.pureExnessCapital },
          { label: `Safety buffer (${bufferPct}%)`, value: phase1.bufferedExnessCapital - phase1.pureExnessCapital },
          { label: "Total capital needed", value: totalRequiredCapital },
        ]
      : [
          { label: "Phase 1 total already spent", value: phase1TotalSpent },
          { label: "Phase 1 leftover Exness balance", value: -phase1Leftover },
          { label: `Phase 2 Exness fuel (worst-case R:R 1:2)`, value: phase2.pureExnessCapital },
          { label: `Safety buffer (${bufferPct}%)`, value: phase2.bufferedExnessCapital - phase2.pureExnessCapital },
          { label: "Total capital needed", value: totalRequiredCapital },
        ];

  // ---- Live trade geometry (selected R:R) ----
  // Exact for USD-quote pairs (EURUSD, GBPUSD) regardless of rate; for
  // USD-base pairs (USDJPY) derived from the live entry price instead of a
  // static approximation that drifts as the real rate moves — see pairs.ts.
  const pipValue = livePipValue(input.pair, entryPrice);
  const exnessPipValue = input.exnessAccountType === "Cent" ? pipValue / 100 : pipValue;

  const propLotsUnrounded = effectivePropRisk / (propSlPips * pipValue);
  const effectiveWinTarget =
    input.exnessWinTargetOverride != null && input.exnessWinTargetOverride > 0
      ? input.exnessWinTargetOverride
      : active.exnessWinTarget;
  const exnessLotsUnrounded = effectiveWinTarget / (exnessTpPips * exnessPipValue);

  // ---- Lot rounding (audit §5.12) ----
  // Lots are rounded to the broker's 2-decimal step HERE, inside calculate(),
  // so the sizing the engine reports is the sizing that will actually be
  // placed — rounding down 0.014 → 0.01 used to silently lose ~29% of a leg,
  // which then showed up as fake "slippage" in recovery.
  const roundLot = (v: number) => Math.round(v * 100) / 100;
  const propLots = roundLot(propLotsUnrounded);
  const exnessLots = roundLot(exnessLotsUnrounded);
  const roundingLossPct = (unrounded: number, rounded: number) =>
    unrounded > 0 ? (unrounded - rounded) / unrounded : 0;
  const worstRoundingLoss = Math.max(
    roundingLossPct(propLotsUnrounded, propLots),
    roundingLossPct(exnessLotsUnrounded, exnessLots),
  );
  const lotRoundingWarning =
    worstRoundingLoss > 0.05
      ? `Lot rounding loses ${(worstRoundingLoss * 100).toFixed(0)}% of an intended leg (e.g. ${propLotsUnrounded.toFixed(4)} → ${propLots.toFixed(2)} lots). The rounded size is what will be placed; recovery will see the smaller leg, not slippage.`
      : null;

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
  // The loss on a prop win is at the SELECTED R:R, not the shield R:R —
  // the shield chain (1:2) only sizes the capital, it does not change what
  // a trade at the selected R:R actually risks.
  const activeExnessLossTarget = activeExnessWinTarget * rr;
  const activeRequiredCapital  = overrideActive ? effectiveBufferedCapital : active.bufferedExnessCapital;

  // Rebuild totalRequiredCapital with the effective capital when override is on.
  const effectiveTotalRequired = overrideActive
    ? (input.phase === 1
        ? fee + effectiveBufferedCapital
        : phase1TotalSpent + (effectiveBufferedCapital - phase1Leftover))
    : totalRequiredCapital;

  const exnessSl = propTp;
  const exnessTp = propSl;

  // ---- Final P&L (respects current phase) ----
  const propPayout = targetUsd * (num(account.splitPct) / 100);
  // Phase 1: use Phase 1 leftover, don't deduct Phase 2 refill
  // Phase 2: use Phase 2 leftover, deduct Phase 2 refill
  const leftoverExnessBalance = input.phase === 1
    ? phase1.leftoverIfPassed
    : phase2.bufferedExnessCapital - phase2.exnessBurnIfPassed;
  const netProfitIfPassed = input.phase === 1
    ? propPayout + phase1.leftoverIfPassed - phase1TotalSpent
    : propPayout + leftoverExnessBalance - (phase1TotalSpent + phase2RefillRequired);

  let verdict: EngineResult["verdict"];
  if (account.ddType === "Trailing") {
    verdict = {
      level: "red",
      title: "Strategy Broken: Trailing Drawdown",
      detail:
        "The loss floor trails open profit, so the inverted mirror cannot guarantee recovery. Do not trade this account.",
    };
  } else if (propLots < 0.01 || exnessLots < 0.01) {
    verdict = {
      level: "red",
      title: "Lot Size Below Broker Minimum",
      detail:
        `A leg rounds below the 0.01 broker minimum (prop ${propLots.toFixed(2)}, Exness ${exnessLots.toFixed(2)}). Increase the recovery target or the prop risk.`,
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
    account,
    targetUsd,
    maxDdUsd,
    propFee: fee,
    propWinPerTrade: effectivePropWinPerTrade,
    lossesToBlow,
    winsToPass,
    rr,
    calcMode,
    stopPrice: propSl,
    tpPrice: propTp,
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
    propLotsUnrounded,
    exnessLotsUnrounded,
    lotRoundingWarning,
    cappedPropRisk: effectivePropRisk,
    riskCapped,
    phase1,
    phase2,
    phase1TotalSpent,
    phase1Leftover,
    phase2RefillRequired,
    trueDeficit,
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
              { label: `Exness fuel — adjusted (worst-case R:R 1:2)`, value: effectivePureCapital },
              { label: `Safety buffer (${bufferPct}%)`, value: effectiveBufferedCapital - effectivePureCapital },
              { label: "Total capital needed (adjusted)", value: effectiveTotalRequired },
            ]
          : [
              { label: "Phase 1 total already spent", value: phase1TotalSpent },
              { label: "Phase 1 leftover Exness balance", value: -phase1Leftover },
              { label: `Phase 2 Exness fuel — adjusted (worst-case R:R 1:2)`, value: effectivePureCapital },
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
