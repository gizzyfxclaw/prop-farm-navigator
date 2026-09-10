/**
 * Strategy Pine Script — full editable Pine Script code generator
 * Shows Pine Script for the selected strategy, lets you customize it,
 * and applies changes to regenerate the analysis.
 */

import { useState, useEffect, useCallback } from "react";
import { StrategySelector } from "./StrategySelector";

interface StrategyPineScriptProps {
  pair: string;
  timeframe: string;
  strategy: string;
  onApply: (code: string) => void;
  onAnalyze: () => void;
}

// ── Strategy Pine Script Templates ──────────────────────────────────

function generateChannelBreakoutPine(pair: string, timeframe: string): string {
  return `//@version=5
indicator("GizzyFx Channel Breakout — ${pair} ${timeframe}", overlay=true, max_lines_count=200, max_boxes_count=200, max_labels_count=200)

// ── Inputs ──
swingLen = input.int(5, "Swing Lookback", minval=2, maxval=10)
atrLen = input.int(14, "ATR Period", minval=5, maxval=50)
retestMin = input.int(2, "Min Retests", minval=1, maxval=5)
slPips = input.float(30, "Stop Loss (pips)", minval=10, maxval=100)
tp1RR = input.float(1.5, "TP1 R:R", minval=1.0, maxval=5.0)
tp2RR = input.float(2.0, "TP2 R:R", minval=1.0, maxval=5.0)
bufferPips = input.float(2, "Entry Buffer (pips)", minval=0, maxval=10)

// ── Calculations ──
atr = ta.atr(atrLen)
swingHigh = ta.highest(high, swingLen)
swingLow = ta.lowest(low, swingLen)

// ── Channel Detection ──
var float boundary = na
var int retestCount = 0

if high > swingHigh[1]
    boundary := high
    retestCount := 0
else if math.abs(high - boundary) <= atr * 0.5
    retestCount += 1

// ── Entry Logic ──
longCondition = close > boundary and retestCount >= retestMin
shortCondition = close < boundary and retestCount >= retestMin

// ── Plotting ──
plot(boundary, "Breakout Boundary", color=color.blue, linewidth=2)

if longCondition
    entryPrice = close + bufferPips * syminfo.mintick
    sl = entryPrice - slPips * syminfo.mintick
    tp1 = entryPrice + (entryPrice - sl) * tp1RR
    tp2 = entryPrice + (entryPrice - sl) * tp2RR
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.green, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp1, bar_index + 20, tp1, color=color.blue, width=1)

if shortCondition
    entryPrice = close - bufferPips * syminfo.mintick
    sl = entryPrice + slPips * syminfo.mintick
    tp1 = entryPrice - (sl - entryPrice) * tp1RR
    tp2 = entryPrice - (sl - entryPrice) * tp2RR
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.red, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp1, bar_index + 20, tp1, color=color.blue, width=1)

// ── Alerts ──
alertcondition(longCondition, "Channel Breakout LONG", "Long entry on ${pair}")
alertcondition(shortCondition, "Channel Breakout SHORT", "Short entry on ${pair}")
`;
}

function generateAsiaSweepPine(pair: string, timeframe: string): string {
  return `//@version=5
indicator("Asia Sweep Reversals — ${pair} ${timeframe}", overlay=true, max_lines_count=200, max_boxes_count=200, max_labels_count=200)

// ── Inputs ──
pivotLen = input.int(5, "Pivot Length", minval=2, maxval=10)
rrRatio = input.float(2.5, "Risk:Reward", minval=1.0, maxval=5.0)
slBuffer = input.float(2, "SL Buffer (pips)", minval=0, maxval=10)
asiaStart = input.int(0, "Asia Session Start (UTC hour)", minval=0, maxval=23)
asiaEnd = input.int(8, "Asia Session End (UTC hour)", minval=0, maxval=23)

// ── Asia Range ──
var float asiaHigh = na
var float asiaLow = na

if ta.hour >= asiaStart and ta.hour < asiaEnd
    asiaHigh := math.max(nz(asiaHigh, high), high)
    asiaLow := math.min(nz(asiaLow, low), low)

// ── Sweep Detection ──
sweptLow = low < asiaLow and close > asiaLow
sweptHigh = high > asiaHigh and close < asiaHigh

// ── Entry Logic ──
longCondition = sweptLow and not sweptHigh
shortCondition = sweptHigh and not sweptLow

// ── Plotting ──
plot(asiaHigh, "Asia High", color=color.orange, linewidth=1, style=plot.style_stepline)
plot(asiaLow, "Asia Low", color=color.orange, linewidth=1, style=plot.style_stepline)

if longCondition
    entryPrice = close
    sl = low - slBuffer * syminfo.mintick
    tp = entryPrice + (entryPrice - sl) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.green, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp, bar_index + 20, tp, color=color.blue, width=1)

if shortCondition
    entryPrice = close
    sl = high + slBuffer * syminfo.mintick
    tp = entryPrice - (sl - entryPrice) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.red, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp, bar_index + 20, tp, color=color.blue, width=1)

// ── Alerts ──
alertcondition(longCondition, "Asia Sweep LONG", "Bullish Asia sweep on ${pair}")
alertcondition(shortCondition, "Asia Sweep SHORT", "Bearish Asia sweep on ${pair}")
`;
}

function generatePdhLFvgPine(pair: string, timeframe: string): string {
  return `//@version=5
indicator("PDH/L FVG — ${pair} ${timeframe}", overlay=true, max_lines_count=200, max_boxes_count=200, max_labels_count=200)

// ── Inputs ──
rrRatio = input.float(2.5, "Risk:Reward", minval=1.0, maxval=5.0)
fvgMinSize = input.float(0.0002, "FVG Min Size", minval=0.0001, maxval=0.0010)

// ── Previous Day High/Low ──
prevDayHigh = request.security(syminfo.tickerid, "D", high[1], lookahead=barmerge.lookahead_on)
prevDayLow = request.security(syminfo.tickerid, "D", low[1], lookahead=barmerge.lookahead_on)

// ── FVG Detection ──
bullishFVG = low > high[2] and (low - high[2]) >= fvgMinSize
bearishFVG = high < low[2] and (low[2] - high) >= fvgMinSize

// ── Entry Logic ──
longCondition = bullishFVG and close > prevDayHigh
shortCondition = bearishFVG and close < prevDayLow

// ── Plotting ──
plot(prevDayHigh, "Previous Day High", color=color.gray, linewidth=1, style=plot.style_stepline)
plot(prevDayLow, "Previous Day Low", color=color.gray, linewidth=1, style=plot.style_stepline)

if bullishFVG
    box.new(bar_index - 1, low, bar_index + 20, high[2], border_color=color.green, bgcolor=color.new(color.green, 90))

if bearishFVG
    box.new(bar_index - 1, high, bar_index + 20, low[2], border_color=color.red, bgcolor=color.new(color.red, 90))

if longCondition
    entryPrice = close
    sl = high[2]
    tp = entryPrice + (entryPrice - sl) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.green, width=2)

if shortCondition
    entryPrice = close
    sl = low[2]
    tp = entryPrice - (sl - entryPrice) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.red, width=2)

// ── Alerts ──
alertcondition(longCondition, "PDH FVG LONG", "Bullish FVG above PDH on ${pair}")
alertcondition(shortCondition, "PDL FVG SHORT", "Bearish FVG below PDL on ${pair}")
`;
}

function generateTrendContinuationPine(pair: string, timeframe: string): string {
  return `//@version=5
indicator("Trend Continuation — ${pair} ${timeframe}", overlay=true, max_lines_count=200, max_boxes_count=200, max_labels_count=200)

// ── Inputs ──
emaLen = input.int(50, "EMA Length", minval=10, maxval=200)
rrRatio = input.float(2.5, "Risk:Reward", minval=1.0, maxval=5.0)
breakoutBars = input.int(5, "Breakout Bars", minval=2, maxval=20)

// ── EMA ──
ema = ta.ema(close, emaLen)

// ── Breakout Detection ──
aboveEma = close > ema
belowEma = close < ema
crossAbove = ta.crossover(close, ema)
crossBelow = ta.crossunder(close, ema)

// ── Entry Logic ──
longCondition = crossAbove and aboveEma[breakoutBars]
shortCondition = crossBelow and belowEma[breakoutBars]

// ── Plotting ──
plot(ema, "EMA ${pair}", color=color.orange, linewidth=2)

if longCondition
    entryPrice = close
    sl = ta.lowest(low, breakoutBars)
    tp = entryPrice + (entryPrice - sl) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.green, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp, bar_index + 20, tp, color=color.blue, width=1)

if shortCondition
    entryPrice = close
    sl = ta.highest(high, breakoutBars)
    tp = entryPrice - (sl - entryPrice) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.red, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp, bar_index + 20, tp, color=color.blue, width=1)

// ── Alerts ──
alertcondition(longCondition, "Trend Continuation LONG", "EMA breakout long on ${pair}")
alertcondition(shortCondition, "Trend Continuation SHORT", "EMA breakout short on ${pair}")
`;
}

function generateLondonBreakoutPine(pair: string, timeframe: string): string {
  return `//@version=5
indicator("London Breakout — ${pair} ${timeframe}", overlay=true, max_lines_count=200, max_boxes_count=200, max_labels_count=200)

// ── Inputs ──
rrRatio = input.float(2.5, "Risk:Reward", minval=1.0, maxval=5.0)
londonStart = input.int(7, "London Start (UTC hour)", minval=0, maxval=23)
londonEnd = input.int(16, "London End (UTC hour)", minval=0, maxval=23)

// ── London Range ──
var float londonHigh = na
var float londonLow = na

if ta.hour >= londonStart and ta.hour < londonEnd
    londonHigh := math.max(nz(londonHigh, high), high)
    londonLow := math.min(nz(londonLow, low), low)

// ── Breakout Logic ──
longCondition = close > londonHigh and not na(londonHigh)
shortCondition = close < londonLow and not na(londonLow)

// ── Plotting ──
plot(londonHigh, "London High", color=color.blue, linewidth=1, style=plot.style_stepline)
plot(londonLow, "London Low", color=color.blue, linewidth=1, style=plot.style_stepline)

if longCondition
    entryPrice = close
    sl = londonLow
    tp = entryPrice + (entryPrice - sl) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.green, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp, bar_index + 20, tp, color=color.blue, width=1)

if shortCondition
    entryPrice = close
    sl = londonHigh
    tp = entryPrice - (sl - entryPrice) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.red, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp, bar_index + 20, tp, color=color.blue, width=1)

// ── Alerts ──
alertcondition(longCondition, "London Breakout LONG", "London breakout long on ${pair}")
alertcondition(shortCondition, "London Breakout SHORT", "London breakout short on ${pair}")
`;
}

function generateEma9VwapPine(pair: string, timeframe: string): string {
  return `//@version=5
indicator("EMA 9 + VWAP ATR Trailing — ${pair} ${timeframe}", overlay=true, max_lines_count=200, max_boxes_count=200, max_labels_count=200)

// ── Inputs ──
emaLen = input.int(9, "EMA Length", minval=5, maxval=50)
atrLen = input.int(14, "ATR Period", minval=5, maxval=50)
atrMult = input.float(1.5, "ATR Multiplier", minval=0.5, maxval=5.0)
rrRatio = input.float(2.5, "Risk:Reward", minval=1.0, maxval=5.0)

// ── EMA 9 ──
ema9 = ta.ema(close, emaLen)

// ── VWAP ──
vwap = ta.vwap(hlc3)

// ── ATR Trailing Stop ──
atr = ta.atr(atrLen)
var float trailStop = na

if close > ema9 and close > vwap
    trailStop := close - atr * atrMult
else if close < ema9 and close < vwap
    trailStop := close + atr * atrMult

// ── Entry Logic ──
longCondition = close > ema9 and close > vwap and close[1] <= ema9[1]
shortCondition = close < ema9 and close < vwap and close[1] >= ema9[1]

// ── Plotting ──
plot(ema9, "EMA 9", color=color.orange, linewidth=2)
plot(vwap, "VWAP", color=color.purple, linewidth=2)
plot(trailStop, "ATR Trail", color=color.red, linewidth=1)

bgcolor(close > ema9 ? color.new(color.green, 95) : color.new(color.red, 95))

if longCondition
    entryPrice = close
    sl = trailStop
    tp = entryPrice + (entryPrice - sl) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.green, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp, bar_index + 20, tp, color=color.blue, width=1)

if shortCondition
    entryPrice = close
    sl = trailStop
    tp = entryPrice - (sl - entryPrice) * rrRatio
    line.new(bar_index, entryPrice, bar_index + 20, entryPrice, color=color.red, width=2)
    line.new(bar_index, sl, bar_index + 20, sl, color=color.red, width=1)
    line.new(bar_index, tp, bar_index + 20, tp, color=color.blue, width=1)

// ── Alerts ──
alertcondition(longCondition, "EMA9+VWAP LONG", "Long entry on ${pair}")
alertcondition(shortCondition, "EMA9+VWAP SHORT", "Short entry on ${pair}")
`;
}

export function getStrategyPineScript(pair: string, timeframe: string, strategy: string): string {
  switch (strategy) {
    case "channel-breakout":
      return generateChannelBreakoutPine(pair, timeframe);
    case "asia-sweep-reversals":
      return generateAsiaSweepPine(pair, timeframe);
    case "pdh-l-fvg":
      return generatePdhLFvgPine(pair, timeframe);
    case "trend-continuation":
      return generateTrendContinuationPine(pair, timeframe);
    case "london-breakout":
      return generateLondonBreakoutPine(pair, timeframe);
    case "ema-9-vwap":
      return generateEma9VwapPine(pair, timeframe);
    default:
      return generateChannelBreakoutPine(pair, timeframe);
  }
}

export function StrategyPineScript({ pair, timeframe, strategy, onApply, onAnalyze }: StrategyPineScriptProps) {
  const [code, setCode] = useState("");
  const [customized, setCustomized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate code when strategy changes
  useEffect(() => {
    const generated = getStrategyPineScript(pair, timeframe, strategy);
    setCode(generated);
    setCustomized(false);
  }, [pair, timeframe, strategy]);

  const handleApply = useCallback(() => {
    setSaving(true);
    onApply(code);
    setTimeout(() => {
      setSaving(false);
      onAnalyze();
    }, 300);
  }, [code, onApply, onAnalyze]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const handleReset = useCallback(() => {
    const generated = getStrategyPineScript(pair, timeframe, strategy);
    setCode(generated);
    setCustomized(false);
  }, [pair, timeframe, strategy]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
    setCustomized(true);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={14} style={{ color: "oklch(var(--gz-p))" }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "oklch(var(--gz-txt))" }}>
            Strategy Pine Script
          </span>
          {customized && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "oklch(var(--gz-warn))", background: "oklch(var(--gz-warn) / 0.1)", padding: "2px 8px", borderRadius: 4 }}>
              Customized
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={handleCopy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid oklch(var(--gz-p) / 0.2)",
              background: "oklch(var(--gz-p) / 0.05)",
              color: "oklch(var(--gz-p))",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={handleReset}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid oklch(var(--gz-mut) / 0.2)",
              background: "oklch(var(--gz-mut) / 0.05)",
              color: "oklch(var(--gz-mut))",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Code Editor */}
      <textarea
        value={code}
        onChange={handleChange}
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: 300,
          maxHeight: 500,
          padding: 12,
          borderRadius: 6,
          border: `1px solid ${customized ? "oklch(var(--gz-warn) / 0.3)" : "oklch(var(--gz-p) / 0.15)"}`,
          background: "oklch(var(--gz-s2) / 0.5)",
          color: "oklch(var(--gz-txt))",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          lineHeight: 1.5,
          resize: "vertical",
          outline: "none",
          tabSize: 2,
        }}
      />

      {/* Apply Button */}
      <button
        onClick={handleApply}
        disabled={saving}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          padding: "10px 20px",
          borderRadius: 6,
          border: "1px solid oklch(var(--gz-p) / 0.3)",
          background: "linear-gradient(180deg, oklch(var(--gz-p) / 0.15) 0%, oklch(var(--gz-p) / 0.08) 100%)",
          color: "oklch(var(--gz-p))",
          fontSize: 12,
          fontWeight: 700,
          cursor: saving ? "wait" : "pointer",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          transition: "all 0.15s ease",
        }}
      >
        <Layers size={14} />
        {saving ? "Applying..." : "Apply & Re-Analyze"}
      </button>
    </div>
  );
}

import { Layers } from "lucide-react";
