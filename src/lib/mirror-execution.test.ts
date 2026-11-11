import { describe, expect, it } from "vitest";
import {
  checkMirrorClose,
  executeMirror,
  openMirrorAlerts,
  validateMirrorLegs,
  type CancelFn,
  type LegOrder,
  type PlaceFn,
} from "./mirror-execution";

const exnessLeg = (over: Partial<LegOrder> = {}): LegOrder => ({
  accountId: "ex",
  actionType: "ORDER_TYPE_BUY_STOP",
  symbol: "EURUSD",
  volume: 1.59,
  openPrice: 1.085,
  stopLoss: 1.091,
  takeProfit: 1.082,
  ...over,
});

const propLeg = (over: Partial<LegOrder> = {}): LegOrder => ({
  accountId: "prop",
  actionType: "ORDER_TYPE_SELL_STOP",
  symbol: "EURUSD",
  volume: 0.17,
  openPrice: 1.085,
  stopLoss: 1.082,
  takeProfit: 1.091,
  ...over,
});

describe("validateMirrorLegs", () => {
  it("accepts a properly mirrored pair", () => {
    expect(validateMirrorLegs(exnessLeg(), propLeg())).toBeNull();
  });

  it("rejects legs below the 0.01 minimum", () => {
    expect(validateMirrorLegs(exnessLeg(), propLeg({ volume: 0.005 }))).toMatch(/below the 0.01/);
  });

  it("rejects different entry prices", () => {
    expect(validateMirrorLegs(exnessLeg(), propLeg({ openPrice: 1.086 }))).toMatch(/share one entry price/);
  });

  it("rejects non-mirrored SL/TP", () => {
    expect(validateMirrorLegs(exnessLeg(), propLeg({ takeProfit: 1.09 }))).toMatch(/not mirrored/);
  });
});

describe("executeMirror", () => {
  it("places Exness first, then Prop, and returns both orderIds", async () => {
    const order: string[] = [];
    const place: PlaceFn = async (leg) => {
      order.push(leg.accountId);
      return { ok: true, orderId: `ord-${leg.accountId}` };
    };
    const cancel: CancelFn = async () => ({ ok: true });
    const res = await executeMirror(exnessLeg(), propLeg(), place, cancel);
    expect(res.status).toBe("both-placed");
    expect(order).toEqual(["ex", "prop"]);
    expect(res.exnessOrderId).toBe("ord-ex");
    expect(res.propOrderId).toBe("ord-prop");
    expect(res.mirrorId).toMatch(/^mirror-/);
  });

  it("rolls back the Exness leg when the Prop leg fails", async () => {
    const cancelled: string[] = [];
    const place: PlaceFn = async (leg) =>
      leg.accountId === "ex" ? { ok: true, orderId: "ord-ex" } : { ok: false, error: "insufficient margin" };
    const cancel: CancelFn = async (_accountId, orderId) => {
      cancelled.push(orderId);
      return { ok: true };
    };
    const res = await executeMirror(exnessLeg(), propLeg(), place, cancel);
    expect(res.status).toBe("rolled-back");
    expect(res.rollbackOk).toBe(true);
    expect(cancelled).toEqual(["ord-ex"]);
    expect(res.message).toMatch(/cancelled/);
  });

  it("says so loudly when the rollback itself fails — manual cancel required", async () => {
    const place: PlaceFn = async (leg) =>
      leg.accountId === "ex" ? { ok: true, orderId: "ord-ex" } : { ok: false, error: "prop rejected" };
    const cancel: CancelFn = async () => ({ ok: false, error: "cancel rejected" });
    const res = await executeMirror(exnessLeg(), propLeg(), place, cancel);
    expect(res.status).toBe("partial");
    expect(res.rollbackOk).toBe(false);
    expect(res.message).toMatch(/cancel it manually NOW/);
  });

  it("places nothing when pre-flight fails", async () => {
    let placed = 0;
    const place: PlaceFn = async () => {
      placed += 1;
      return { ok: true, orderId: "x" };
    };
    const cancel: CancelFn = async () => ({ ok: true });
    const res = await executeMirror(exnessLeg(), propLeg({ volume: 0.005 }), place, cancel);
    expect(res.status).toBe("partial");
    expect(placed).toBe(0);
  });
});

describe("checkMirrorClose", () => {
  const levels = { direction: "LONG" as const, propSl: 1.082, propTp: 1.091, exnessSl: 1.091, exnessTp: 1.082 };

  it("close-both at Prop TP (which is also Exness SL)", () => {
    const d = checkMirrorClose(levels, 1.0915, 0.001);
    expect(d.action).toBe("close-both");
    if (d.action === "close-both") {
      expect(d.boundary).toBe("prop-tp");
      expect(d.closePrice).toBe(1.0915);
    }
  });

  it("close-both at Prop SL (which is also Exness TP)", () => {
    const d = checkMirrorClose(levels, 1.0815, 0.001);
    expect(d.action).toBe("close-both");
    if (d.action === "close-both") expect(d.boundary).toBe("prop-sl");
  });

  it("approaching within the zone, none further away", () => {
    expect(checkMirrorClose(levels, 1.0905, 0.001).action).toBe("approaching");
    expect(checkMirrorClose(levels, 1.086, 0.001).action).toBe("none");
  });

  it("works mirrored for SHORT prop trades", () => {
    const short = { direction: "SHORT" as const, propSl: 1.091, propTp: 1.082, exnessSl: 1.082, exnessTp: 1.091 };
    expect(checkMirrorClose(short, 1.0815, 0.001).action).toBe("close-both");
    expect(checkMirrorClose(short, 1.086, 0.001).action).toBe("none");
  });
});

describe("openMirrorAlerts", () => {
  it("flags an OPEN trade in the approach zone", () => {
    const alerts = openMirrorAlerts(
      [{ id: "1", pair: "EURUSD", dir: "LONG", details: { propSl: 1.082, propTp: 1.091, exSl: 1.091, exTp: 1.082 } }],
      1.0905,
      0.001,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.urgent).toBe(false);
    expect(alerts[0]!.text).toMatch(/approach zone/);
  });

  it("flags an OPEN trade whose boundary was hit as urgent", () => {
    const alerts = openMirrorAlerts(
      [{ id: "1", pair: "EURUSD", dir: "LONG", details: { propSl: 1.082, propTp: 1.091, exSl: 1.091, exTp: 1.082 } }],
      1.092,
      0.001,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.urgent).toBe(true);
    expect(alerts[0]!.text).toMatch(/close BOTH legs now/);
  });

  it("ignores trades without full mirror levels", () => {
    const alerts = openMirrorAlerts([{ id: "1", pair: "EURUSD", dir: "LONG", details: {} }], 1.09, 0.001);
    expect(alerts).toHaveLength(0);
  });
});
