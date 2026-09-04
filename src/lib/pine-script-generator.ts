// @ts-nocheck
/**
 * Pine Script v5 Generator
 *
 * Converts SMC analysis results into Pine Script v5 code that plots:
 * - Order blocks (colored boxes)
 * - Fair Value Gaps (colored boxes)
 * - Swing highs/lows (labels)
 * - BOS/CHoCH markers
 * - Liquidity sweeps (arrows)
 * - Premium/Discount zone (background color)
 * - SMC Confluence Score (label)
 */

import type { SMCResult, StructureResult, OrderBlock, Sweep, FVG } from "./smc-engine";

export interface PineScriptConfig {
  showOrderBlocks: boolean;
  showFVG: boolean;
  showSwings: boolean;
  showSweeps: boolean;
  showZone: boolean;
  showConfluence: boolean;
  obLookback: number;
  fvgLookback: number;
  swingLookback: number;
}

export const DEFAULT_PINE_CONFIG: PineScriptConfig = {
  showOrderBlocks: true,
  showFVG: true,
  showSwings: true,
  showSweeps: true,
  showZone: true,
  showConfluence: true,
  obLookback: 10,
  fvgLookback: 15,
  swingLookback: 20,
};

/**
 * Generate complete Pine Script v5 indicator code from SMC analysis.
 */
export function generatePineScript(
  smc: SMCResult,
  symbol: string,
  config: PineScriptConfig = DEFAULT_PINE_CONFIG,
): string {
  const lines: string[] = [];

  // Header
  lines.push("//@version=5");
  lines.push(`indicator("SMC Analysis - ${symbol}", overlay=true, max_boxes_count=500, max_lines_count=500, max_labels_count=500)`);
  lines.push("");

  // Inputs
  lines.push("// ── Inputs ──────────────────────────────────────────────────────");
  if (config.showOrderBlocks) {
    lines.push(`showOB = input.bool(true, "Show Order Blocks", group="SMC Components")`);
    lines.push(`obBullColor = input.color(color.new(color.green, 70), "Bullish OB Color", group="SMC Components")`);
    lines.push(`obBearColor = input.color(color.new(color.red, 70), "Bearish OB Color", group="SMC Components")`);
    lines.push(`obImpulseMin = input.float(1.5, "Min OB Impulse (ATR)", minval=0.5, maxval=5.0, step=0.5, group="SMC Components")`);
    lines.push(`obMitigation = input.bool(false, "Show Mitigated OBs", group="SMC Components")`);
    lines.push("");
  }
  if (config.showFVG) {
    lines.push(`showFVG = input.bool(true, "Show Fair Value Gaps", group="SMC Components")`);
    lines.push(`fvgBullColor = input.color(color.new(color.teal, 60), "Bullish FVG Color", group="SMC Components")`);
    lines.push(`fvgBearColor = input.color(color.new(color.maroon, 60), "Bearish FVG Color", group="SMC Components")`);
    lines.push("");
  }
  if (config.showSwings) {
    lines.push(`showSwings = input.bool(true, "Show Swings", group="SMC Components")`);
    lines.push(`swingLen = input.int(3, "Swing Lookback", minval=2, maxval=10, group="SMC Components")`);
    lines.push("");
  }
  if (config.showSweeps) {
    lines.push(`showSweeps = input.bool(true, "Show Liquidity Sweeps", group="SMC Components")`);
    lines.push("");
  }
  if (config.showZone) {
    lines.push(`showZone = input.bool(true, "Show Premium/Discount Zone", group="SMC Components")`);
    lines.push(`zoneLen = input.int(50, "Zone Lookback", minval=20, maxval=200, group="SMC Components")`);
    lines.push("");
  }
  lines.push(`atrLen = input.int(14, "ATR Length", group="Indicators")`);
  lines.push("");

  // ATR calculation
  lines.push("// ── ATR ─────────────────────────────────────────────────────────");
  lines.push("atr = ta.atr(atrLen)");
  lines.push("");

  // ── Swing Detection ──────────────────────────────────────────────────
  if (config.showSwings) {
    lines.push("// ── Swing Detection ─────────────────────────────────────────────");
    lines.push("swingHigh = ta.pivot(high, swingLen, swingLen)");
    lines.push("swingLow = ta.pivot(low, swingLen, swingLen)");
    lines.push("");
    lines.push("// Plot swings");
    lines.push("plotshape(showSwings and swingHigh, " +
      'title="Swing High", text="SH", ' +
      "location=location.abovebar, color=color.new(color.red, 50), " +
      "textcolor=color.red, size=size.tiny, offset=-swingLen)");
    lines.push("plotshape(showSwings and swingLow, " +
      'title="Swing Low", text="SL", ' +
      "location=location.belowbar, color=color.new(color.green, 50), " +
      "textcolor=color.green, size=size.tiny, offset=-swingLen)");
    lines.push("");
  }

  // ── Order Blocks ────────────────────────────────────────────────────
  if (config.showOrderBlocks) {
    lines.push("// ── Order Blocks ────────────────────────────────────────────────");
    lines.push("// Bullish OB: last bearish candle before impulsive bull move");
    lines.push("bearishCandle = close < open");
    lines.push("bullishImpulse = (close - low[1]) >= obImpulseMin * atr");
    lines.push("bullishOB = bearishCandle and bullishImpulse");
    lines.push("");
    lines.push("// Bearish OB: last bullish candle before impulsive bear move");
    lines.push("bullishCandle = close > open");
    lines.push("bearishImpulse = (high[1] - close) >= obImpulseMin * atr");
    lines.push("bearishOB = bullishCandle and bearishImpulse");
    lines.push("");
    lines.push("// Draw OB boxes");
    lines.push("var box[] bullBoxes = array.new_box()");
    lines.push("var box[] bearBoxes = array.new_box()");
    lines.push("");
    lines.push("if showOB and bullishOB");
    lines.push("    bx = box.new(bar_index - 1, high[1], bar_index + 20, low[1], " +
      "bgcolor=obBullColor, border_color=color.green, border_width=1)");
    lines.push("    label.new(bar_index - 1, low[1], " +
      'text="OB+", style=label.style_label_up, ' +
      "color=color.new(color.green, 80), textcolor=color.green, size=size.tiny)");
    lines.push("    array.push(bullBoxes, bx)");
    lines.push("");
    lines.push("if showOB and bearishOB");
    lines.push("    bx = box.new(bar_index - 1, high[1], bar_index + 20, low[1], " +
      "bgcolor=obBearColor, border_color=color.red, border_width=1)");
    lines.push("    label.new(bar_index - 1, high[1], " +
      'text="OB-", style=label.style_label_down, ' +
      "color=color.new(color.red, 80), textcolor=color.red, size=size.tiny)");
    lines.push("    array.push(bearBoxes, bx)");
    lines.push("");
    lines.push("// Clean old boxes (keep last N)");
    lines.push("while array.size(bullBoxes) > 10");
    lines.push("    box.delete(array.shift(bullBoxes))");
    lines.push("while array.size(bearBoxes) > 10");
    lines.push("    box.delete(array.shift(bearBoxes))");
    lines.push("");
  }

  // ── Fair Value Gaps ─────────────────────────────────────────────────
  if (config.showFVG) {
    lines.push("// ── Fair Value Gaps ─────────────────────────────────────────────");
    lines.push("// Bullish FVG: low[1] > high[2]");
    lines.push("bullishFVG = low[1] > high[2]");
    lines.push("bullFVG_low = high[2]");
    lines.push("bullFVG_high = low[1]");
    lines.push("");
    lines.push("// Bearish FVG: high[1] < low[2]");
    lines.push("bearishFVG = high[1] < low[2]");
    lines.push("bearFVG_low = high[1]");
    lines.push("bearFVG_high = low[2]");
    lines.push("");
    lines.push("// Draw FVG boxes");
    lines.push("var box[] bullFVGs = array.new_box()");
    lines.push("var box[] bearFVGs = array.new_box()");
    lines.push("");
    lines.push("if showFVG and bullishFVG");
    lines.push("    bx = box.new(bar_index - 1, bullFVG_high, bar_index + 30, bullFVG_low, " +
      "bgcolor=fvgBullColor, border_color=color.teal, border_width=1, border_style=line.style_dashed)");
    lines.push("    label.new(bar_index - 1, bullFVG_low, " +
      'text="FVG+", style=label.style_label_up, ' +
      "color=color.new(color.teal, 80), textcolor=color.teal, size=size.tiny)");
    lines.push("    array.push(bullFVGs, bx)");
    lines.push("");
    lines.push("if showFVG and bearishFVG");
    lines.push("    bx = box.new(bar_index - 1, bearFVG_high, bar_index + 30, bearFVG_low, " +
      "bgcolor=fvgBearColor, border_color=color.maroon, border_width=1, border_style=line.style_dashed)");
    lines.push("    label.new(bar_index - 1, bearFVG_high, " +
      'text="FVG-", style=label.style_label_down, ' +
      "color=color.new(color.maroon, 80), textcolor=color.maroon, size=size.tiny)");
    lines.push("    array.push(bearFVGs, bx)");
    lines.push("");
    lines.push("// Clean old FVGs (keep last N)");
    lines.push("while array.size(bullFVGs) > 15");
    lines.push("    box.delete(array.shift(bullFVGs))");
    lines.push("while array.size(bearFVGs) > 15");
    lines.push("    box.delete(array.shift(bearFVGs))");
    lines.push("");
  }

  // ── Liquidity Sweeps ────────────────────────────────────────────────
  if (config.showSweeps) {
    lines.push("// ── Liquidity Sweeps ────────────────────────────────────────────");
    lines.push("// Bullish sweep: low pierces recent swing low but close > swing low");
    lines.push("recentSwingLow = ta.valuewhen(swingLow, low[swingLen], 0)");
    lines.push("bullishSweep = low < recentSwingLow and close > recentSwingLow");
    lines.push("");
    lines.push("// Bearish sweep: high pierces recent swing high but close < swing high");
    lines.push("recentSwingHigh = ta.valuewhen(swingHigh, high[swingLen], 0)");
    lines.push("bearishSweep = high > recentSwingHigh and close < recentSwingHigh");
    lines.push("");
    lines.push("plotshape(showSweeps and bullishSweep, " +
      'title="Bullish Sweep", text="SWP+", ' +
      "location=location.belowbar, color=color.new(color.lime, 30), " +
      "textcolor=color.lime, size=size.small, style=shape.triangleup)");
    lines.push("plotshape(showSweeps and bearishSweep, " +
      'title="Bearish Sweep", text="SWP-", ' +
      "location=location.abovebar, color=color.new(color.orange, 30), " +
      "textcolor=color.orange, size=size.small, style=shape.triangledown)");
    lines.push("");
  }

  // ── Premium / Discount Zone ─────────────────────────────────────────
  if (config.showZone) {
    lines.push("// ── Premium / Discount Zone ─────────────────────────────────────");
    lines.push("zoneHigh = ta.highest(high, zoneLen)");
    lines.push("zoneLow = ta.lowest(low, zoneLen)");
    lines.push("zoneMid = (zoneHigh + zoneLow) / 2");
    lines.push("");
    lines.push("inPremium = close >= zoneMid");
    lines.push("zoneColor = inPremium ? color.new(color.red, 95) : color.new(color.green, 95)");
    lines.push('bgcolor(showZone ? zoneColor : na, title="Premium/Discount Background")');
    lines.push("");
    lines.push("// Zone lines");
    lines.push(`plot(showZone ? zoneHigh : na, title="Zone High", color=color.new(color.red, 70), linewidth=1, style=plot.style_stepline)`);
    lines.push(`plot(showZone ? zoneLow : na, title="Zone Low", color=color.new(color.green, 70), linewidth=1, style=plot.style_stepline)`);
    lines.push(`plot(showZone ? zoneMid : na, title="Zone Mid (0.5 Fib)", color=color.new(color.gray, 80), linewidth=1, style=plot.style_circles)`);
    lines.push("");
  }

  // ── BOS / CHoCH Detection ──────────────────────────────────────────
  lines.push("// ── BOS / CHoCH ────────────────────────────────────────────────");
  lines.push("// Note: Simplified detection. Full structure tracking requires");
  lines.push("// more complex state management in Pine Script.");
  lines.push("var float lastSwingHigh = na");
  lines.push("var float lastSwingLow = na");
  lines.push("");
  lines.push("if not na(swingHigh)");
  lines.push("    lastSwingHigh := high[swingLen]");
  lines.push("if not na(swingLow)");
  lines.push("    lastSwingLow := low[swingLen]");
  lines.push("");
  lines.push("// BOS: close breaks prior swing in direction of bias");
  lines.push("bosUp = close > lastSwingHigh and not na(lastSwingHigh)");
  lines.push("bosDown = close < lastSwingLow and not na(lastSwingLow)");
  lines.push("");
  lines.push(`plotshape(bosUp, title="BOS Up", text="BOS+", location=location.belowbar, color=color.new(color.green, 0), textcolor=color.green, size=size.normal, style=shape.flag)`);
  lines.push(`plotshape(bosDown, title="BOS Down", text="BOS-", location=location.abovebar, color=color.new(color.red, 0), textcolor=color.red, size=size.normal, style=shape.flag)`);
  lines.push("");

  // ── Confluence Score (simplified) ───────────────────────────────────
  if (config.showConfluence) {
    lines.push("// ── Confluence Score (Simplified) ───────────────────────────────");
    lines.push("// Counts bullish vs bearish signals for quick reference");
    lines.push("bullSignals = (bullishOB ? 1 : 0) + (bullishFVG ? 1 : 0) + (bullishSweep ? 1 : 0) + (bosUp ? 1 : 0)");
    lines.push("bearSignals = (bearishOB ? 1 : 0) + (bearishFVG ? 1 : 0) + (bearishSweep ? 1 : 0) + (bosDown ? 1 : 0)");
    lines.push("netScore = bullSignals - bearSignals");
    lines.push("");
    lines.push("// Display score in a label on last bar");
    lines.push("if barstate.islast");
    lines.push(`    labelText = "SMC Score: " + str.tostring(netScore) + `);
    lines.push(`                     "\\nBull: " + str.tostring(bullSignals) + `);
    lines.push(`                     "\\nBear: " + str.tostring(bearSignals)`);
    lines.push("    label.new(bar_index, high, labelText, " +
      "style=label.style_label_down, color=color.new(color.blue, 60), " +
      "textcolor=color.white, size=size.normal)");
    lines.push("");
  }

  // ── Info Table ──────────────────────────────────────────────────────
  lines.push("// ── Info Table ──────────────────────────────────────────────────");
  lines.push("var table infoTable = table.new(position.top_right, 2, 6, bgcolor=color.new(color.black, 80))");
  lines.push("if barstate.islast");
  lines.push(`    table.cell(infoTable, 0, 0, "SMC Analysis", text_color=color.white, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 1, 0, "${symbol}", text_color=color.yellow, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 0, 1, "Bias", text_color=color.white, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 1, 1, "${smc.structure.bias}", text_color=${smc.structure.bias === "bullish" ? "color.green" : smc.structure.bias === "bearish" ? "color.red" : "color.gray"}, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 0, 2, "Zone", text_color=color.white, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 1, 2, "${smc.zone.zone}", text_color=${smc.zone.zone === "discount" ? "color.green" : smc.zone.zone === "premium" ? "color.red" : "color.gray"}, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 0, 3, "BOS", text_color=color.white, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 1, 3, "${smc.structure.bos ?? "None"}", text_color=${smc.structure.bos === "bullish" ? "color.green" : smc.structure.bos === "bearish" ? "color.red" : "color.gray"}, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 0, 4, "CHoCH", text_color=color.white, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 1, 4, "${smc.structure.choch ?? "None"}", text_color=${smc.structure.choch === "bullish" ? "color.green" : smc.structure.choch === "bearish" ? "color.red" : "color.gray"}, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 0, 5, "Score", text_color=color.white, text_size=size.tiny)`);
  lines.push(`    table.cell(infoTable, 1, 5, str.tostring(netScore), text_color=netScore > 0 ? color.green : netScore < 0 ? color.red : color.gray, text_size=size.tiny)`);
  lines.push("");

  // ── Alerts ──────────────────────────────────────────────────────────
  lines.push("// ── Alerts ──────────────────────────────────────────────────────");
  lines.push('alertcondition(bullishOB, title="Bullish Order Block", message="Bullish OB detected on {{ticker}}")');
  lines.push('alertcondition(bearishOB, title="Bearish Order Block", message="Bearish OB detected on {{ticker}}")');
  lines.push('alertcondition(bullishFVG, title="Bullish FVG", message="Bullish FVG detected on {{ticker}}")');
  lines.push('alertcondition(bearishFVG, title="Bearish FVG", message="Bearish FVG detected on {{ticker}}")');
  lines.push('alertcondition(bullishSweep, title="Bullish Sweep", message="Bullish liquidity sweep on {{ticker}}")');
  lines.push('alertcondition(bearishSweep, title="Bearish Sweep", message="Bearish liquidity sweep on {{ticker}}")');
  lines.push('alertcondition(bosUp, title="BOS Up", message="Bullish BOS on {{ticker}}")');
  lines.push('alertcondition(bosDown, title="BOS Down", message="Bearish BOS on {{ticker}}")');
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate a short summary of what the Pine Script plots.
 */
export function getPineScriptSummary(config: PineScriptConfig = DEFAULT_PINE_CONFIG): string {
  const items: string[] = [];
  if (config.showOrderBlocks) items.push("Order Boxes (OB+/OB-)");
  if (config.showFVG) items.push("Fair Value Gaps (FVG+/FVG-)");
  if (config.showSwings) items.push("Swing Highs/Lows (SH/SL)");
  if (config.showSweeps) items.push("Liquidity Sweeps (SWP+/SWP-)");
  if (config.showZone) items.push("Premium/Discount Zone (background)");
  if (config.showConfluence) items.push("Confluence Score (label)");
  return items.join(", ");
}
