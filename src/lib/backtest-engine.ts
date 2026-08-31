// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * GizzyFx Bar-by-bar backtest engine.
 *
 * Input  : OHLCV bars + strategy rules (SL pips, TP pips, entry signals).
 * Output : trade log, equity curve, win rate, max drawdown, profit factor,
 *          Sharpe ratio, and a narrative.
 *
 * This engine is SYMBOL-AGNOSTIC — the caller fetches bars via
 * fetchHistoricalCandles (MetaApi) or /api/ohlcv (tvremix/Yahoo) and passes
 * them here. The engine never calls the broker itself; it is pure simulation.
 *
 * Spread/slippage/commission are configurable per symbol so results are
 * as close as possible to real demo-account fills.
 */

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface BacktestBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface StrategyRuleInput {
  entry_type: "sma_cross" | "ema_cross" | "rsi" | "breakout" | "custom";
  entry_params: Record<string, number>;
  custom_rules?: string;
  direction: "long" | "short" | "both";
  sl_type: "fixed_pips" | "atr";
  sl_value: number;
  tp_type: "rr_multiple" | "fixed_pips";
  tp_value: number;
}

export interface SimConfig {
  /** Spread in pips added to every fill. Default 1.0. */
  spreadPips: number;
  /** Slippage in pips applied to market orders. Default 0.5. */
  slippagePips: number;
  /** Round-trip commission in USD per 0.01 lot. Default 0.07. */
  commissionPerMicroLot: number;
  /** Lot size used for every trade. Default 0.01. */
  lotSize: number;
  /** Pip value in USD for 1.0 lot of this symbol. Default 10 (EURUSD). */
  pipValuePerLot: number;
  /** Starting account equity in USD. */
  startingEquity: number;
}

export interface SimTrade {
  entryBar: number;   // index into bars[]
  exitBar:  number;
  entryTime: number;  // unix seconds
  exitTime:  number;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice:  number;
  sl: number;
  tp: number;
  result: "win" | "loss" | "breakeven";
  pnlUsd: number;
  pnlPips: number;
  reason: "tp" | "sl";
}

export interface BacktestResult {
  trades: SimTrade[];
  equityCurve: { time: number; equity: number }[];
  stats: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
    netProfit: number;
    maxDrawdownPct: number;
    avgWinUsd: number;
    avgLossUsd: number;
    avgRR: number;
    sharpeRatio: number;
    startingEquity: number;
    finalEquity: number;
  };
  narrative: string;
  barsAnalyzed: number;
  periodDescription: string;
}

/* ── Math helpers ───────────────────────────────────────────────────────── */

function ema(bars: BacktestBar[], period: number, field: "close" | "open" = "close"): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const v = bars[i][field];
    out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k));
  }
  return out;
}

function sma(bars: BacktestBar[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    out.push(sum / period);
  }
  return out;
}

function rsiArr(bars: BacktestBar[], period: number): number[] {
  const out: number[] = new Array(period).fill(NaN);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff > 0) avgGain += diff / period;
    else avgLoss += (-diff) / period;
  }
  out.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-9)));
  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-9)));
  }
  return out;
}

function atr(bars: BacktestBar[], period: number): number[] {
  const tr: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < bars.length; i++) {
    tr.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close),
    ));
  }
  const out: number[] = new Array(period - 1).fill(NaN);
  let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  out.push(sum / period);
  for (let i = period; i < bars.length; i++) {
    const prev = out[out.length - 1];
    out.push((prev * (period - 1) + tr[i]) / period);
  }
  return out;
}

function recentHigh(bars: BacktestBar[], i: number, lookback: number): number {
  let hi = -Infinity;
  for (let j = Math.max(0, i - lookback); j < i; j++) hi = Math.max(hi, bars[j].high);
  return hi;
}

function recentLow(bars: BacktestBar[], i: number, lookback: number): number {
  let lo = Infinity;
  for (let j = Math.max(0, i - lookback); j < i; j++) lo = Math.min(lo, bars[j].low);
  return lo;
}

/* ── Entry signal generators ────────────────────────────────────────────── */

type Signal = "long" | "short" | null;

function smaCrossSignal(bars: BacktestBar[], i: number, p: Record<string, number>): Signal {
  const fast = Math.round(p["fast"] ?? 10);
  const slow = Math.round(p["slow"] ?? 20);
  const f = sma(bars, fast);
  const s = sma(bars, slow);
  if (isNaN(f[i]) || isNaN(s[i]) || isNaN(f[i-1]) || isNaN(s[i-1])) return null;
  if (f[i-1] < s[i-1] && f[i] > s[i]) return "long";
  if (f[i-1] > s[i-1] && f[i] < s[i]) return "short";
  return null;
}

function emaCrossSignal(bars: BacktestBar[], i: number, p: Record<string, number>): Signal {
  const fast = Math.round(p["fast"] ?? 9);
  const slow = Math.round(p["slow"] ?? 21);
  const f = ema(bars, fast);
  const s = ema(bars, slow);
  if (f[i-1] < s[i-1] && f[i] > s[i]) return "long";
  if (f[i-1] > s[i-1] && f[i] < s[i]) return "short";
  return null;
}

function rsiSignal(bars: BacktestBar[], i: number, p: Record<string, number>): Signal {
  const period = Math.round(p["period"] ?? 14);
  const ob = p["overbought"] ?? 70;
  const os = p["oversold"]   ?? 30;
  const r = rsiArr(bars, period);
  if (isNaN(r[i]) || isNaN(r[i-1])) return null;
  if (r[i-1] < os && r[i] >= os) return "long";
  if (r[i-1] > ob && r[i] <= ob) return "short";
  return null;
}

function breakoutSignal(bars: BacktestBar[], i: number, p: Record<string, number>): Signal {
  const lookback = Math.round(p["lookback"] ?? 20);
  if (i < lookback) return null;
  const hi = recentHigh(bars, i, lookback);
  const lo = recentLow(bars, i, lookback);
  if (bars[i].close > hi) return "long";
  if (bars[i].close < lo) return "short";
  return null;
}

/* ── Main simulation loop ───────────────────────────────────────────────── */

function simulate(
  bars: BacktestBar[],
  rule: StrategyRuleInput,
  cfg: SimConfig,
): Omit<BacktestResult, "narrative" | "periodDescription"> {
  const pipSz = 0.0001; // standard forex pip — adjust for JPY pairs if needed
  const pipVal = cfg.pipValuePerLot * cfg.lotSize; // USD per pip for our lot size
  const atrPeriod = 14;
  const atrVals = atr(bars, atrPeriod);

  const trades: SimTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];
  let equity = cfg.startingEquity;
  let inTrade = false;
  let openTrade: Partial<SimTrade> & { entryBar: number; entryTime: number } | null = null;
  let openSl = 0, openTp = 0;
  let peakEquity = equity;
  let maxDrawdown = 0;

  equityCurve.push({ time: bars[0].time, equity });

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];

    // Check if open position hit SL or TP this bar
    if (inTrade && openTrade) {
      const dir = openTrade.direction!;
      let closed = false;
      let reason: "tp" | "sl" = "sl";
      let exitPrice = bar.close;

      if (dir === "long") {
        if (bar.low <= openSl) {
          exitPrice = openSl;
          reason = "sl";
          closed = true;
        } else if (bar.high >= openTp) {
          exitPrice = openTp;
          reason = "tp";
          closed = true;
        }
      } else {
        if (bar.high >= openSl) {
          exitPrice = openSl;
          reason = "sl";
          closed = true;
        } else if (bar.low <= openTp) {
          exitPrice = openTp;
          reason = "tp";
          closed = true;
        }
      }

      if (closed) {
        const entry = openTrade.entryPrice!;
        const pnlPips =
          dir === "long"
            ? (exitPrice - entry) / pipSz
            : (entry - exitPrice) / pipSz;
        const commission = cfg.commissionPerMicroLot * (cfg.lotSize / 0.01) * 2;
        const pnlUsd = pnlPips * pipVal - commission;
        const result: SimTrade["result"] =
          pnlPips > 0.5 ? "win" : pnlPips < -0.5 ? "loss" : "breakeven";

        equity += pnlUsd;
        peakEquity = Math.max(peakEquity, equity);
        const dd = (peakEquity - equity) / peakEquity;
        maxDrawdown = Math.max(maxDrawdown, dd);

        const t: SimTrade = {
          entryBar:   openTrade.entryBar,
          exitBar:    i,
          entryTime:  openTrade.entryTime,
          exitTime:   bar.time,
          direction:  dir,
          entryPrice: entry,
          exitPrice,
          sl: openSl,
          tp: openTp,
          result,
          pnlUsd,
          pnlPips,
          reason,
        };
        trades.push(t);
        inTrade = false;
        openTrade = null;
        equityCurve.push({ time: bar.time, equity });
      }
    }

    // Skip entry if already in a trade
    if (inTrade) continue;

    // Generate signal
    let sig: Signal = null;
    switch (rule.entry_type) {
      case "sma_cross":  sig = smaCrossSignal(bars, i, rule.entry_params);  break;
      case "ema_cross":  sig = emaCrossSignal(bars, i, rule.entry_params);  break;
      case "rsi":        sig = rsiSignal(bars, i, rule.entry_params);        break;
      case "breakout":   sig = breakoutSignal(bars, i, rule.entry_params);   break;
      case "custom":     sig = null; break; // judgment-based: no mechanical signal
    }

    if (!sig) continue;
    if (rule.direction !== "both" && sig !== rule.direction) continue;

    // Calculate SL/TP
    const entryPrice = bar.close + (sig === "long" ? cfg.spreadPips : -cfg.spreadPips) * pipSz;
    const atrNow = atrVals[i] ?? 0.001;
    const slPips = rule.sl_type === "atr"
      ? (atrNow / pipSz) * rule.sl_value
      : rule.sl_value;
    const tpPips = rule.tp_type === "rr_multiple"
      ? slPips * rule.tp_value
      : rule.tp_value;

    const sl = sig === "long"
      ? entryPrice - slPips * pipSz
      : entryPrice + slPips * pipSz;
    const tp = sig === "long"
      ? entryPrice + tpPips * pipSz
      : entryPrice - tpPips * pipSz;

    inTrade = true;
    openSl = sl;
    openTp = tp;
    openTrade = { entryBar: i, entryTime: bar.time, entryPrice, direction: sig };
  }

  // Stats
  const wins   = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const grossProfit = trades.filter((t) => t.pnlUsd > 0).reduce((s, t) => s + t.pnlUsd, 0);
  const grossLoss   = Math.abs(trades.filter((t) => t.pnlUsd < 0).reduce((s, t) => s + t.pnlUsd, 0));
  const netProfit   = grossProfit - grossLoss;
  const winRate     = trades.length > 0 ? wins / trades.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avgWinUsd    = wins   > 0 ? grossProfit / wins   : 0;
  const avgLossUsd   = losses > 0 ? grossLoss   / losses : 0;
  const avgRR        = avgLossUsd > 0 ? avgWinUsd / avgLossUsd : 0;

  // Sharpe: annualised from per-trade returns
  const rets = trades.map((t) => t.pnlUsd / cfg.startingEquity);
  const meanRet = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - meanRet) ** 2, 0) / (rets.length || 1);
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(252) : 0;

  return {
    trades,
    equityCurve,
    barsAnalyzed: bars.length,
    stats: {
      totalTrades: trades.length,
      wins,
      losses,
      winRate,
      grossProfit,
      grossLoss,
      profitFactor,
      netProfit,
      maxDrawdownPct: maxDrawdown * 100,
      avgWinUsd,
      avgLossUsd,
      avgRR,
      sharpeRatio,
      startingEquity: cfg.startingEquity,
      finalEquity: equity,
    },
  };
}

/* ── Server function ─────────────────────────────────────────────────────── */

const backtestInput = z.object({
  bars: z.array(
    z.object({
      time:  z.number(),
      open:  z.number(),
      high:  z.number(),
      low:   z.number(),
      close: z.number(),
    }),
  ).min(10),
  rule: z.object({
    entry_type:   z.enum(["sma_cross", "ema_cross", "rsi", "breakout", "custom"]),
    entry_params: z.record(z.string(), z.number()).default({}),
    custom_rules: z.string().optional(),
    direction:    z.enum(["long", "short", "both"]).default("both"),
    sl_type:      z.enum(["fixed_pips", "atr"]),
    sl_value:     z.number().positive(),
    tp_type:      z.enum(["rr_multiple", "fixed_pips"]),
    tp_value:     z.number().positive(),
  }),
  config: z.object({
    spreadPips:             z.number().nonnegative().default(1.0),
    slippagePips:           z.number().nonnegative().default(0.5),
    commissionPerMicroLot:  z.number().nonnegative().default(0.07),
    lotSize:                z.number().positive().default(0.01),
    pipValuePerLot:         z.number().positive().default(10),
    startingEquity:         z.number().positive().default(10_000),
  }).default({}),
  periodDescription: z.string().default(""),
});

export const runBacktest = createServerFn({ method: "POST" })
  .validator((input: unknown) => backtestInput.parse(input))
  .handler(async ({ data }): Promise<BacktestResult> => {
    if (data.rule.entry_type === "custom") {
      throw new Error(
        "Custom (discretionary) strategies cannot be run by the mechanical engine. " +
        "Use the Hermes trading agent to walk through real history with judgment."
      );
    }

    const result = simulate(data.bars as BacktestBar[], data.rule as StrategyRuleInput, {
      spreadPips:            data.config.spreadPips,
      slippagePips:          data.config.slippagePips,
      commissionPerMicroLot: data.config.commissionPerMicroLot,
      lotSize:               data.config.lotSize,
      pipValuePerLot:        data.config.pipValuePerLot,
      startingEquity:        data.config.startingEquity,
    });

    const s = result.stats;
    const from = new Date(data.bars[0].time * 1000).toISOString().slice(0, 10);
    const to   = new Date(data.bars[data.bars.length - 1].time * 1000).toISOString().slice(0, 10);
    const pd   = data.periodDescription || `${data.bars.length} bars ${from} → ${to}`;

    const narrative =
      `Deterministic backtest over ${pd}. ` +
      `${s.totalTrades} trades: ${s.wins}W / ${s.losses}L — win rate ${(s.winRate * 100).toFixed(1)}%. ` +
      `Net PnL: $${s.netProfit.toFixed(2)} on $${s.startingEquity.toLocaleString()} starting equity. ` +
      `Profit factor: ${isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}. ` +
      `Max drawdown: ${s.maxDrawdownPct.toFixed(2)}%. ` +
      `Avg R:R: ${s.avgRR.toFixed(2)}. Sharpe (annualised): ${s.sharpeRatio.toFixed(2)}.`;

    return { ...result, narrative, periodDescription: pd };
  });
