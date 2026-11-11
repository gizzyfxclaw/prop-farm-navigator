import { describe, expect, it } from "vitest";
import { calculate, type EngineInputs, type PropAccount } from "./engine/calc";
import { computeRecovery, localToday } from "./recovery";
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
  baseExnessWinTarget?: number,
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
    details: {
      entry: 1.085, propSl: 1.082, propTp: 1.091, exSl: 1.091, exTp: 1.082,
      propLots: 0.17, exLots: 1.59, rr, phase: 1,
      baseExnessWinTarget: baseExnessWinTarget ?? (28.6 / 6),
      propRiskAtLog: 50,
    },
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
    expect(rec.newExnessLossTarget).toBeCloseTo((4.7667 + 0.74) * 1.5, 3);
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

  it("Consecutive prop WIN slips: debt = first slip + excess over the BUMPED loss target (audit §5.11)", () => {
    const r = calculate({ ...base, rr: 1.5 });
    const expectedLoss = (28.6 / 6) * 1.5; // 7.15
    const journal = [
      trade("1", "WIN", r.propWinPerTrade, -(expectedLoss + 0.74), 1.5), // +0.74 debt
      // Trade 2 was placed with the martingale bump, so its Exness loss
      // target is (4.7667 + 0.74) × 1.5 = 8.26, not the base 7.15.
      // Actual 8.35 exceeds it by only 0.09 — that is the NEW slip.
      // The old 0.74 is still owed (nothing recovered it), so debt = 0.83.
      // Adding 1.20 again would double-count the debt already in the bump.
      trade("2", "WIN", r.propWinPerTrade, -(expectedLoss + 1.20), 1.5),
    ];
    const rec = computeRecovery(r, journal);
    expect(rec.slippageDebt).toBeCloseTo(0.74 + 0.09, 4);
    expect(rec.totalSlippageAccrued).toBeCloseTo(0.83, 4);
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
    const expectedDynamic = (r.exnessWinTarget + 2.00) * 1.5 * r.winsToPass * 1.20;
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
    // Compare UNROUNDED lots for the exact ratio — rounded lots (2dp) can
    // shift the ratio by ~0.002 (audit §5.12 rounding).
    const expectedScale = rec.newExnessWinTarget / r.exnessWinTarget;
    expect(bumped.exnessLotsUnrounded / r.exnessLotsUnrounded).toBeCloseTo(expectedScale, 4);
    expect(bumped.exnessLots).toBeGreaterThan(r.exnessLots);
    // Prop lot is unaffected — the TSM bumps only the Exness side.
    expect(bumped.propLots).toBeCloseTo(r.propLots, 6);
  });

  it("Phase 2: target = (actualCapitalBurnedP1 + desiredProfit) / lossesToBlow — engine layer, not recovery", () => {
    const r = calculate({ ...base, phase: 2 });
    // Engine layer: actualCapitalBurnedP1 = fee + exnessBurnIfPassed = 28.6 + 28.6 = 57.2.
    // P2 base = 57.2/6 = 9.5333 (NOT 62.92/6 which includes the buffer).
    expect(r.exnessWinTarget).toBeCloseTo(57.2 / 6, 4);
    const journal: JournalTrade[] = [];
    const rec = computeRecovery(r, journal);
    expect(rec.phase).toBe(2);
    expect(rec.slippageDebt).toBe(0);
    expect(rec.newExnessWinTarget).toBeCloseTo(57.2 / 6, 4);
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
    // realMoneyNet = actualExnessPnl − propFee = −28.6 − 28.6 = −57.2
    expect(rec.realMoneyNet).toBeCloseTo(-57.2, 6);
  });

  it("recoveryShortfall uses NET retained, not gross wins (fixes overclaim bug)", () => {
    const r = calculate(base);
    const win = r.exnessWinTarget;       // ~4.7667
    const exLoss = win * 2;              // ~9.5333
    // 3 losses (Exness wins $14.30) + 3 wins (Exness loses $28.60) → net = -$14.30
    const journal = [
      trade("1", "LOSS", -50, win),
      trade("2", "LOSS", -50, win),
      trade("3", "LOSS", -50, win),
      trade("4", "WIN", r.propWinPerTrade, -exLoss),
      trade("5", "WIN", r.propWinPerTrade, -exLoss),
      trade("6", "WIN", r.propWinPerTrade, -exLoss),
    ];
    const rec = computeRecovery(r, journal);
    // Net retained = max(0, 14.30 − 28.60) = 0
    // Shortfall = propFee − 0 = 28.60 (the FULL fee is still outstanding)
    expect(rec.recoveryShortfall).toBeCloseTo(28.6, 4);
    // Certainly not a false 50% from using gross wins
    expect(rec.recoveryShortfall).not.toBeCloseTo(28.6 - 14.3, 4);
  });

  it("Dynamic Leg Expansion (Defensive Mode): lowering prop risk expands legs and drops Exness win target", () => {
    // Baseline: $50 prop risk on $5000 account (DD $300, Fee $28.60)
    const baseResult = calculate(base);
    expect(baseResult.lossesToBlow).toBe(6);
    expect(baseResult.exnessWinTarget).toBeCloseTo(28.6 / 6, 4); // ~4.7667

    const baseRec = computeRecovery(baseResult, []);
    expect(baseRec.isDefensiveMode).toBe(false);

    // Defensive mode: User lowers risk from $50 to $30
    const defResult = calculate({ ...base, propRiskUsd: 30 });
    // Losses to blow expands to 300 / 30 = 10 legs
    expect(defResult.lossesToBlow).toBe(10);
    // Exness win target drops to 28.6 / 10 = 2.86
    expect(defResult.exnessWinTarget).toBeCloseTo(28.6 / 10, 4);

    const defRec = computeRecovery(defResult, []);
    expect(defRec.isDefensiveMode).toBe(true);
    expect(defRec.expandedLossesToBlow).toBe(10);

    // Restoring back to $50 turns off defensive mode
    const restoredResult = calculate({ ...base, propRiskUsd: 50 });
    expect(restoredResult.lossesToBlow).toBe(6);
    expect(restoredResult.exnessWinTarget).toBeCloseTo(28.6 / 6, 4);

    const restoredRec = computeRecovery(restoredResult, []);
    expect(restoredRec.isDefensiveMode).toBe(false);
  });

  it("Preserves Slippage Debt during Dynamic Risk Change: $0.62 debt + $2.86 base = $3.48 next target", () => {
    // 1. Initial trade at $50 risk: Prop WIN with slippage debt of $0.62
    const baseResult = calculate(base);
    const expectedLoss = (28.6 / 6) * 2; // $9.5333
    const actualLoss = expectedLoss + 0.62; // $10.1533
    const journal = [trade("1", "WIN", 100, -actualLoss, 2)];

    // At $50 risk: Base target is 4.77, debt is 0.62 -> Next target is 5.39
    const recAt50 = computeRecovery(baseResult, journal);
    expect(recAt50.slippageDebt).toBeCloseTo(0.62, 2);
    expect(recAt50.baseExnessWinTarget).toBeCloseTo(4.7667, 4);
    expect(recAt50.newExnessWinTarget).toBeCloseTo(4.7667 + 0.62, 2);

    // 2. User tactically lowers Prop Risk to $30 (Defensive Mode):
    // The debt ($0.62) MUST be preserved, combined with new base ($2.86) to make $3.48
    const defBase = calculate({ ...base, propRiskUsd: 30 });
    const recAt30 = computeRecovery(defBase, journal);
    expect(recAt30.slippageDebt).toBeCloseTo(0.62, 2);
    expect(recAt30.baseExnessWinTarget).toBeCloseTo(2.86, 2);
    expect(recAt30.newExnessWinTarget).toBeCloseTo(2.86 + 0.62, 2); // exactly $3.48

    // 3. Engine calculates lot sizes with the combined $3.48 target
    const engineWithRecovery = calculate({
      ...base,
      propRiskUsd: 30,
      exnessWinTargetOverride: recAt30.newExnessWinTarget,
    });
    expect(engineWithRecovery.exnessWinTarget).toBeCloseTo(3.48, 2);
    // Exness loss on a prop win is $3.48 * 2 = $6.96 (instead of $13.46 at $50 risk!)
    expect(engineWithRecovery.exnessWinTarget * 2).toBeCloseTo(6.96, 2);

    // 4. Trade 2: Log Exness WIN of $3.48 (Prop LOSS at $30 risk)
    const journalAfterHeal = [
      ...journal,
      trade("2", "LOSS", -30, 3.48, 2, 2.86),
    ];
    const recAfterHeal = computeRecovery(defBase, journalAfterHeal);
    // Debt is wiped to 0!
    expect(recAfterHeal.slippageDebt).toBe(0);
    expect(recAfterHeal.newExnessWinTarget).toBeCloseTo(2.86, 2);

    // 5. User switches Prop Risk back to $50:
    const restoredResult = calculate({ ...base, propRiskUsd: 50 });
    const recRestored = computeRecovery(restoredResult, journalAfterHeal);
    expect(recRestored.slippageDebt).toBe(0);
    expect(recRestored.newExnessWinTarget).toBeCloseTo(4.7667, 4);
    expect(recRestored.isDefensiveMode).toBe(false);
  });

  it("Historical Prop Slippage does not inflate when switching to lowered risk", () => {
    // Trade 1 logged at $50 risk, lost $51 ($1 prop slippage)
    const baseResult = calculate(base);
    const journal = [
      trade("1", "LOSS", -51, baseResult.exnessWinTarget, 2, 28.6 / 6),
    ];
    const recAt50 = computeRecovery(baseResult, journal);
    expect(recAt50.totalPropSlippage).toBeCloseTo(1.0, 2);

    // Switch to $30 risk: totalPropSlippage MUST remain $1.00 (not $51 - $30 = $21.00)
    const defResult = calculate({ ...base, propRiskUsd: 30 });
    const recAt30 = computeRecovery(defResult, journal);
    expect(recAt30.totalPropSlippage).toBeCloseTo(1.0, 2);
  });
});

describe("Audit fixes — totalMoneyLost, real daily cap, Phase 2 fee, legs-left, debt shortfall", () => {
  it("totalMoneyLost = Exness fuel exhausted + prop fee (audit §5.9, was always $0)", () => {
    const r = calculate(base);
    // One prop WIN: Exness loses $9.53 → fuel exhausted $9.53, fee $28.60.
    const journal = [trade("1", "WIN", 100, -9.5333)];
    const rec = computeRecovery(r, journal);
    expect(rec.exnessFuelExhausted).toBeCloseTo(9.5333, 3);
    expect(rec.totalMoneyLost).toBeCloseTo(9.5333 + 28.6, 3);
  });

  it("totalMoneyLost is $28.60 (fee only) on a clean journal", () => {
    const r = calculate(base);
    const rec = computeRecovery(r, []);
    expect(rec.totalMoneyLost).toBeCloseTo(28.6, 6);
  });

  it("real $ daily cap: two $60 prop wins ($120) lock the day; one $60 win does not (audit §5.8)", () => {
    const today = localToday();
    const r = calculate({ ...base, account: { ...account, dailyProfitCap: 100 } });
    const mk = (id: string, propPnl: number): JournalTrade => ({
      id, date: today, time: "00:00:00", pair: "EURUSD", dir: "LONG", result: "WIN",
      propPnl, exPnl: -9.53, netPnl: propPnl - 9.53,
      details: {
        entry: 1.085 + Number(id) * 0.001, propSl: 1.082, propTp: 1.091, exSl: 1.091, exTp: 1.082,
        propLots: 0.17, exLots: 1.59, rr: 2, phase: 1,
        baseExnessWinTarget: 28.6 / 6, propRiskAtLog: 50,
      },
    });
    const one = computeRecovery(r, [mk("1", 60)]);
    expect(one.dailyPropPnl).toBeCloseTo(60, 6);
    expect(one.dailyCapLocked).toBe(false);
    const two = computeRecovery(r, [mk("1", 60), mk("2", 60)]);
    expect(two.dailyPropPnl).toBeCloseTo(120, 6);
    expect(two.dailyCapLocked).toBe(true);
    expect(two.dailyProfitCap).toBe(100);
  });

  it("daily P&L dedupes mirror legs — one trade logged per leg counts once", () => {
    const today = localToday();
    const r = calculate({ ...base, account: { ...account, dailyProfitCap: 100 } });
    // Same trade, two leg entries, identical date/pair/entry/result.
    const leg = trade("1", "WIN", 60, -9.53);
    const journal = [{ ...leg, date: today }, { ...leg, id: "1b", date: today }];
    const rec = computeRecovery(r, journal);
    expect(rec.dailyPropPnl).toBeCloseTo(60, 6);
    expect(rec.dailyCapLocked).toBe(false);
  });

  it("Phase 2 recovery target does not double-count the fee (audit §5.7)", () => {
    // Clean case: fee $28.60, planned burn $28.60 → trueDeficit $57.20.
    // Old code: (fee + trueDeficit) / 6 = $14.30. Fixed: $57.20 / 6 = $9.53.
    const r = calculate({ ...base, phase: 2 });
    expect(r.trueDeficit).toBeCloseTo(57.2, 4);
    expect(r.exnessWinTarget).toBeCloseTo(57.2 / 6, 4);
  });

  it("legs-left is one dollar-based definition: two $57 losses leave 3 legs, not 4 (audit §5.10)", () => {
    const r = calculate(base);
    const journal = [
      trade("1", "LOSS", -57.16, 4.7667),
      trade("2", "LOSS", -55.83, 4.7667),
    ];
    const rec = computeRecovery(r, journal);
    // $300 drawdown − $112.99 lost = $187.01 left; $187.01 / $50 = 3.74 → 3 legs.
    expect(rec.remainingLosses).toBe(3);
    expect(rec.adjustedRemainingLosses).toBe(3);
  });

  it("Exness win of exactly the base with debt outstanding leaves the debt, not double it (audit §5.11)", () => {
    const r = calculate({ ...base, rr: 1.5 });
    const burned = (28.6 / 6) * 1.5 + 0.74; // $0.74 debt
    const journal = [
      trade("1", "WIN", r.propWinPerTrade, -burned, 1.5),
      // Prop LOSS, Exness wins exactly the base 4.7667 — the bumped
      // obligation was 5.5067, so $0.74 is still owed, not $1.48.
      trade("2", "LOSS", -50, r.exnessWinTarget, 1.5),
    ];
    const rec = computeRecovery(r, journal);
    expect(rec.slippageDebt).toBeCloseTo(0.74, 4);
  });

  it("anomalous mirror trades (prop WIN and Exness WIN) are counted, not silently skipped", () => {
    const r = calculate(base);
    const journal = [trade("1", "WIN", 100, 5)];
    const rec = computeRecovery(r, journal);
    expect(rec.anomalousMirrorTrades).toBe(1);
    expect(rec.slippageDebt).toBe(0);
  });
});

// helper for the key wipe-on-Exness-win test
function rec5_51_target(r: ReturnType<typeof calculate>) {
  return r.exnessWinTarget + 0.74;
}
