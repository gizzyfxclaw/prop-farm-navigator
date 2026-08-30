import { describe, expect, it } from "vitest";
import { calculate, pendingOrderType, tradePnl, type EngineInputs, type PropAccount } from "./calc";

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

describe("engine", () => {
  it("derives account level figures", () => {
    const r = calculate(base);
    expect(r.targetUsd).toBe(300);
    expect(r.maxDdUsd).toBe(300);
    expect(r.lossesToBlow).toBe(6);
    expect(r.winsToPass).toBe(3);
    expect(r.propWinPerTrade).toBe(100);
  });

  it("mirrors pips and prices with 5 decimals", () => {
    const r = calculate(base);
    expect(r.propTpPips).toBe(60);
    expect(r.exnessSlPips).toBe(60);
    expect(r.exnessTpPips).toBe(30);
    expect(r.propSl).toBeCloseTo(1.082, 5);
    expect(r.propTp).toBeCloseTo(1.091, 5);
    expect(r.exnessSl).toBeCloseTo(1.091, 5);
    expect(r.exnessTp).toBeCloseTo(1.082, 5);
    expect(r.propLots).toBeCloseTo(50 / (30 * 10), 6);
  });

  it("uses 3 decimals and a rate-derived pip value for JPY", () => {
    const r = calculate({ ...base, pair: "USDJPY", entryPrice: 157.123 });
    expect(r.decimals).toBe(3);
    // Real pip value = (pipSize × 100,000 units) / rate — not a static
    // constant, since USD is the base currency for this pair.
    expect(r.pipValue).toBeCloseTo(1000 / 157.123, 6);
    expect(r.propSl).toBeCloseTo(156.823, 3);
  });

  it("falls back to the static JPY pip value when no rate is available yet", () => {
    const r = calculate({ ...base, pair: "USDJPY", entryPrice: 0 });
    expect(r.pipValue).toBe(9);
  });

  it("uses worst-case R:R of 2 for phase 1 capital even at 1:1.5", () => {
    const r = calculate({ ...base, rr: 1.5 });
    const win = 28.6 / 6;
    // At 1:1.5 it takes 4 wins to clear the $300 target.
    expect(r.winsToPass).toBe(4);
    expect(r.phase1.exnessWinTarget).toBeCloseTo(win, 6);
    expect(r.phase1.exnessLossTarget).toBeCloseTo(win * 2, 6);
    expect(r.phase1.pureExnessCapital).toBeCloseTo(win * 2 * 4, 6);
    expect(r.phase1.bufferedExnessCapital).toBeCloseTo(win * 2 * 4 * 1.2, 6);
    expect(r.phase1TotalSpent).toBeCloseTo(28.6 + win * 2 * 4 * 1.2, 6);
    expect(r.phase1Leftover).toBeCloseTo(win * 2 * 4 * 0.2, 6);
  });

  it("carries phase 1 into phase 2 without recharging the fee", () => {
    const p1 = calculate(base);
    const p2 = calculate({ ...base, phase: 2 });
    expect(p2.phase2.totalRecovery).toBeCloseTo(p1.phase1TotalSpent, 6);
    expect(p2.phase2RefillRequired).toBeCloseTo(
      p2.phase2.bufferedExnessCapital - p1.phase1Leftover,
      6,
    );
    expect(p2.totalRequiredCapital).toBeCloseTo(p1.phase1TotalSpent + p2.phase2RefillRequired, 6);
  });

  it("nets payout against total required capital", () => {
    const r = calculate({ ...base, phase: 2 });
    expect(r.propPayout).toBeCloseTo(240, 6);
    expect(r.netProfitIfPassed).toBeCloseTo(
      r.propPayout + r.leftoverExnessBalance - r.totalRequiredCapital,
      6,
    );
  });

  it("flags trailing drawdown as broken", () => {
    const r = calculate({ ...base, account: { ...account, ddType: "Trailing" } });
    expect(r.verdict.level).toBe("red");
    expect(r.verdict.title).toMatch(/Trailing/);
  });

  it("flags thin payouts", () => {
    const r = calculate({ ...base, account: { ...account, size: 100, fee: 9.99, targetPct: 10, ddPct: 5 } });
    expect(r.verdict.level).toBe("red");
    expect(r.verdict.title).toMatch(/Not Profitable/);
  });

  it("computes journal P&L from live state", () => {
    const r = calculate(base);
    const win = tradePnl(r, true, 2);
    expect(win.propPnl).toBeCloseTo(100, 6);
    expect(win.exPnl).toBeCloseTo(-r.exnessWinTarget * 2, 6);
    const loss = tradePnl(r, false, 2);
    expect(loss.propPnl).toBeCloseTo(-50, 6);
    expect(loss.exPnl).toBeCloseTo(r.exnessWinTarget, 6);
  });

  it("selects pending order types", () => {
    expect(pendingOrderType("LONG", 1.08, 1.09)).toBe("ORDER_TYPE_BUY_LIMIT");
    expect(pendingOrderType("LONG", 1.1, 1.09)).toBe("ORDER_TYPE_BUY_STOP");
    expect(pendingOrderType("SHORT", 1.1, 1.09)).toBe("ORDER_TYPE_SELL_LIMIT");
    expect(pendingOrderType("SHORT", 1.08, 1.09)).toBe("ORDER_TYPE_SELL_STOP");
  });
});
