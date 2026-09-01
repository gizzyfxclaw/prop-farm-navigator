import { describe, expect, it } from "vitest";
import { calculate, type EngineInputs, type PropAccount } from "./engine/calc";
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

/** Build a closed journal trade with the engine's derived P&L. */
function trade(
  id: string,
  result: "WIN" | "LOSS",
  propPnl: number,
  exPnl: number,
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
  };
}

describe("recovery money summary", () => {
  it("worst-case pass (3 wins, no losses): fuel burn equals pure capital", () => {
    const r = calculate(base);
    const win = r.exnessWinTarget;         // 28.6 / 6
    const exLoss = win * 2;                 // worst-case 1:2
    const journal = [
      trade("1", "WIN", r.propWinPerTrade, -exLoss),
      trade("2", "WIN", r.propWinPerTrade, -exLoss),
      trade("3", "WIN", r.propWinPerTrade, -exLoss),
    ];
    const rec = computeRecovery(r, journal);

    expect(rec.loggedWins).toBe(3);
    expect(rec.challengePassed).toBe(true);
    // Net Exness P&L = -28.6 → fuel exhausted equals the whole pure capital.
    expect(rec.exnessFuelExhausted).toBeCloseTo(28.6, 6);
    // Total money lost = fee + net fuel burn.
    expect(rec.totalMoneyLost).toBeCloseTo(28.6 + 28.6, 6);
    // Payout 240 lands, fuel burn and fee are already counted.
    expect(rec.netResultAfterPayout).toBeCloseTo(240 - 28.6 - 28.6, 6);
  });

  it("mixed run (1 loss + 3 wins): prop loss recovers fuel, so lost money shrinks", () => {
    const r = calculate(base);
    const win = r.exnessWinTarget;
    const exLoss = win * 2;
    const journal = [
      trade("1", "LOSS", -50, win),
      trade("2", "WIN", r.propWinPerTrade, -exLoss),
      trade("3", "WIN", r.propWinPerTrade, -exLoss),
      trade("4", "WIN", r.propWinPerTrade, -exLoss),
    ];
    const rec = computeRecovery(r, journal);

    expect(rec.challengePassed).toBe(true);
    const netEx = win - exLoss * 3; // 4.7667 - 28.6
    expect(rec.actualExnessPnl).toBeCloseTo(netEx, 6);
    expect(rec.exnessFuelExhausted).toBeCloseTo(-netEx, 6);
    expect(rec.totalMoneyLost).toBeCloseTo(28.6 - netEx, 6);
    expect(rec.netResultAfterPayout).toBeCloseTo(240 + netEx - 28.6, 6);
  });

  it("losing streak (2 losses, challenge not passed): fuel recovering, nothing exhausted yet", () => {
    const r = calculate(base);
    const journal = [trade("1", "LOSS", -50, r.exnessWinTarget), trade("2", "LOSS", -50, r.exnessWinTarget)];
    const rec = computeRecovery(r, journal);

    expect(rec.challengePassed).toBe(false);
    expect(rec.actualExnessPnl).toBeGreaterThan(0);
    expect(rec.exnessFuelExhausted).toBe(0);
    expect(rec.totalMoneyLost).toBeCloseTo(28.6, 6); // fee only so far
    expect(rec.netResultAfterPayout).toBeCloseTo(240 + rec.actualExnessPnl - 28.6, 6);
  });

  it("self-healing still re-paces after a slipped Exness win", () => {
    const r = calculate(base);
    const slipped = r.exnessWinTarget - 0.27; // slippage ate $0.27 of the win
    const journal = [trade("1", "LOSS", -50, slipped)];
    const rec = computeRecovery(r, journal);

    expect(rec.remainingLosses).toBe(5);
    expect(rec.recoveryShortfall).toBeCloseTo(28.6 - slipped, 6);
    expect(rec.newExnessWinTarget).toBeCloseTo((28.6 - slipped) / 5, 6);
    expect(rec.adjustmentNeeded).toBe(true);
    expect(rec.totalMoneyLost).toBeCloseTo(28.6, 6); // fuel recovered, fee still sunk
  });

  it("recovers slippage on a prop WIN leg and re-locks the pace (user case: lost 7.89 vs 7.15)", () => {
    // User's real setup: R:R 1:1.5 → base pace 28.6/6 = 4.7667,
    // expected Exness loss on a prop win = 4.7667 × 1.5 = 7.15.
    const r = calculate({ ...base, rr: 1.5 });
    expect(r.exnessWinTarget).toBeCloseTo(28.6 / 6, 6);

    // Trade 1: prop WIN. Slippage made Exness lose 7.89 instead of 7.15 ($0.74 extra).
    const slip = 0.74;
    const burned = (28.6 / 6) * 1.5 + slip; // 7.89
    const journal = [trade("1", "WIN", r.propWinPerTrade, -burned)];
    const rec = computeRecovery(r, journal);

    // No prop losses logged yet — all 6 loss-legs remain to earn the recovery.
    expect(rec.remainingLosses).toBe(6);

    // On-script next target (no slippage): (28.6 + 7.15) / 6 = 5.9583.
    const onScript = (28.6 + 7.15) / 6;
    // Healed next target: whole remaining recovery incl. the slipped 0.74, over 6 legs.
    const healed = (28.6 + 7.89) / 6;
    expect(rec.newExnessWinTarget).toBeCloseTo(healed, 6);
    // The bump over on-script is exactly the slip amortized over the remaining legs.
    expect(rec.newExnessWinTarget! - onScript).toBeCloseTo(slip / 6, 6);
    expect(rec.adjustmentNeeded).toBe(true);

    // Worst case from here (6 prop losses in a row, each earning the healed
    // target): the loop still closes at exactly totalRecovery — the slipped
    // $0.74 is fully recovered, no more, no less.
    expect(-7.89 + 6 * healed).toBeCloseTo(28.6, 6);

    // After the next prop loss earns the healed target, the pace RE-LOCKS:
    // it does not keep climbing, and it does not revert below the healed pace
    // (reverting would leave the 0.74 unrecovered).
    const j2 = [...journal, trade("2", "LOSS", -50, healed)];
    const rec2 = computeRecovery(r, j2);
    expect(rec2.remainingLosses).toBe(5);
    expect(rec2.newExnessWinTarget).toBeCloseTo(healed, 6);
  });
});
