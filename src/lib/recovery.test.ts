import { describe, expect, it } from "vitest";
import { calculate, WORST_CASE_RR, type EngineInputs, type PropAccount } from "./engine/calc";
import { computeRecovery } from "./recovery";
import type { JournalTrade } from "./store";

const account: PropAccount = {
  id: "a1",
  firm: "Test Firm",
  size: 5000,
  fee: 28.6,
  targetPct: 6,
  ddPct: 6,
  ddType: "Static",
  splitPct: 80,
};

const base: EngineInputs = {
  account,
  phase: 1,
  propRiskUsd: 50,
  rr: 2,
  slPips: 30,
  desiredProfit: 0,
  bufferPct: 20,
  pair: "EURUSD",
  direction: "LONG",
  entryPrice: 1.085,
  exnessAccountType: "Cent",
};

function trade(
  id: string,
  result: "WIN" | "LOSS",
  propPnl: number,
  exPnl: number,
  rr = 2,
): JournalTrade {
  return {
    id,
    date: "2026-09-01",
    time: "00:00:00",
    pair: "EURUSD",
    dir: "LONG",
    result,
    propPnl,
    exPnl,
    netPnl: propPnl + exPnl,
    details: { entry: 1.085, propSl: 1.082, propTp: 1.091, exSl: 1.091, exTp: 1.082, propLots: 0.17, exLots: 1.59, rr, phase: 1 },
  };
}

describe("Targeted Slippage Martingale (TSM)", () => {
  it("clean journal: no debt, target stays at base, fuel matches engine", () => {
    const r = calculate(base);
    const journal = [
      trade("1", "LOSS", -50, r.exnessWinTarget),
      trade("2", "LOSS", -50, r.exnessWinTarget),
      trade("3", "LOSS", -50, r.exnessWinTarget),
    ];
    const rec = computeRecovery(r, journal);

    expect(rec.slippageDebt).toBe(0);
    expect(rec.totalSlippageAccrued).toBe(0);
    expect(rec.adjustmentNeeded).toBe(false);
    expect(rec.newExnessWinTarget).toBeCloseTo(r.exnessWinTarget, 6);
    expect(rec.dynamicExnessCapital).toBeCloseTo(r.requiredExnessCapital, 6);
  });

  it("prop WIN slip: 7.89 instead of 7.15 → debt $0.74, next target bumps to 5.51", () => {
    const r = calculate({ ...base, rr: 1.5 });
    // expected exness loss on a prop win = exnessWinTarget * 1.5 = 4.7667 * 1.5 = 7.15
    const burned = (28.6 / 6) * 1.5 + 0.74; // 7.89
    const journal = [trade("1", "WIN", r.propWinPerTrade, -burned, 1.5)];
    const rec = computeRecovery(r, journal);

    expect(rec.slippageDebt).toBeCloseTo(0.74, 4);
    expect(rec.totalSlippageAccrued).toBeCloseTo(0.74, 4);
    expect(rec.adjustmentNeeded).toBe(true);
    // base = 4.7667, debt = 0.74, next target = 5.5067
    expect(rec.newExnessWinTarget).toBeCloseTo(4.7667 + 0.74, 4);
    expect(rec.newExnessLossTarget).toBeCloseTo((4.7667 + 0.74) * WORST_CASE_RR, 3);
  });

  it("prop LOSS slip: actual exness win less than expected → debt grows by the gap", () => {
    const r = calculate(base);
    const expected = r.exnessWinTarget; // 4.7667
    const actual = expected - 0.55;     // $0.55 short of the expected win
    const journal = [trade("1", "LOSS", -50, actual)];
    const rec = computeRecovery(r, journal);

    expect(rec.slippageDebt).toBeCloseTo(0.55, 4);
    expect(rec.newExnessWinTarget).toBeCloseTo(expected + 0.55, 4);
  });

  it("THE KEY: Exness win after debt wipes debt entirely; next target reverts to base", () => {
    const r = calculate({ ...base, rr: 1.5 });
    // Build debt via a slipped prop WIN.
    const burned = (28.6 / 6) * 1.5 + 0.74;
    // Then a prop LOSS where exness wins MORE than the (now bumped) target,
    // which is still a valid Exness-win scenario and must wipe the debt.
    const journal = [
      trade("1", "WIN", r.propWinPerTrade, -burned, 1.5),     // debt = 0.74
      trade("2", "LOSS", -50, rec5_51_target(r) + 0.20, 1.5), // exness wins $5.71 vs expected $5.51 → wipes debt
    ];
    const rec = computeRecovery(r, journal);

    expect(rec.slippageDebt).toBe(0);                                   // WIPED
    expect(rec.totalSlippageAccrued).toBeCloseTo(0.74, 4);              // history retained
    expect(rec.adjustmentNeeded).toBe(false);
    expect(rec.newExnessWinTarget).toBeCloseTo(r.exnessWinTarget, 6);  // back to base 4.7667
  });

  it("Exness win underperforms expected → debt grows by the gap (positive number)", () => {
    const r = calculate(base);
    const expected = r.exnessWinTarget;
    const actual = expected - 0.30;
    const journal = [trade("1", "LOSS", -50, actual)];
    const rec = computeRecovery(r, journal);
    expect(rec.slippageDebt).toBeCloseTo(0.30, 4);
  });

  it("Consecutive prop WIN slips stack: $0.74 + $1.20 = $1.94 debt", () => {
    const r = calculate({ ...base, rr: 1.5 });
    const expectedLoss = (28.6 / 6) * 1.5; // 7.15
    const journal = [
      trade("1", "WIN", r.propWinPerTrade, -(expectedLoss + 0.74), 1.5), // +0.74
      trade("2", "WIN", r.propWinPerTrade, -(expectedLoss + 1.20), 1.5), // +1.20
    ];
    const rec = computeRecovery(r, journal);
    expect(rec.slippageDebt).toBeCloseTo(0.74 + 1.20, 4); // stacks, no amortize
    expect(rec.totalSlippageAccrued).toBeCloseTo(1.94, 4);
  });

  it("Exness win with NO outstanding debt: noop, target stays at base", () => {
    const r = calculate(base);
    const journal = [trade("1", "LOSS", -50, r.exnessWinTarget)];
    const rec = computeRecovery(r, journal);
    expect(rec.slippageDebt).toBe(0);
    expect(rec.adjustmentNeeded).toBe(false);
    expect(rec.newExnessWinTarget).toBeCloseTo(r.exnessWinTarget, 6);
  });

  it("Exness wins ABOVE expected: debt wipes (no negative debt, no reward)", () => {
    const r = calculate(base);
    const expected = r.exnessWinTarget;
    const actual = expected + 0.50; // overperformed
    const journal = [trade("1", "LOSS", -50, actual)];
    const rec = computeRecovery(r, journal);
    expect(rec.slippageDebt).toBe(0);
    // Overperformance is not a "credit" — the system never drops below base.
    expect(rec.newExnessWinTarget).toBeCloseTo(r.exnessWinTarget, 6);
  });

  it("Dynamic Exness fuel rises with debt: pure × losses × (1 + bufferPct/100)", () => {
    const r = calculate({ ...base, rr: 1.5, bufferPct: 20 });
    const burned = (28.6 / 6) * 1.5 + 2.00; // $2.00 debt
    const journal = [trade("1", "WIN", r.propWinPerTrade, -burned, 1.5)];
    const rec = computeRecovery(r, journal);
    const expectedDynamic = (r.exnessWinTarget + 2.00) * WORST_CASE_RR * r.winsToPass * 1.20;
    expect(rec.dynamicExnessCapital).toBeCloseTo(expectedDynamic, 4);
    expect(rec.dynamicExnessCapital).toBeGreaterThan(r.requiredExnessCapital);
  });

  it("Recovery dynamic capital MATCHES engine override re-run (consistency invariant)", () => {
    // Critical: when useEngine re-runs with exnessWinTargetOverride, the engine
    // itself recomputes the buffered capital. The recovery layer's dynamic
    // figure must match it to the cent — otherwise the Engine page would show
    // two different "Total Capital Needed" numbers and the user would lose trust.
    const r = calculate({ ...base, rr: 1.5, bufferPct: 20 });
    const burned = (28.6 / 6) * 1.5 + 0.74; // $0.74 debt
    const journal = [trade("1", "WIN", r.propWinPerTrade, -burned, 1.5)];
    const rec = computeRecovery(r, journal);

    // Engine re-run with override
    const bumped = calculate({ ...base, rr: 1.5, bufferPct: 20, exnessWinTargetOverride: rec.newExnessWinTarget });
    // Sanity: the engine's own re-run produces the same buffered capital as the
    // recovery's dynamicExnessCapital (it should — both use the same formula).
    expect(rec.dynamicExnessCapital).toBeCloseTo(bumped.requiredExnessCapital, 4);
    expect(bumped.totalRequiredCapital).toBeGreaterThan(r.totalRequiredCapital);
  });

  it("Lot size scales with martingale bump: engine re-run produces larger Exness lots", () => {
    const r = calculate({ ...base, rr: 1.5 });
    const burned = (28.6 / 6) * 1.5 + 0.74;
    const journal = [trade("1", "WIN", r.propWinPerTrade, -burned, 1.5)];
    const rec = computeRecovery(r, journal);

    const bumped = calculate({ ...base, rr: 1.5, exnessWinTargetOverride: rec.newExnessWinTarget });
    // Lot scaling = (baseWin + debt) / baseWin = nextWinTarget / baseWin.
    const expectedScale = rec.newExnessWinTarget / r.exnessWinTarget;
    expect(bumped.exnessLots / r.exnessLots).toBeCloseTo(expectedScale, 4);
    expect(bumped.exnessLots).toBeGreaterThan(r.exnessLots);
    // Prop lot is unaffected — the TSM bumps only the Exness side.
    expect(bumped.propLots).toBeCloseTo(r.propLots, 6);
  });

  it("Phase 2: target = (phase1TotalSpent + desiredProfit) / lossesToBlow — engine layer, not recovery", () => {
    const r = calculate({ ...base, phase: 2 });
    // Engine layer: with WORST_CASE_RR=3, phase1TotalSpent = 28.6 + (4.7667×3×3×1.20) = 80.08.
    // P2 base = 80.08/6 = 13.3467.
    // Recovery just consumes the engine's active phase base; no debt to apply on an
    // empty journal.
    expect(r.exnessWinTarget).toBeCloseTo(80.08 / 6, 4);
    const journal: JournalTrade[] = [];
    const rec = computeRecovery(r, journal);
    expect(rec.phase).toBe(2);
    expect(rec.slippageDebt).toBe(0);
    expect(rec.newExnessWinTarget).toBeCloseTo(80.08 / 6, 4);
  });

  it("Recovery closes: after 3 clean prop wins at 1:2 R:R, no debt, fuel exhausted = pure capital", () => {
    const r = calculate(base);
    const win = r.exnessWinTarget;       // 4.7667
    const exLoss = win * 2;               // 9.5333
    const journal = [
      trade("1", "WIN", r.propWinPerTrade, -exLoss),
      trade("2", "WIN", r.propWinPerTrade, -exLoss),
      trade("3", "WIN", r.propWinPerTrade, -exLoss),
    ];
    const rec = computeRecovery(r, journal);
    expect(rec.slippageDebt).toBe(0);
    expect(rec.exnessFuelExhausted).toBeCloseTo(28.6, 6);
    expect(rec.totalMoneyLost).toBeCloseTo(28.6 + 28.6, 6);
  });
});

// helper for the key wipe-on-Exness-win test
function rec5_51_target(r: ReturnType<typeof calculate>) {
  return r.exnessWinTarget + 0.74;
}
