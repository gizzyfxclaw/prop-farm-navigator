import type { Drawing } from "@/components/terminal/lwchart";

/**
 * Shared between the SMC Analysis page and the Trading Agent page so both
 * render Hermes's channel/levels the same way — the actual parallel channel
 * (base line + breakout boundary) the GizzyFx strategy is built on, retest
 * markers, order-block zones, entry/SL/TP price lines, and a long/short
 * marker on the latest bar.
 */

export interface SmcTrendlinePoint {
  time: number;
  price: number;
}

export interface SmcStructure {
  bias: string;
  orderBlocks: Array<{ low: number; high: number; kind: string; impulseMag: number }>;
  trendline?: {
    highs: SmcTrendlinePoint[];
    lows: SmcTrendlinePoint[];
  };
}

/** Mirrors the API's `Channel` shape (src/routes/api/smc-analyze.ts). */
export interface SmcChannel {
  type: "ascending" | "descending" | "none";
  direction: "long" | "short" | "neutral";
  baseLine: [SmcTrendlinePoint, SmcTrendlinePoint] | null;
  breakoutLine: [SmcTrendlinePoint, SmcTrendlinePoint] | null;
  breakoutBoundary: number;
  retestCount: number;
  retests: SmcTrendlinePoint[];
}

export interface DrawableLevels {
  direction?: string | null;
  entry?: number | null;
  stopLoss?: number | null;
  takeProfit1?: number | null;
  takeProfit2?: number | null;
}

export function buildSmcDrawings(
  structure: SmcStructure | undefined,
  levels: DrawableLevels | undefined,
  lastBarTime: number | undefined,
  channel?: SmcChannel | undefined,
): Drawing[] {
  const drawings: Drawing[] = [];

  if (channel && channel.type !== "none" && channel.baseLine && channel.breakoutLine) {
    const dirColor = channel.direction === "long" ? "#22c55e" : "#ef4444";
    // The anchor line the channel is drawn from (support for an ascending
    // channel, resistance for a descending one) — drawn muted/blue since
    // it's context, not the tradeable level.
    drawings.push({
      type: "trendline",
      p1time: channel.baseLine[0].time, p1price: channel.baseLine[0].price,
      p2time: channel.baseLine[1].time, p2price: channel.baseLine[1].price,
      color: "#60a5fa",
      style: "dashed",
      label: `${channel.type} channel base`,
    });
    // The actual breakout boundary — the tradeable level.
    drawings.push({
      type: "trendline",
      p1time: channel.breakoutLine[0].time, p1price: channel.breakoutLine[0].price,
      p2time: channel.breakoutLine[1].time, p2price: channel.breakoutLine[1].price,
      color: dirColor,
      label: `Breakout boundary (${channel.retestCount} retest${channel.retestCount === 1 ? "" : "s"})`,
    });
    for (const r of channel.retests.slice(-8)) {
      drawings.push({
        type: "marker",
        time: r.time,
        position: channel.direction === "long" ? "aboveBar" : "belowBar",
        markerType: "circle",
        color: dirColor,
        label: "retest",
      });
    }
  } else if (structure?.trendline) {
    // Fallback when there's no valid channel yet — the generic swing
    // trendline still gives some visual context for the raw bias.
    const bias = structure.bias;
    const side = bias === "bullish" ? structure.trendline.lows : bias === "bearish" ? structure.trendline.highs : null;
    if (side && side.length === 2) {
      drawings.push({
        type: "trendline",
        p1time: side[0]!.time, p1price: side[0]!.price,
        p2time: side[1]!.time, p2price: side[1]!.price,
        color: bias === "bullish" ? "#22c55e" : "#ef4444",
        label: `${bias} trend`,
      });
    }
  }

  for (const ob of (structure?.orderBlocks ?? []).slice(-3)) {
    drawings.push({
      type: "zone",
      topPrice: ob.high, bottomPrice: ob.low,
      color: ob.kind === "bullish" ? "#22c55e" : "#ef4444",
      label: `${ob.kind} OB`,
    });
  }

  if (levels) {
    const dir = levels.direction ?? undefined;
    if (levels.entry != null) {
      drawings.push({ type: "hline", price: levels.entry, color: "#f59e0b", label: `Entry${dir ? " " + dir.toUpperCase() : ""}` });
    }
    if (levels.stopLoss != null) {
      drawings.push({ type: "hline", price: levels.stopLoss, color: "#ef4444", style: "dashed", label: "Stop Loss" });
    }
    if (levels.takeProfit1 != null) {
      drawings.push({ type: "hline", price: levels.takeProfit1, color: "#3b82f6", style: "dashed", label: "TP1" });
    }
    if (levels.takeProfit2 != null) {
      drawings.push({ type: "hline", price: levels.takeProfit2, color: "#3b82f6", style: "dotted", label: "TP2" });
    }
    if (lastBarTime != null && (dir === "long" || dir === "short")) {
      drawings.push({
        type: "marker",
        time: lastBarTime,
        position: dir === "long" ? "belowBar" : "aboveBar",
        markerType: dir === "long" ? "arrowUp" : "arrowDown",
        color: dir === "long" ? "#22c55e" : "#ef4444",
        label: dir.toUpperCase(),
      });
    }
  }

  return drawings;
}
