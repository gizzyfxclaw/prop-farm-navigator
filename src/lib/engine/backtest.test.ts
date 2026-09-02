import { describe, expect, it } from "vitest";
import { calculate, tradePnl } from "./calc";
import { computeRecovery } from "../recovery";
import type { JournalTrade } from "../store";
import type { EngineInputs, PropAccount } from "./calc";

const account: PropAccount = {
  id: "e8",
  firm: "E8 Prop $5,000",
  size: 5000,
  fee: 28.6,
  targetPct: 6,
  ddPct: 6,
  ddType: "Static",
  splitPct: 80,
  dailyProfitCap: 100,
};

const baseInputs: EngineInputs = {
  account,
  phase: 1,
  propRiskUsd: 50,
  rr: 2,
  slPips: 10,
  desiredProfit: 0,
  bufferPct: 20,
  pair: "EURUSD",
  direction: "LONG",
  entryPrice: 1.15776,
  exnessAccountType: "Cent",
  actualExnessBalance: 40.86,
};

function makeJournalEntry(id: string, propPnl: number, exPnl: number, r: any): JournalTrade {
  return {
    id, date: "2026-09-02", time: "12:00:00", pair: "EURUSD",
    dir: "LONG", result: "WIN", propPnl, exPnl, netPnl: propPnl + exPnl,
    details: {
      entry: r.entryPrice, propSl: r.propSl, propTp: r.propTp,
      exSl: r.exnessSl, exTp: r.exnessTp, propLots: r.propLots, exLots: r.exnessLots,
      rr: r.rr, phase: r.phase, baseExnessWinTarget: r.exnessWinTarget,
    },
  };
}

describe("Comprehensive Backtest — Full Lifecycle", () => {
  describe("Phase 1", () => {
    it("1.1: Clean 3 wins, no slippage", () => {
      const r = calculate(baseInputs);
      const journal: JournalTrade[] = [];
      for (let i = 0; i < 3; i++) {
        const pnl = tradePnl(r, true, r.rr);
        journal.push(makeJournalEntry(String(i + 1), pnl.propPnl, pnl.exPnl, r));
      }
      const recovery = computeRecovery(r, journal);
      expect(recovery.challengePassed).toBe(true);
      expect(recovery.slippageDebt).toBe(0);
    });

    it("1.2: 3 wins with slippage (your screenshot trades)", () => {
      const r = calculate(baseInputs);
      const journal: JournalTrade[] = [
        makeJournalEntry("1", 101, -15.90, r),
        makeJournalEntry("2", 101, -12.01, r),
        makeJournalEntry("3", 102, -10.00, r),
      ];
      const recovery = computeRecovery(r, journal);
      expect(recovery.challengePassed).toBe(true);
      expect(recovery.slippageDebt).toBeCloseTo(9.31, 2);
    });

    it("1.3: Heavy slippage ($53 total loss)", () => {
      const r = calculate(baseInputs);
      const journal: JournalTrade[] = [
        makeJournalEntry("1", 100, -20.0, r),
        makeJournalEntry("2", 100, -18.0, r),
        makeJournalEntry("3", 100, -15.0, r),
      ];
      const recovery = computeRecovery(r, journal);
      expect(recovery.challengePassed).toBe(true);
      expect(recovery.slippageDebt).toBeGreaterThan(0);
    });
  });

  describe("Phase 2 — Recovery", () => {
    it("2.1: Recovers $66.51 (fee + $37.91 actual losses)", () => {
      const r1 = calculate(baseInputs);
      const journal: JournalTrade[] = [
        makeJournalEntry("1", 101, -15.90, r1),
        makeJournalEntry("2", 101, -12.01, r1),
        makeJournalEntry("3", 102, -10.00, r1),
      ];
      const recovery1 = computeRecovery(r1, journal);
      expect(recovery1.challengePassed).toBe(true);

      const actualExnessLosses = 15.90 + 12.01 + 10.00;
      const r2 = calculate({
        ...baseInputs,
        phase: 2,
        carryPhase1TotalSpent: r1.phase1TotalSpent,
        carryPhase1Leftover: r1.phase1Leftover,
        actualExnessBalance: 40.86,
        actualExnessLosses,
      });

      expect(r2.phase2.totalRecovery).toBeCloseTo(66.51, 2);
    });

    it("2.2: Recovers $81.60 with heavy slippage ($53 loss)", () => {
      const r1 = calculate(baseInputs);
      const journal: JournalTrade[] = [
        makeJournalEntry("1", 100, -20.0, r1),
        makeJournalEntry("2", 100, -18.0, r1),
        makeJournalEntry("3", 100, -15.0, r1),
      ];
      const recovery1 = computeRecovery(r1, journal);
      expect(recovery1.challengePassed).toBe(true);

      const actualExnessLosses = 20.0 + 18.0 + 15.0;
      const r2 = calculate({
        ...baseInputs,
        phase: 2,
        carryPhase1TotalSpent: r1.phase1TotalSpent,
        carryPhase1Leftover: r1.phase1Leftover,
        actualExnessBalance: 40.86,
        actualExnessLosses,
      });

      expect(r2.phase2.totalRecovery).toBeCloseTo(81.60, 2);
    });

    it("2.3: Martingale active in Phase 2 recovers slippage", () => {
      // Phase 2 with slippage during recovery
      const r1 = calculate(baseInputs);
      const journal: JournalTrade[] = [
        makeJournalEntry("1", 101, -15.90, r1),
        makeJournalEntry("2", 101, -12.01, r1),
        makeJournalEntry("3", 102, -10.00, r1),
      ];

      const actualExnessLosses = 15.90 + 12.01 + 10.00;
      const r2 = calculate({
        ...baseInputs,
        phase: 2,
        carryPhase1TotalSpent: r1.phase1TotalSpent,
        carryPhase1Leftover: r1.phase1Leftover,
        actualExnessBalance: 40.86,
        actualExnessLosses,
      });

      // Simulate Phase 2 trades with slippage
      const p2Journal: JournalTrade[] = [
        ...journal,
        // Phase 2 Trade 1: Prop loses, Exness wins less than expected (slippage)
        makeJournalEntry("p2-1", -50, 8.0, r2),
        // Phase 2 Trade 2: Martingale bump active, recovers more
        makeJournalEntry("p2-2", -50, 14.18, r2),
      ];

      const recovery2 = computeRecovery(r2, p2Journal);
      expect(recovery2.slippageDebt).toBeGreaterThan(0);
      expect(recovery2.adjustmentNeeded).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("3.1: Zero balance without NaN", () => {
      const r = calculate({ ...baseInputs, actualExnessBalance: 0 });
      expect(Number.isFinite(r.exnessWinTarget)).toBe(true);
      expect(Number.isFinite(r.exnessLots)).toBe(true);
    });

    it("3.2: R:R rotation (all ratios)", () => {
      for (const rr of [1.5, 2, 2.5, 3] as const) {
        const r = calculate({ ...baseInputs, rr });
        expect(r.rr).toBe(rr);
        expect(r.phase1.exnessLossTarget).toBeCloseTo(r.phase1.exnessWinTarget * rr, 6);
      }
    });

    it("3.3: Daily Profit Cap", () => {
      const r = calculate({ ...baseInputs, account: { ...account, dailyProfitCap: 80 } });
      expect(r.riskCapped).toBe(true);
      expect(r.cappedPropRisk).toBeLessThan(50);
    });

    it("3.4: Mirror symmetry", () => {
      const r = calculate(baseInputs);
      expect(r.propDirection).toBe("LONG");
      expect(r.exnessDirection).toBe("SHORT");
      expect(r.propSlPips).toBe(r.exnessTpPips);
      expect(r.propTpPips).toBe(r.exnessSlPips);
    });
  });
});
