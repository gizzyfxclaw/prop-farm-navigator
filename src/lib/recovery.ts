import type { EngineResult } from "./engine/calc";
import { WORST_CASE_RR } from "./engine/calc";
import type { JournalTrade } from "./store";

/**
 * Targeted Slippage Martingale (TSM) recovery state.
 *
 * The amortized "spread-shortfall-across-remaining-legs" healing was
 * abandoned because it kept the lot size high even after the slip was
 * physically recovered. The TSM model isolates the exact slippage
 * difference per trade into an accumulator and adds it ONLY to the
 * very next Exness target:
 *
 *   nextTarget = baseTarget + slippageDebt
 *
 * The debt is wiped to 0 on the next Exness win (prop loss), and
 * grown on the next Exness loss (prop win) by exactly the amount
 * the broker charged beyond the expected loss. It can never go
 * negative.
 */
export interface RecoveryState {
  // ── trade counts ────────────────────────────────────────────────────────────
  loggedWins: number;
  loggedLosses: number;

  // ── dynamic remaining counts (based on NET equity from start) ───────────
  /**
   * How many more prop WINS are still needed to reach the challenge target,
   * measured from NET prop equity (profits − losses) — a loss that gives
   * back prior profit must be re-earned before the target counts as reached.
   */
  remainingWins: number;
  /**
   * How many full prop-risk losses the account can still absorb before the
   * static drawdown floor, measured from STARTING equity — a loss that only
   * gives back prior profit does NOT consume a leg.
   */
  remainingLosses: number;

  // ── prop progress ────────────────────────────────────────────────────────────
  totalPropProfitLogged: number;   // sum of positive propPnl entries
  totalPropLossLogged: number;     // sum of absolute negative propPnl entries
  remainingPropTarget: number;     // targetUsd − NET equity
  remainingDrawdown: number;       // maxDdUsd − drawdown from starting equity

  // ── Exness P&L tracking ─────────────────────────────────────────────────────
  actualExnessPnl: number;         // net Exness PnL so far (wins - losses)
  totalExnessWins: number;         // gross positive Exness earnings
  totalExnessLosses: number;       // gross Exness losses (absolute)
  /** bufferedExnessCapital (starting stake) + actualExnessPnl */
  actualExnessBalance: number;

  // ── Targeted Slippage Martingale ────────────────────────────────────────────
  /**
   * Isolated slippage debt (≥ 0). Increased by the exact amount the broker
   * charged beyond the engine's expected Exness P&L on each trade; wiped
   * to 0 the next time Exness wins (prop loss). Adding positive Exness
   * overperformance brings debt down to 0 but never below.
   */
  slippageDebt: number;
  /**
   * Cumulative debt added across all logged trades (monotonic — useful for
   * diagnostics and for the "Total money lost" view). Distinct from
   * `slippageDebt`, which is the LIVE amount still owed.
   */
  totalSlippageAccrued: number;

  /**
   * Base Exness win target for the active phase (no debt applied). This is
   * `r.exnessWinTarget` for the engine's currently-selected phase.
   */
  baseExnessWinTarget: number;
  /**
   * The next-trade Exness win target: base + debt. Always ≥ base.
   * Lot sizing and the Total Capital Needed both use this number, so the
   * engine is already sized for the martingale bump BEFORE the trade fires.
   */
  newExnessWinTarget: number;
  /**
   * `newExnessWinTarget * WORST_CASE_RR` — the Exness risk on a prop win
   * when the martingale is active.
   */
  newExnessLossTarget: number;
  /**
   * true when the martingale bump is currently in effect (debt > 0).
   */
  adjustmentNeeded: boolean;

  // ── dynamic capital (drives "Total Capital Needed") ─────────────────────────
  /**
   * Exness capital required to absorb the martingale: dynamic loss target
   * × winsToPass, with the user-selected buffer applied. This replaces
   * the static `r.requiredExnessCapital` whenever the bump is active.
   */
  dynamicExnessCapital: number;

  // ── final money summary (fills in as trades are logged) ─────────────────────
  /** Prop challenge fee paid upfront (real cash). */
  propFee: number;
  /** Net Exness fuel consumed so far: starting tank − current balance (≥ 0). */
  exnessFuelExhausted: number;
  /** Total real money lost over the run: prop fee + net fuel burn. */
  totalMoneyLost: number;
  /** Whole-operation cash delta once the payout lands: payout + net Exness P&L − fee. */
  netResultAfterPayout: number;

  // ── edge case alerts ────────────────────────────────────────────────────────
  /** Challenge is complete — prop target reached. */
  challengePassed: boolean;
  /** Exness buffer has been depleted — deposit required. */
  bufferDepleted: boolean;
  /** Amount needed to top up Exness so the loop stays funded. */
  depositNeeded: number;

  /** Active phase the recovery is for. */
  phase: 1 | 2;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Helpers — derive the engine's expected Exness P&L for one trade.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The Exness P&L the engine expects for a single trade:
 *   - prop loss → exness win (positive), equal to `phase.exnessWinTarget`
 *   - prop win  → exness loss (negative), equal to `phase.exnessWinTarget * rr`
 *
 * Uses the live engine's currently-selected phase figures.
 */
function expectedExnessPnl(
  r: EngineResult,
  result: "WIN" | "LOSS",
  rr: number,
): number {
  if (result === "LOSS") return r.exnessWinTarget;             // prop lost, exness wins
  return -(r.exnessWinTarget * rr);                              // prop won, exness loses
}

// ──────────────────────────────────────────────────────────────────────────────
//  Main entry
// ──────────────────────────────────────────────────────────────────────────────

export function computeRecovery(r: EngineResult, journal: JournalTrade[]): RecoveryState {
  const closed = journal.filter((t) => t.result !== "OPEN");

  const loggedWins   = closed.filter((t) => t.result === "WIN").length;
  const loggedLosses = closed.filter((t) => t.result === "LOSS").length;

  // ── PART 2: Dynamic remaining counts from ACTUAL P&L ──────────────────────

  const totalPropProfitLogged = closed
    .filter((t) => t.propPnl > 0)
    .reduce((s, t) => s + t.propPnl, 0);

  const totalPropLossLogged = closed
    .filter((t) => t.propPnl < 0)
    .reduce((s, t) => s + Math.abs(t.propPnl), 0);

  // ── NET PROP EQUITY — the only basis a prop firm actually uses ──────────
  // Both the challenge target and the static drawdown floor are measured
  // against NET equity from the starting balance, never gross wins/losses:
  // a loss that only gives back prior profit neither consumes a blow-leg
  // nor counts as progress toward the target.
  const currentEquity = totalPropProfitLogged - totalPropLossLogged;

  // Profit still needed to pass: target − net equity. A give-back loss
  // must be re-earned before the target counts as reached.
  const remainingPropTarget = Math.max(0, r.targetUsd - currentEquity);

  // ── DRAWDOWN LEGS FROM STARTING EQUITY ──────────────────────────────────
  // "Legs remaining" = how many full prop-risk losses from STARTING equity
  // the account can still take. A prop loss that only wipes prior wins does
  // NOT consume a drawdown leg — the prop is still at or above starting equity.
  const drawdownFromStart = Math.max(0, -currentEquity);
  const remainingDrawdown = Math.max(0, r.maxDdUsd - drawdownFromStart);

  // ── PART 3: Exness P&L tracking ───────────────────────────────────────────

  const totalExnessWins   = closed
    .filter((t) => t.exPnl > 0)
    .reduce((s, t) => s + t.exPnl, 0);
  const totalExnessLosses = closed
    .filter((t) => t.exPnl < 0)
    .reduce((s, t) => s + Math.abs(t.exPnl), 0);
  const actualExnessPnl     = totalExnessWins - totalExnessLosses;
  const actualExnessBalance = r.requiredExnessCapital + actualExnessPnl;

  // ── PART 4: Targeted Slippage Martingale accumulator ────────────────────
  //
  // Walk every closed trade in chronological order. For each one:
  //   - Find the engine's expected Exness P&L (based on the trade's result
  //     and the R:R recorded in `details`; fall back to the current rr).
  //   - On a prop LOSS (Exness expected to win):
  //       * if actual exness < expected → debt grows by (expected − actual)
  //       * if actual exness > expected → debt shrinks by (actual − expected),
  //         floored at 0
  //   - On a prop WIN (Exness expected to lose):
  //       * if |actual| > |expected| (broker charged more slip) → debt grows
  //         by the difference
  //       * else (exness beat the script) → no debt change
  //
  // The first time Exness wins AFTER debt is open, debt is wiped entirely
  // (the bump was applied to the target the previous leg aimed for, and the
  // bump was collected — the next trade goes back to base). Subsequent
  // Exness wins without prior debt simply don't add to the accumulator.
  let slippageDebt = 0;
  let totalSlippageAccrued = 0;
  for (const t of closed) {
    // OPEN trades are filtered out above; this narrows for the helper.
    if (t.result === "OPEN") continue;
    const rr = t.details?.rr ?? 1.5;
    const expected = expectedExnessPnl(r, t.result, rr);

    if (t.result === "LOSS") {
      // Exness expected to win `expected`. Compare actual positive amount.
      if (t.exPnl >= expected) {
        // Wipe any outstanding debt (full reset on Exness win).
        if (slippageDebt > 0) slippageDebt = 0;
        // Overperformance (rare) does not earn negative debt; ignore.
      } else {
        // Shortfall → debt grows by exactly the gap.
        const slip = expected - t.exPnl;
        slippageDebt += slip;
        totalSlippageAccrued += slip;
      }
    } else {
      // WIN → Exness expected to LOSE `expected` (negative). |actual| > |expected|
      // means the broker charged MORE than the script expected.
      const expectedLoss = -expected; // positive number
      const actualLoss   = Math.abs(t.exPnl);
      if (actualLoss > expectedLoss) {
        const slip = actualLoss - expectedLoss;
        slippageDebt += slip;
        totalSlippageAccrued += slip;
      }
      // else: Exness came in better than script → no debt (no reward either;
      // overperformance on the loss leg is the broker's gift, not recoverable)
    }
  }

  // ── PART 5: Apply martingale bump to the active base target ─────────────
  const baseExnessWinTarget = r.exnessWinTarget;
  const newExnessWinTarget  = baseExnessWinTarget + slippageDebt;
  const newExnessLossTarget = newExnessWinTarget * WORST_CASE_RR;
  const adjustmentNeeded    = slippageDebt > 0.005; // half-pip dust threshold

  // ── PART 6: Dynamic capital needed for the bump ─────────────────────────
  // The martingale raises the Exness risk per trade, so the buffered
  // Exness capital must rise with it. winsToPass is unchanged.
  const pureDynamicCapital     = newExnessLossTarget * r.winsToPass;
  const bufferMultiplier       = 1 + r.bufferPct / 100;
  const dynamicExnessCapital   = pureDynamicCapital * bufferMultiplier;

  // ── PART 7: Edge case alerts ─────────────────────────────────────────────

  const challengePassed = remainingPropTarget <= 0 && loggedWins > 0;

  // Buffer depletion: live balance vs what the martingale-bumped target needs.
  const exnessNeededToFinish = newExnessLossTarget * Math.max(1, r.winsToPass);
  const bufferDepleted = !challengePassed && actualExnessBalance < exnessNeededToFinish;
  const depositNeeded  = bufferDepleted
    ? Math.max(0, exnessNeededToFinish - actualExnessBalance)
    : 0;

  // ── PART 8: Final money summary (real cash consumed by the run) ───────────
  const propFee = r.propFee;
  const exnessFuelExhausted = Math.max(0, -actualExnessPnl);
  const totalMoneyLost = propFee + exnessFuelExhausted;
  const netResultAfterPayout = r.propPayout + actualExnessPnl - propFee;

  return {
    loggedWins,
    loggedLosses,
    remainingWins: remainingPropTarget <= 0
      ? 0
      : Math.max(0, Math.ceil(remainingPropTarget / r.propWinPerTrade)),
    remainingLosses: remainingDrawdown <= 0
      ? 0
      : Math.max(0, Math.floor(remainingDrawdown / (r.lossesToBlow > 0 ? r.maxDdUsd / r.lossesToBlow : r.propWinPerTrade))),
    totalPropProfitLogged,
    totalPropLossLogged,
    remainingPropTarget,
    remainingDrawdown,
    actualExnessPnl,
    totalExnessWins,
    totalExnessLosses,
    actualExnessBalance,
    slippageDebt,
    totalSlippageAccrued,
    baseExnessWinTarget,
    newExnessWinTarget,
    newExnessLossTarget,
    adjustmentNeeded,
    dynamicExnessCapital,
    propFee,
    exnessFuelExhausted,
    totalMoneyLost,
    netResultAfterPayout,
    challengePassed,
    bufferDepleted,
    depositNeeded,
    phase: r.phase,
  };
}
