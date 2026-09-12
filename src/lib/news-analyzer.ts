/**
 * Professional Economic News Analyzer
 * 
 * Provides institutional-grade forex market impact analysis for economic
 * calendar events. Includes actionable trade setups and risk management.
 * 
 * Each analysis includes:
 * - What the event measures and why it matters
 * - Market direction (BUY/SELL) with confidence percentage
 * - Trade setup: entry strategy if you want to trade it
 * - Avoid strategy: how to stay safe if you don't want to trade
 * - Risk factors: what could go wrong
 */

interface NewsEvent {
  event_name: string;
  currency: string;
  impact: "high" | "medium" | "low";
  forecast: string;
  previous: string;
}

interface NewsAnalysis {
  analysis: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  affected_pairs: string[];
  spike_pips: string;
  duration: string;
  trade_setup: string;
  avoid_strategy: string;
  risk_factors: string;
}

// Map currencies to their major pairs
const CURRENCY_PAIRS: Record<string, string[]> = {
  USD: ["EURUSD", "USDJPY", "GBPUSD"],
  EUR: ["EURUSD"],
  GBP: ["GBPUSD"],
  JPY: ["USDJPY"],
  CAD: ["USDCAD"],
  AUD: ["AUDUSD"],
  NZD: ["NZDUSD"],
  CHF: ["USDCHF"],
};

// Known event patterns with full analysis including trade setups
const EVENT_PATTERNS: Record<string, {
  description: string;
  base_pips: number;
  duration: string;
  analyze: (forecast: string, previous: string, currency: string) => {
    direction: "BUY" | "SELL" | "NEUTRAL";
    confidence: number;
    detail: string;
    trade_setup: string;
    avoid_strategy: string;
    risk_factors: string;
  };
}> = {
  "Non-Farm Payrolls": {
    description: "Measures total US jobs added (ex-farm). Most watched forex event monthly.",
    base_pips: 80,
    duration: "5-15 minutes",
    analyze: (f, p, c) => {
      const fNum = parseInt(f) || 0;
      const pNum = parseInt(p) || 0;
      if (fNum > pNum + 20) return {
        direction: "BUY",
        confidence: 85,
        detail: `Strong beat (${fNum}K vs ${pNum}K prev). USD strengthens on hawkish Fed expectations.`,
        trade_setup: `BUY ${c === "USD" ? "USDJPY" : "EURUSD"} on entry. Stop loss 30 pips below entry. Target 80-100 pips. Enter at market open after first 2 minutes of consolidation.`,
        avoid_strategy: `STAY OUT. Wait for the spike to finish (10-15 min), then trade the reversal. Or wait for next day when volatility normalizes.`,
        risk_factors: `Fake-out common. Initial spike often reverses within 5 minutes. Spread can widen to 5+ pips. Slippage on market orders.`
      };
      if (fNum > pNum) return {
        direction: "BUY",
        confidence: 70,
        detail: `Beat (${fNum}K vs ${pNum}K). Moderate USD strength expected.`,
        trade_setup: `BUY USDJPY or SELL EURUSD. Stop loss 25 pips. Target 50-60 pips. Enter after first pullback (3-5 min after release).`,
        avoid_strategy: `Wait 15 minutes for initial volatility to settle, then trade the trend. Avoid first 3 minutes.`,
        risk_factors: `If forecast was close to consensus, move may be muted. Watch for revision of previous month.`
      };
      if (fNum < pNum - 20) return {
        direction: "SELL",
        confidence: 85,
        detail: `Major miss (${fNum}K vs ${pNum}K). USD drops on dovish Fed pricing.`,
        trade_setup: `SELL USDJPY or BUY EURUSD. Stop loss 30 pips. Target 80-100 pips. Enter after first bounce fails.`,
        avoid_strategy: `STAY OUT. Major news = major slippage. Wait for reversal setup on 15min chart after 30 minutes.`,
        risk_factors: `Massive volatility. Spreads blow out. Slippage can exceed 10 pips on market orders.`
      };
      if (fNum < pNum) return {
        direction: "SELL",
        confidence: 70,
        detail: `Miss (${fNum}K vs ${pNum}K). USD weakness expected.`,
        trade_setup: `SELL USDJPY. Stop loss 20 pips. Target 40 pips. Enter on pullback after initial drop.`,
        avoid_strategy: `Wait 10 minutes. Let the initial move happen, then fade the extremes.`,
        risk_factors: `Inline data often causes choppy action. Avoid holding through revised figures.`
      };
      return {
        direction: "NEUTRAL",
        confidence: 55,
        detail: `Inline (${fNum}K). Low volatility expected.`,
        trade_setup: `No trade. Watch for breakout of the range established in the first 5 minutes.`,
        avoid_strategy: `Perfect time to stay flat. Let the market decide direction, then follow.`,
        risk_factors: `Choppy, range-bound action likely. Stop runs common in both directions.`
      };
    },
  },
  "Interest Rate Decision": {
    description: "Central bank rate decision. Highest impact event — moves all pairs.",
    base_pips: 100,
    duration: "10-30 minutes",
    analyze: (f, p, c) => {
      const fNum = parseFloat(f) || 0;
      const pNum = parseFloat(p) || 0;
      if (fNum > pNum) return {
        direction: "BUY",
        confidence: 90,
        detail: `Hawkish hike to ${f}%. Massive ${c} strength expected across all pairs.`,
        trade_setup: `BUY ${c === "USD" ? "USDJPY" : c === "GBP" ? "GBPUSD" : "EURUSD"}. Stop loss 40 pips. Target 100+ pips. Enter ONLY after first 5-minute candle closes in direction.`,
        avoid_strategy: `DO NOT TRADE. Rate decisions are unpredictable. Wait 30 minutes, then trade the trend on higher timeframe.`,
        risk_factors: `Extreme volatility. Spreads can hit 10+ pips. Slippage is guaranteed on market orders. Central bank statement can reverse everything.`
      };
      if (fNum < pNum) return {
        direction: "SELL",
        confidence: 90,
        detail: `Dovish cut to ${f}%. Massive ${c} weakness.`,
        trade_setup: `SELL ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 40 pips. Target 100+ pips. Enter after first bounce fails.`,
        avoid_strategy: `DO NOT TRADE. Rate decisions are traps for retail. Wait for the dust to settle (1-2 hours).`,
        risk_factors: `Gut-wrenching volatility. Account can blow in minutes. Stick to your avoid strategy.`
      };
      if (f.includes("hold") || f === p) return {
        direction: "NEUTRAL",
        confidence: 60,
        detail: `Hold at ${f}%. Watch statement for forward guidance.`,
        trade_setup: `Wait for statement release (30 min after decision). Trade the breakout of the range.`,
        avoid_strategy: `Hold = hold your trades. Don't enter until market digests the statement.`,
        risk_factors: `Statement tone can change everything. "Hawkish hold" = buy. "Dovish hold" = sell.`
      };
      return {
        direction: "NEUTRAL",
        confidence: 60,
        detail: `Rate at ${f}%. Awaiting statement tone.`,
        trade_setup: `No trade yet. Wait for press conference. Trade the trend after 30 minutes.`,
        avoid_strategy: `Stay flat until market direction is clear. Patience pays.`,
        risk_factors: `Fake-outs in both directions until statement is digested.`
      };
    },
  },
  "CPI": {
    description: "Consumer Price Index — inflation gauge. Drives rate expectations.",
    base_pips: 60,
    duration: "3-10 minutes",
    analyze: (f, p, c) => {
      const fNum = parseFloat(f) || 0;
      const pNum = parseFloat(p) || 0;
      if (fNum > pNum + 0.2) return {
        direction: "BUY",
        confidence: 80,
        detail: `Hot CPI ${f}% (vs ${p}%). Hawkish Fed = ${c} buys.`,
        trade_setup: `BUY ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 25 pips. Target 60 pips. Enter on pullback after initial spike.`,
        avoid_strategy: `Wait 15 minutes. Trade the continuation or reversal based on price action.`,
        risk_factors: `Hot CPI can reverse if market already priced it in. Watch for "sell the news" reaction.`
      };
      if (fNum > pNum) return {
        direction: "BUY",
        confidence: 65,
        detail: `CPI ${f}% above ${p}%. Mild ${c} strength.`,
        trade_setup: `BUY USDJPY on dip. Stop loss 20 pips. Target 35 pips.`,
        avoid_strategy: `Skip it. Mild reactions are hard to trade. Wait for clearer setup.`,
        risk_factors: `Move may not be worth the spread cost. Easy to get chopped up.`
      };
      if (fNum < pNum - 0.2) return {
        direction: "SELL",
        confidence: 80,
        detail: `Cool CPI ${f}% (vs ${p}%). Dovish Fed = ${c} sells.`,
        trade_setup: `SELL ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 25 pips. Target 60 pips.`,
        avoid_strategy: `Wait 15 minutes. CPI misses often lead to sustained trends — better to wait and trade the trend.`,
        risk_factors: `Dovish Fed pricing can cause prolonged moves. Don't fight the trend.`
      };
      if (fNum < pNum) return {
        direction: "SELL",
        confidence: 65,
        detail: `CPI ${f}% below ${p}%. Mild ${c} weakness.`,
        trade_setup: `SELL USDJPY on rally. Stop loss 20 pips. Target 35 pips.`,
        avoid_strategy: `Skip it. Wait for better opportunities.`,
        risk_factors: `Low volatility expected. Range-bound action likely.`
      };
      return {
        direction: "NEUTRAL",
        confidence: 50,
        detail: `CPI inline at ${f}%. Low reaction.`,
        trade_setup: `No trade. Wait for breakout of the range.`,
        avoid_strategy: `Perfect time to stay flat.`,
        risk_factors: `Choppy, mean-reverting price action.`
      };
    },
  },
  "GDP": {
    description: "Gross Domestic Product — broadest economic health measure.",
    base_pips: 50,
    duration: "3-8 minutes",
    analyze: (f, p, c) => {
      const fNum = parseFloat(f) || 0;
      const pNum = parseFloat(p) || 0;
      if (fNum > pNum + 0.5) return {
        direction: "BUY",
        confidence: 80,
        detail: `Strong GDP ${f}% (vs ${p}%). ${c} rallies on growth outlook.`,
        trade_setup: `BUY ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 25 pips. Target 50 pips.`,
        avoid_strategy: `GDP is a lagging indicator. Wait for market to digest, then trade the trend.`,
        risk_factors: `GDP revisions common. Initial print may be revised next month.`
      };
      if (fNum < pNum - 0.5) return {
        direction: "SELL",
        confidence: 80,
        detail: `Weak GDP ${f}% (vs ${p}%). ${c} sells on recession fears.`,
        trade_setup: `SELL ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 25 pips. Target 50 pips.`,
        avoid_strategy: `GDP misses can cause sustained selling. Don't catch the knife — wait for bottom.`,
        risk_factors: `Recession fears can trigger risk-off moves across all markets.`
      };
      return {
        direction: "NEUTRAL",
        confidence: 50,
        detail: `GDP ${f}% near ${p}%. Limited reaction.`,
        trade_setup: `No trade. GDP near expectations = no edge.`,
        avoid_strategy: `Stay flat. Better setups exist.`,
        risk_factors: `Low volatility. Range-bound.`
      };
    },
  },
  "Unemployment Rate": {
    description: "US unemployment percentage. Inverse correlation with USD strength.",
    base_pips: 40,
    duration: "3-8 minutes",
    analyze: (f, p, c) => {
      const fNum = parseFloat(f) || 0;
      const pNum = parseFloat(p) || 0;
      if (fNum < pNum - 0.2) return {
        direction: "BUY",
        confidence: 75,
        detail: `Drop to ${f}% (from ${p}%). Lower unemployment = stronger USD.`,
        trade_setup: `BUY USDJPY. Stop loss 20 pips. Target 40 pips. Enter on pullback.`,
        avoid_strategy: `Wait 10 minutes. Unemployment moves are tradeable after initial spike.`,
        risk_factors: `Often overshadowed by NFP if released same day.`
      };
      if (fNum > pNum + 0.2) return {
        direction: "SELL",
        confidence: 75,
        detail: `Rise to ${f}% (from ${p}%). Higher unemployment = weaker USD.`,
        trade_setup: `SELL USDJPY. Stop loss 20 pips. Target 40 pips.`,
        avoid_strategy: `Unemployment rises can trigger risk-off. Stay out or trade reversal.`,
        risk_factors: `Rising unemployment = recession fears = volatile.`
      };
      return {
        direction: "NEUTRAL",
        confidence: 50,
        detail: `Unchanged at ${f}%. Minimal reaction expected.`,
        trade_setup: `No trade.`,
        avoid_strategy: `Stay flat.`,
        risk_factors: `Boring. Move on.`
      };
    },
  },
  "Retail Sales": {
    description: "Consumer spending gauge. Strong sales = strong currency.",
    base_pips: 35,
    duration: "2-5 minutes",
    analyze: (f, p, c) => {
      const fNum = parseFloat(f) || 0;
      const pNum = parseFloat(p) || 0;
      if (fNum > pNum + 0.3) return {
        direction: "BUY",
        confidence: 70,
        detail: `Strong sales ${f}% (vs ${p}%). ${c} buys.`,
        trade_setup: `BUY ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 20 pips. Target 35 pips.`,
        avoid_strategy: `Skip it. Retail sales moves are small and choppy.`,
        risk_factors: `Small move. Spread eats profits.`
      };
      if (fNum < pNum - 0.3) return {
        direction: "SELL",
        confidence: 70,
        detail: `Weak sales ${f}% (vs ${p}%). ${c} sells.`,
        trade_setup: `SELL USDJPY. Stop loss 20 pips. Target 35 pips.`,
        avoid_strategy: `Skip it. Not worth the risk for 35 pips.`,
        risk_factors: `Small move. Easy to get stopped out.`
      };
      return {
        direction: "NEUTRAL",
        confidence: 50,
        detail: `Sales ${f}% inline. Minimal move.`,
        trade_setup: `No trade.`,
        avoid_strategy: `Stay flat.`,
        risk_factors: `Nothing happening.`
      };
    },
  },
  "PMI": {
    description: "Purchasing Managers Index. >50 = expansion, <50 = contraction.",
    base_pips: 30,
    duration: "2-5 minutes",
    analyze: (f, p, c) => {
      const fNum = parseFloat(f) || 50;
      const pNum = parseFloat(p) || 50;
      if (fNum > 50 && fNum > pNum + 1) return {
        direction: "BUY",
        confidence: 75,
        detail: `Expansionary PMI ${f} (up from ${p}). ${c} strength.`,
        trade_setup: `BUY ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 20 pips. Target 30 pips.`,
        avoid_strategy: `Skip it. PMI moves are small.`,
        risk_factors: `Small move. Not worth the spread.`
      };
      if (fNum < 50 && fNum < pNum - 1) return {
        direction: "SELL",
        confidence: 75,
        detail: `Contractionary PMI ${f} (down from ${p}). ${c} weakness.`,
        trade_setup: `SELL USDJPY. Stop loss 20 pips. Target 30 pips.`,
        avoid_strategy: `Skip it. PMI moves are small.`,
        risk_factors: `Small move.`
      };
      return {
        direction: "NEUTRAL",
        confidence: 50,
        detail: `PMI ${f} near ${p}. Limited reaction.`,
        trade_setup: `No trade.`,
        avoid_strategy: `Stay flat.`,
        risk_factors: `Nothing.`
      };
    },
  },
  // Default pattern for unknown events
  "_default": {
    description: "Economic event with market impact.",
    base_pips: 25,
    duration: "2-5 minutes",
    analyze: (f, p, c) => {
      if (!f || !p || f === "—" || p === "—") return {
        direction: "NEUTRAL",
        confidence: 50,
        detail: `Inspect release vs consensus.`,
        trade_setup: `No trade. Wait for clarity.`,
        avoid_strategy: `Perfect time to stay flat. Unknown events = unknown moves.`,
        risk_factors: `No edge. Stay out.`
      };
      if (f > p) return {
        direction: "BUY",
        confidence: 60,
        detail: `Above previous. Mild ${c} strength.`,
        trade_setup: `BUY ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 20 pips. Target 25 pips.`,
        avoid_strategy: `Skip it. Mild moves aren't worth the spread.`,
        risk_factors: `Unknown event = unpredictable reaction.`
      };
      if (f < p) return {
        direction: "SELL",
        confidence: 60,
        detail: `Below previous. Mild ${c} weakness.`,
        trade_setup: `SELL ${c === "USD" ? "USDJPY" : "EURUSD"}. Stop loss 20 pips. Target 25 pips.`,
        avoid_strategy: `Skip it. Not worth it.`,
        risk_factors: `Unknown event. Stay out.`
      };
      return {
        direction: "NEUTRAL",
        confidence: 50,
        detail: `Inline. Low volatility.`,
        trade_setup: `No trade.`,
        avoid_strategy: `Stay flat.`,
        risk_factors: `Nothing.`
      };
    },
  },
};

function findPattern(eventName: string) {
  for (const [key, pat] of Object.entries(EVENT_PATTERNS)) {
    if (key !== "_default" && eventName.toLowerCase().includes(key.toLowerCase())) {
      return pat;
    }
  }
  return EVENT_PATTERNS["_default"]!;
}

export function analyzeNewsEvent(event: NewsEvent): NewsAnalysis {
  const pattern = findPattern(event.event_name);
  const { direction, confidence, detail, trade_setup, avoid_strategy, risk_factors } = pattern.analyze(event.forecast, event.previous, event.currency);
  const affectedPairs = CURRENCY_PAIRS[event.currency] || ["EURUSD", "USDJPY", "GBPUSD"];

  const analysis = `${pattern.description} ${detail} Typical spike: ${pattern.base_pips} pips over ${pattern.duration}. Affected: ${affectedPairs.join(", ")}.`;

  return {
    analysis,
    direction,
    confidence,
    affected_pairs: affectedPairs,
    spike_pips: `${pattern.base_pips}+`,
    duration: pattern.duration,
    trade_setup,
    avoid_strategy,
    risk_factors,
  };
}
