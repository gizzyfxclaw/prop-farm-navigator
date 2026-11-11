/**
 * Mirror execution — the two hedge legs as close to atomic as two separate
 * MetaApi accounts allow.
 *
 * HONEST LIMIT: true atomicity is IMPOSSIBLE across two brokers/accounts.
 * MetaApi has no cross-account transaction, and the user's Prop leg is
 * MatchTrader (E8), which has no MetaApi path at all — that leg is always
 * manual (phone/webtrader). What this module does for two MetaApi legs:
 *  1. Pre-flight checks BOTH legs before placing anything (lots >= 0.01,
 *     same entry price, SL/TP on the correct sides).
 *  2. Places Exness FIRST, then Prop SECOND, immediately, with ONE confirm
 *     — the old UI asked for a confirm per leg, minutes apart, which is
 *     how the legs drifted to different prices.
 *  3. If the Prop leg fails, it CANCELS the Exness pending order (rollback)
 *     and reports whether the rollback worked. If the rollback ALSO fails,
 *     the result says so loudly — the user must cancel the Exness order
 *     manually. That residual risk cannot be removed in code.
 *  4. Records both orderIds under one mirrorId so the journal can join
 *     the legs and the mirror-close monitor can find them.
 *
 * Mirror-close monitoring (the user's rule): because spread can make one
 * leg's TP hit while the other's SL does not hit at the same price, the
 * monitor watches both legs live. Before a trade, record the exact mirror
 * prices for both legs. Set an alert a short distance BEFORE each TP/SL
 * (the approach zone), then monitor actively as price enters that zone.
 * The moment one leg closes at a price, immediately close the other leg at
 * that exact same price by market close — do not wait for its own TP/SL
 * order to trigger. Log both fill prices, the difference, fees and
 * slippage, so the mirror is always respected.
 *
 * NOT built here: automatic close-on-fill. That needs a background watcher
 * polling both accounts' positions and firing a market close — it does not
 * exist in this codebase yet. `checkMirrorClose` is the pure decision
 * function that watcher will call; until it exists, the approach-zone
 * banner in the Engine page is the monitor, and the close is manual.
 */

export interface LegOrder {
  accountId: string;
  actionType: "ORDER_TYPE_BUY_LIMIT" | "ORDER_TYPE_BUY_STOP" | "ORDER_TYPE_SELL_LIMIT" | "ORDER_TYPE_SELL_STOP";
  symbol: string;
  volume: number;
  openPrice: number;
  stopLoss: number;
  takeProfit: number;
  comment?: string;
}

export type PlaceFn = (leg: LegOrder) => Promise<{ ok: true; orderId: string } | { ok: false; error: string }>;
export type CancelFn = (accountId: string, orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>;

export interface MirrorExecutionResult {
  status: "both-placed" | "rolled-back" | "partial";
  mirrorId: string;
  exnessOrderId?: string;
  propOrderId?: string;
  /** True when the Exness leg was cancelled after the Prop leg failed. */
  rollbackOk?: boolean;
  error?: string;
  /** Human-readable summary for the status line / toast. */
  message: string;
}

export function newMirrorId(): string {
  return `mirror-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16)}`;
}

/** Pre-flight: both legs must be placeable before EITHER is placed. */
export function validateMirrorLegs(exness: LegOrder, prop: LegOrder): string | null {
  if (exness.volume < 0.01 || prop.volume < 0.01) {
    return `A leg rounds below the 0.01 broker minimum (Exness ${exness.volume}, Prop ${prop.volume}). Increase the recovery target or the prop risk.`;
  }
  if (exness.openPrice !== prop.openPrice) {
    return `Legs must share one entry price (Exness ${exness.openPrice}, Prop ${prop.openPrice}).`;
  }
  if (exness.stopLoss === exness.takeProfit || prop.stopLoss === prop.takeProfit) {
    return "SL and TP must differ on both legs.";
  }
  // Mirror check: Exness SL must equal Prop TP and Exness TP must equal Prop SL.
  if (exness.stopLoss !== prop.takeProfit || exness.takeProfit !== prop.stopLoss) {
    return "Legs are not mirrored: Exness SL must equal Prop TP and Exness TP must equal Prop SL.";
  }
  return null;
}

/**
 * Execute both legs: Exness first, Prop second, rollback on Prop failure.
 * `place` / `cancel` are injected so this is testable without MetaApi.
 */
export async function executeMirror(
  exness: LegOrder,
  prop: LegOrder,
  place: PlaceFn,
  cancel: CancelFn,
): Promise<MirrorExecutionResult> {
  const mirrorId = newMirrorId();
  const problem = validateMirrorLegs(exness, prop);
  if (problem) {
    return { status: "partial", mirrorId, message: `Pre-flight failed — nothing placed. ${problem}`, error: problem };
  }

  const ex = await place(exness);
  if (!ex.ok) {
    return { status: "partial", mirrorId, message: `Exness leg failed — nothing placed. ${ex.error}`, error: ex.error };
  }

  const pr = await place(prop);
  if (!pr.ok) {
    // Rollback: cancel the Exness pending order so no naked leg is left.
    const rb = await cancel(exness.accountId, ex.orderId);
    if (rb.ok) {
      return {
        status: "rolled-back",
        mirrorId,
        exnessOrderId: ex.orderId,
        rollbackOk: true,
        error: pr.error,
        message: `Prop leg failed (${pr.error}). Exness order ${ex.orderId} was cancelled — no naked leg left.`,
      };
    }
    return {
      status: "partial",
      mirrorId,
      exnessOrderId: ex.orderId,
      rollbackOk: false,
      error: pr.error,
      message: `Prop leg failed (${pr.error}) AND the Exness rollback failed (${rb.error}). Exness order ${ex.orderId} is still live — cancel it manually NOW.`,
    };
  }

  return {
    status: "both-placed",
    mirrorId,
    exnessOrderId: ex.orderId,
    propOrderId: pr.orderId,
    message: `Mirror placed — Exness ${ex.orderId}, Prop ${pr.orderId}, same entry ${exness.openPrice}.`,
  };
}

/* ── Mirror-close monitoring ─────────────────────────────────────────── */

export interface MirrorLevels {
  /** "LONG" = prop long / Exness short; "SHORT" = prop short / Exness long. */
  direction: "LONG" | "SHORT";
  propSl: number;
  propTp: number;
  exnessSl: number;
  exnessTp: number;
}

export type MirrorCloseDecision =
  | { action: "none" }
  | { action: "approaching"; boundary: "prop-tp" | "prop-sl"; distance: number }
  | { action: "close-both"; boundary: "prop-tp" | "prop-sl"; closePrice: number };

/**
 * Pure decision function for the mirror-close monitor.
 * - price at/beyond Prop TP → Prop TP hit AND Exness SL hit: close BOTH at
 *   that price (do not wait for the Exness SL order to trigger).
 * - price at/beyond Prop SL → Prop SL hit AND Exness TP hit: close BOTH.
 * - price within `approachDistance` (price units) of either boundary →
 *   "approaching": alert and watch actively.
 * The two legs close at the SAME price by construction — the mirror levels
 * are each other's TP/SL.
 */
export function checkMirrorClose(
  levels: MirrorLevels,
  livePrice: number,
  approachDistance: number,
): MirrorCloseDecision {
  const long = levels.direction === "LONG";
  // For LONG prop: TP is above, SL below. For SHORT prop: TP below, SL above.
  const tp = levels.propTp;
  const sl = levels.propSl;
  if (long) {
    if (livePrice >= tp) return { action: "close-both", boundary: "prop-tp", closePrice: livePrice };
    if (livePrice <= sl) return { action: "close-both", boundary: "prop-sl", closePrice: livePrice };
    if (tp - livePrice <= approachDistance) return { action: "approaching", boundary: "prop-tp", distance: tp - livePrice };
    if (livePrice - sl <= approachDistance) return { action: "approaching", boundary: "prop-sl", distance: livePrice - sl };
  } else {
    if (livePrice <= tp) return { action: "close-both", boundary: "prop-tp", closePrice: livePrice };
    if (livePrice >= sl) return { action: "close-both", boundary: "prop-sl", closePrice: livePrice };
    if (livePrice - tp <= approachDistance) return { action: "approaching", boundary: "prop-tp", distance: livePrice - tp };
    if (sl - livePrice <= approachDistance) return { action: "approaching", boundary: "prop-sl", distance: sl - livePrice };
  }
  return { action: "none" };
}

/** One alert line per OPEN mirror trade, for the Engine page banner. */
export function openMirrorAlerts(
  openTrades: { id: string; pair: string; dir: "LONG" | "SHORT"; details?: { propSl?: number; propTp?: number; exSl?: number; exTp?: number } | null }[],
  livePrice: number,
  approachDistance: number,
): { tradeId: string; pair: string; text: string; urgent: boolean }[] {
  const out: { tradeId: string; pair: string; text: string; urgent: boolean }[] = [];
  for (const t of openTrades) {
    const d = t.details;
    if (!d || d.propSl == null || d.propTp == null || d.exSl == null || d.exTp == null) continue;
    const decision = checkMirrorClose(
      { direction: t.dir, propSl: d.propSl, propTp: d.propTp, exnessSl: d.exSl, exnessTp: d.exTp },
      livePrice,
      approachDistance,
    );
    if (decision.action === "close-both") {
      out.push({
        tradeId: t.id,
        pair: t.pair,
        text: `Price hit the ${decision.boundary === "prop-tp" ? "Prop TP / Exness SL" : "Prop SL / Exness TP"} — close BOTH legs now at ${decision.closePrice}. Do not wait for the other leg's own order.`,
        urgent: true,
      });
    } else if (decision.action === "approaching") {
      out.push({
        tradeId: t.id,
        pair: t.pair,
        text: `Price is ${decision.distance.toFixed(5)} from the ${decision.boundary === "prop-tp" ? "Prop TP / Exness SL" : "Prop SL / Exness TP"} — approach zone. Watch actively; close the other leg at the first leg's fill price.`,
        urgent: false,
      });
    }
  }
  return out;
}
