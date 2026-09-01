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
});
