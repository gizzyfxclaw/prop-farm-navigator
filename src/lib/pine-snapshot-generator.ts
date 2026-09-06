import type { SmcChannel, DrawableLevels } from "./smc-drawings";

/**
 * Turns one specific Hermes SMC analysis result into a Pine Script v5 script
 * that draws EXACTLY what "Hermes's Marked-Up Chart" shows on the SMC page
 * (same source: buildSmcDrawings()) — the parallel channel, retest markers,
 * order-block zones, and entry/SL/TP lines — onto a real TradingView chart.
 *
 * This is a frozen snapshot, not a live indicator: all coordinates are the
 * literal price/time values from this one analysis, baked into the script
 * text. It will not recompute or move as new bars form — re-export and
 * re-paste after the next "Analyze Now" / Hermes review to refresh it.
 */

export interface SnapshotOrderBlock {
  low: number;
  high: number;
  kind: string;
  time?: number;
}

export interface SnapshotStructure {
  bias: string;
  orderBlocks: SnapshotOrderBlock[];
  trendline?: {
    highs: Array<{ time: number; price: number }>;
    lows: Array<{ time: number; price: number }>;
  };
}

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

function rgb(hex: string, transparency = 0): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7),16);
  return transparency ? `color.rgb(${r}, ${g}, ${b}, ${transparency})` : `color.rgb(${r}, ${g}, ${b})`;
}

/** Bar `time` fields across this codebase are UNIX seconds; Pine's xloc.bar_time wants milliseconds. */
const ms = (seconds: number) => Math.round(seconds * 1000);

export function generateSnapshotPineScript(
  pair: string,
  timeframe: string,
  structure: SnapshotStructure | undefined,
  levels: DrawableLevels | undefined,
  channel: SmcChannel | undefined,
): string {
  const lines: string[] = [];
  const barMs = INTERVAL_MS[timeframe] ?? INTERVAL_MS["1h"]!;
  const drawLines: string[] = [];

  lines.push("//@version=5");
  lines.push(`indicator("Hermes Snapshot — ${pair} ${timeframe}", overlay=true, max_lines_count=200, max_boxes_count=200, max_labels_count=200)`);
  lines.push("");
  lines.push("// Frozen snapshot of one Hermes SMC analysis — channel, order blocks,");
  lines.push("// retests and entry/SL/TP, drawn exactly where Hermes drew them.");
  lines.push("// Fixed price/time values — this will NOT update as new bars form.");
  lines.push("");

  if (channel && channel.type !== "none" && channel.baseLine && channel.breakoutLine) {
    const dirHex = channel.direction === "long" ? "#22c55e" : "#ef4444";
    const [b1, b2] = channel.baseLine;
    const [k1, k2] = channel.breakoutLine;
    drawLines.push(
      `line.new(x1=${ms(b1.time)}, y1=${b1.price}, x2=${ms(b2.time)}, y2=${b2.price}, xloc=xloc.bar_time, extend=extend.right, color=${rgb("#60a5fa")}, style=line.style_dashed, width=1)`,
    );
    drawLines.push(
      `line.new(x1=${ms(k1.time)}, y1=${k1.price}, x2=${ms(k2.time)}, y2=${k2.price}, xloc=xloc.bar_time, extend=extend.right, color=${rgb(dirHex)}, style=line.style_solid, width=2)`,
    );
    drawLines.push(
      `label.new(x=${ms(k2.time)}, y=${k2.price}, xloc=xloc.bar_time, text="Breakout boundary (${channel.retestCount} retest${channel.retestCount === 1 ? "" : "s"})", style=label.style_label_left, color=${rgb(dirHex)}, textcolor=color.white, size=size.small)`,
    );
    for (const r of channel.retests.slice(-8)) {
      drawLines.push(
        `label.new(x=${ms(r.time)}, y=${r.price}, xloc=xloc.bar_time, text="retest", style=${channel.direction === "long" ? "label.style_label_up" : "label.style_label_down"}, color=${rgb(dirHex)}, textcolor=color.white, size=size.tiny)`,
      );
    }
  } else if (structure?.trendline) {
    const bias = structure.bias;
    const side = bias === "bullish" ? structure.trendline.lows : bias === "bearish" ? structure.trendline.highs : null;
    if (side && side.length === 2) {
      const hex = bias === "bullish" ? "#22c55e" : "#ef4444";
      drawLines.push(
        `line.new(x1=${ms(side[0]!.time)}, y1=${side[0]!.price}, x2=${ms(side[1]!.time)}, y2=${side[1]!.price}, xloc=xloc.bar_time, extend=extend.right, color=${rgb(hex)}, style=line.style_solid, width=2)`,
      );
    }
  }

  for (const ob of (structure?.orderBlocks ?? []).slice(-3)) {
    if (ob.time == null) continue;
    const bull = ob.kind === "bullish";
    const border = bull ? "#22c55e" : "#ef4444";
    const left = ms(ob.time);
    const right = left + barMs * 20;
    drawLines.push(
      `box.new(left=${left}, top=${ob.high}, right=${right}, bottom=${ob.low}, xloc=xloc.bar_time, extend=extend.right, bgcolor=${rgb(border, 85)}, border_color=${rgb(border)}, border_width=1, text="${bull ? "OB+" : "OB-"}", text_color=color.white, text_size=size.tiny, text_valign=${bull ? "text.align_bottom" : "text.align_top"})`,
    );
  }

  if (drawLines.length > 0) {
    lines.push("// ── Drawn once, on the last bar ────────────────────────────────");
    lines.push("if barstate.islast");
    for (const d of drawLines) lines.push(`    ${d}`);
    lines.push("");
  }

  // hline() must run unconditionally on every bar — it can't live inside `if barstate.islast`.
  if (levels) {
    const dir = levels.direction ?? undefined;
    lines.push("// ── Entry / SL / TP — constant across the whole chart ──────────");
    if (levels.entry != null) {
      lines.push(`hline(${levels.entry}, title="Entry${dir ? " " + dir.toUpperCase() : ""}", color=${rgb("#f59e0b")}, linestyle=hline.style_solid, linewidth=1)`);
    }
    if (levels.stopLoss != null) {
      lines.push(`hline(${levels.stopLoss}, title="Stop Loss", color=${rgb("#ef4444")}, linestyle=hline.style_dashed, linewidth=1)`);
    }
    if (levels.takeProfit1 != null) {
      lines.push(`hline(${levels.takeProfit1}, title="TP1", color=${rgb("#3b82f6")}, linestyle=hline.style_dashed, linewidth=1)`);
    }
    if (levels.takeProfit2 != null) {
      lines.push(`hline(${levels.takeProfit2}, title="TP2", color=${rgb("#3b82f6")}, linestyle=hline.style_dotted, linewidth=1)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
