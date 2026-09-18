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
    expect(r.propFee).toBe(28.6);
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

  it("sizes phase 1 capital for the SELECTED R:R of 1.5 (not worst-case)", () => {
    const r = calculate({ ...base, rr: 1.5 });
    const win = 28.6 / 6;
    // At 1:1.5 it takes 4 wins to clear the $300 target.
    expect(r.winsToPass).toBe(4);
    expect(r.phase1.exnessWinTarget).toBeCloseTo(win, 6);
    // Capital sized for the SELECTED R:R of 1.5.
    expect(r.phase1.exnessLossTarget).toBeCloseTo(win * 1.5, 6);
    expect(r.phase1.pureExnessCapital).toBeCloseTo(win * 1.5 * 4, 6);
    expect(r.phase1.bufferedExnessCapital).toBeCloseTo(win * 1.5 * 4 * 1.2, 6);
    expect(r.phase1TotalSpent).toBeCloseTo(28.6 + win * 1.5 * 4 * 1.2, 6);
    expect(r.phase1Leftover).toBeCloseTo(win * 1.5 * 4 * 0.2, 6);
  });

  it("at 1:2.5 selection: 3 prop wins needed, capital sized for selected R:R of 2.5", () => {
    const r = calculate({ ...base, rr: 2.5 });
    const win = 28.6 / 6;
    // $300 / ($50 × 2.5 = $125) = 2.4 → 3 wins
    expect(r.winsToPass).toBe(3);
    expect(r.phase1.exnessWinTarget).toBeCloseTo(win, 6);
    // Capital sized for the SELECTED R:R of 2.5.
    expect(r.phase1.exnessLossTarget).toBeCloseTo(win * 2.5, 6);
    expect(r.phase1.pureExnessCapital).toBeCloseTo(win * 2.5 * 3, 6);
    expect(r.phase1.bufferedExnessCapital).toBeCloseTo(win * 2.5 * 3 * 1.2, 6);
  });

  it("at 1:3 selection: 2 prop wins needed, capital sized for selected R:R of 3", () => {
    const r = calculate({ ...base, rr: 3 });
    const win = 28.6 / 6;
    // $300 / ($50 × 3 = $150) = 2
    expect(r.winsToPass).toBe(2);
    expect(r.phase1.exnessWinTarget).toBeCloseTo(win, 6);
    // Capital sized for the SELECTED R:R of 3.
    expect(r.phase1.exnessLossTarget).toBeCloseTo(win * 3, 6);
    expect(r.phase1.pureExnessCapital).toBeCloseTo(win * 3 * 2, 6);
    expect(r.phase1.bufferedExnessCapital).toBeCloseTo(win * 3 * 2 * 1.2, 6);
  });

  it("at 1:2 selection: 3 prop wins needed, capital sized for selected R:R of 2", () => {
    const r = calculate({ ...base, rr: 2 });
    const win = 28.6 / 6;
    expect(r.winsToPass).toBe(3);
    // Capital sized for the SELECTED R:R of 2.
    expect(r.phase1.exnessLossTarget).toBeCloseTo(win * 2, 6);
    expect(r.phase1.pureExnessCapital).toBeCloseTo(win * 2 * 3, 6);
  });

  it("carries phase 1 into phase 2 without recharging the fee", () => {
    const p1 = calculate(base);
    const p2 = calculate({ ...base, phase: 2 });
    // Phase 2 recovers only actual capital burned (fee + exness fuel), NOT the buffer
    const actualCapitalBurnedP1 = 28.6 + p1.phase1.exnessBurnIfPassed;
    expect(p2.phase2.totalRecovery).toBeCloseTo(actualCapitalBurnedP1, 6);
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

  describe("price-based calculation mode", () => {
    it("calculates pips, R:R and mirrored levels from entry, stop price, and TP price for LONG", () => {
      const r = calculate({
        ...base,
        calcMode: "price",
        entryPrice: 1.085,
        stopPrice: 1.082,
        tpPrice: 1.091,
        direction: "LONG",
      });

      expect(r.calcMode).toBe("price");
      expect(r.propSlPips).toBe(30);
      expect(r.propTpPips).toBe(60);
      expect(r.rr).toBe(2);
      expect(r.propSl).toBeCloseTo(1.082, 5);
      expect(r.propTp).toBeCloseTo(1.091, 5);
      expect(r.exnessSl).toBeCloseTo(1.091, 5);
      expect(r.exnessTp).toBeCloseTo(1.082, 5);
      expect(r.propLots).toBeCloseTo(50 / (30 * 10), 6);
    });

    it("calculates pips, R:R and mirrored levels for SHORT direction", () => {
      const r = calculate({
        ...base,
        calcMode: "price",
        direction: "SHORT",
        entryPrice: 1.085,
        stopPrice: 1.0875,
        tpPrice: 1.08,
      });

      expect(r.propSlPips).toBe(25);
      expect(r.propTpPips).toBe(50);
      expect(r.rr).toBe(2);
      expect(r.propSl).toBeCloseTo(1.0875, 5);
      expect(r.propTp).toBeCloseTo(1.08, 5);
      expect(r.exnessSl).toBeCloseTo(1.08, 5);
      expect(r.exnessTp).toBeCloseTo(1.0875, 5);
    });

    it("calculates correctly on USDJPY with pip size 0.01", () => {
      const r = calculate({
        ...base,
        pair: "USDJPY",
        calcMode: "price",
        direction: "LONG",
        entryPrice: 155.5,
        stopPrice: 155.2,
        tpPrice: 156.1,
      });

      expect(r.propSlPips).toBe(30);
      expect(r.propTpPips).toBe(60);
      expect(r.rr).toBe(2);
      expect(r.propSl).toBeCloseTo(155.2, 3);
      expect(r.propTp).toBeCloseTo(156.1, 3);
    });

    it("handles custom R:R calculated from arbitrary price targets", () => {
      const r = calculate({
        ...base,
        calcMode: "price",
        direction: "LONG",
        entryPrice: 1.085,
        stopPrice: 1.083, // 20 pips SL
        tpPrice: 1.091,  // 60 pips TP (1:3 R:R)
      });

      expect(r.propSlPips).toBe(20);
      expect(r.propTpPips).toBe(60);
      expect(r.rr).toBe(3);
    });

    it("strictly clamps R:R to MAX_RR (3.0) so Exness risk never inflates if wide TP is entered", () => {
      const r = calculate({
        ...base,
        calcMode: "price",
        direction: "LONG",
        entryPrice: 1.085,
        stopPrice: 1.083, // 20 pips SL
        tpPrice: 1.105,  // 200 pips TP (1:10 R:R if unbounded)
      });

      // Must be safely clamped to MAX_RR (3.0)
      expect(r.rr).toBe(3.0);
      // Exness loss target must be safely bounded to baseWinTarget * 3
      expect(r.exnessLossTarget).toBeCloseTo(r.exnessWinTarget * 3, 6);
    });

    it("strictly enforces safe minimum SL floor to prevent lot size explosion", () => {
      const r = calculate({
        ...base,
        calcMode: "price",
        direction: "LONG",
        entryPrice: 1.085,
        stopPrice: 1.0849, // 1 pip SL (unsafe if unclamped)
        tpPrice: 1.091,
      });

      // Must enforce safe floor of at least 5 pips
      expect(r.propSlPips).toBeGreaterThanOrEqual(5);
      expect(r.exnessTpPips).toBeGreaterThanOrEqual(5);
    });

    it("verifies Holy Trinity no-loss balance: Exness win recovers exact fee share", () => {
      const r = calculate({
        ...base,
        calcMode: "price",
        entryPrice: 1.085,
        stopPrice: 1.082,
        tpPrice: 1.091,
      });

      // In 6 losses, Exness recovers full fee: 6 * 4.7667 = $28.60
      const totalExnessRecovery = r.exnessWinTarget * r.lossesToBlow;
      expect(totalExnessRecovery).toBeCloseTo(account.fee, 2);

      // On a Prop win ($100), Exness loses only $9.53, netting +$90.47 profit
      const propWinReward = r.propWinPerTrade; // $100
      const exnessLoss = r.exnessLossTarget;   // $9.53
      const netProfitOnWin = propWinReward - exnessLoss;
      expect(netProfitOnWin).toBeGreaterThan(90);
    });
  });
});
