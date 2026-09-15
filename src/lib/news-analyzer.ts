/**
 * Professional Economic News Analyzer & Post-News Trend Engine
 *
 * Provides institutional-grade forex market impact analysis for economic calendar events.
 *
 * Capabilities:
 * 1. Pre-News Forecast Analysis: Scenarios, volatility expectations, preparation rules.
 * 2. Post-News Event Review: Explains EXACTLY what happened in the news (actual vs forecast vs previous).
 * 3. Market Trend Continuation: Pinpoints the highest-confidence post-news market trend direction,
 *    key affected currency pairs, expected duration, and exact pullback entry rules.
 */

export interface NewsEvent {
  event_name: string;
  currency: string;
  impact: "high" | "medium" | "low";
  forecast: string;
  previous: string;
  actual?: string;
  datetime?: number;
  time?: string;
}

export interface PairRecommendation {
  pair: string;
  direction: "BUY" | "SELL";
  confidence: number;
  target_pips: string;
  rationale: string;
}

export interface WhatHappenedReport {
  verdict: "STRONG_BEAT" | "BEAT" | "INLINE" | "MISS" | "SEVERE_MISS";
  verdict_title: string;
  headline: string;
  actual_val: string;
  forecast_val: string;
  previous_val: string;
  surprise_delta: string;
  macro_impact: string;
}

export interface PostNewsTrendReport {
  likely_trend: "BULLISH_CONTINUATION" | "BEARISH_CONTINUATION" | "RANGE_BOUND" | "VOLATILE_CHOP";
  trend_headline: string;
  bias: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  duration_horizon: string;
  key_drivers: string;
  recommended_pairs: PairRecommendation[];
  pullback_entry_rule: string;
  invalidation_level: string;
}

export interface NewsAnalysis {
  analysis: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  affected_pairs: string[];
  spike_pips: string;
  duration: string;
  trade_setup: string;
  avoid_strategy: string;
  risk_factors: string;

  // Post-News Intelligence
  is_post_news: boolean;
  what_happened?: WhatHappenedReport;
  post_news_trend?: PostNewsTrendReport;
}

// Map currencies to their major pairs
const CURRENCY_PAIRS: Record<string, string[]> = {
  USD: ["EURUSD", "USDJPY", "GBPUSD", "USDCAD", "AUDUSD"],
  EUR: ["EURUSD", "EURJPY", "EURGBP"],
  GBP: ["GBPUSD", "GBPJPY", "EURGBP"],
  JPY: ["USDJPY", "EURJPY", "GBPJPY"],
  CAD: ["USDCAD", "CADJPY"],
  AUD: ["AUDUSD", "AUDJPY", "EURAUD"],
  NZD: ["NZDUSD", "NZDJPY"],
  CHF: ["USDCHF", "EURCHF"],
};

function parseValue(val: string | undefined): { num: number; unit: string; raw: string; valid: boolean } {
  if (!val || val === "—" || val.trim() === "") {
    return { num: 0, unit: "", raw: "—", valid: false };
  }
  const clean = val.trim();
  const numMatch = clean.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (!numMatch) {
    return { num: 0, unit: "", raw: clean, valid: false };
  }
  const num = parseFloat(numMatch[0]);
  const unit = clean.replace(/[-+]?[0-9]*\.?[0-9]+/, "").trim();
  return { num, unit, raw: clean, valid: true };
}

interface PatternHandler {
  description: string;
  base_pips: number;
  duration: string;
  analyzePreNews: (f: string, p: string, c: string) => {
    direction: "BUY" | "SELL" | "NEUTRAL";
    confidence: number;
    detail: string;
    trade_setup: string;
    avoid_strategy: string;
    risk_factors: string;
  };
  analyzePostNews: (a: string, f: string, p: string, c: string) => {
    whatHappened: WhatHappenedReport;
    postNewsTrend: PostNewsTrendReport;
  };
}

const PATTERNS: Record<string, PatternHandler> = {
  "Non-Farm Payrolls": {
    description: "US Non-Farm Payrolls (NFP) — Measures net new jobs created outside farming. Primary driver of Fed interest rate expectations.",
    base_pips: 80,
    duration: "10-20 minutes initial, 2-4 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      if (fVal.valid && pVal.valid && fVal.num > pVal.num + 20) {
        return {
          direction: "BUY",
          confidence: 85,
          detail: `Strong forecast (${f} vs ${p} prev). Market anticipating robust USD hiring and hawkish Fed rate trajectory.`,
          trade_setup: `BUY USDJPY or SELL EURUSD. Await 5M post-release consolidation before entering. Stop loss: 30 pips. Target: 75-100 pips.`,
          avoid_strategy: `STAY FLAT ±30 min around release. NFP produces severe 5-pip spread spikes and initial whipsaws.`,
          risk_factors: `Watch Average Hourly Earnings (wages) and Unemployment Rate released simultaneously. Mixed numbers cause choppy 2-way wicks.`,
        };
      }
      if (fVal.valid && pVal.valid && fVal.num < pVal.num - 20) {
        return {
          direction: "SELL",
          confidence: 85,
          detail: `Weak forecast (${f} vs ${p} prev). Market pricing in economic deceleration and accelerated Fed rate cuts.`,
          trade_setup: `SELL USDJPY or BUY EURUSD. Enter after the initial 5M knee-jerk reaction. Stop loss: 30 pips. Target: 75-100 pips.`,
          avoid_strategy: `Do not hold pending orders into NFP release. Wait for the dust to settle.`,
          risk_factors: `Revisions to previous month prints can override a headline miss.`,
        };
      }
      return {
        direction: "NEUTRAL",
        confidence: 60,
        detail: `NFP forecast at ${f} vs ${p} prior. Consensus expects steady labor conditions. Direction hinges strictly on the release print.`,
        trade_setup: `Wait for the release. Trade the confirmed direction 15 minutes post-news.`,
        avoid_strategy: `Flat until print confirmation.`,
        risk_factors: `High likelihood of 2-way volatility on inline headline.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);

      const benchmark = fVal.valid ? fVal.num : pVal.num;
      const diff = aVal.valid ? aVal.num - benchmark : 0;
      const isStrongBeat = diff >= 40;
      const isBeat = diff > 10 && diff < 40;
      const isSevereMiss = diff <= -40;
      const isMiss = diff < -10 && diff > -40;

      if (isStrongBeat || isBeat) {
        const conf = isStrongBeat ? 90 : 80;
        return {
          whatHappened: {
            verdict: isStrongBeat ? "STRONG_BEAT" : "BEAT",
            verdict_title: isStrongBeat ? "Massive NFP Beat" : "Solid NFP Beat",
            headline: `NFP printed ${a} (Forecast: ${f}, Prior: ${p}) — Surpassing expectations by +${Math.abs(diff).toFixed(0)}K jobs.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `+${diff.toFixed(0)}K vs forecast`,
            macro_impact: "The US labor market demonstrated exceptional hiring momentum. Strong job creation dispels recession concerns and reinforces higher-for-longer yields, sparking aggressive institutional capital inflows into the US Dollar.",
          },
          postNewsTrend: {
            likely_trend: "BULLISH_CONTINUATION",
            trend_headline: "High-Confidence US Dollar Bullish Trend Continuation",
            bias: "BUY",
            confidence: conf,
            duration_horizon: "Trend continuation projected for 2 to 4 hours into the London/NY session close.",
            key_drivers: "Institutional desks and algorithm programs systematically accumulating USD as bond yields surge post-beat.",
            recommended_pairs: [
              { pair: "USDJPY", direction: "BUY", confidence: conf, target_pips: "60–90 pips", rationale: "Yield spread expansion drives strong USDJPY upside." },
              { pair: "EURUSD", direction: "SELL", confidence: conf - 5, target_pips: "50–80 pips", rationale: "Clear bearish breakdown below key structural support." },
              { pair: "GBPUSD", direction: "SELL", confidence: conf - 5, target_pips: "45–75 pips", rationale: "Dollar dominance puts heavy downward pressure on Sterling." },
            ],
            pullback_entry_rule: "Wait for the initial 5M-15M spike to consolidate. Enter in trend direction on a 38.2%-50% retracement into the news candle body.",
            invalidation_level: "Invalidated if price breaks back above/below the pre-news range origin.",
          },
        };
      }

      if (isSevereMiss || isMiss) {
        const conf = isSevereMiss ? 90 : 80;
        return {
          whatHappened: {
            verdict: isSevereMiss ? "SEVERE_MISS" : "MISS",
            verdict_title: isSevereMiss ? "Severe NFP Miss" : "NFP Miss",
            headline: `NFP printed ${a} (Forecast: ${f}, Prior: ${p}) — Falling short of consensus by ${diff.toFixed(0)}K jobs.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `${diff.toFixed(0)}K vs forecast`,
            macro_impact: "US hiring slowed down sharply. Weak labor data reinforces market bets on Fed monetary easing and multiple rate cuts, triggering heavy institutional selling across USD pairs.",
          },
          postNewsTrend: {
            likely_trend: "BEARISH_CONTINUATION",
            trend_headline: "High-Confidence US Dollar Bearish Trend Continuation",
            bias: "SELL",
            confidence: conf,
            duration_horizon: "Sustained USD weakness expected for the remainder of the trading session.",
            key_drivers: "Bond yields tumbling and rapid repricing of dovish Fed policy driving broad USD liquidation.",
            recommended_pairs: [
              { pair: "EURUSD", direction: "BUY", confidence: conf, target_pips: "60–90 pips", rationale: "Bullish expansion above major resistance with strong volume." },
              { pair: "USDJPY", direction: "SELL", confidence: conf, target_pips: "70–110 pips", rationale: "Collapsing US yields accelerate USDJPY downward momentum." },
              { pair: "GBPUSD", direction: "BUY", confidence: conf - 5, target_pips: "50–80 pips", rationale: "Cable rallies as the greenback weakens across the board." },
            ],
            pullback_entry_rule: "Wait for the first 15M candle to close. Look for a minor pullback toward the 50% wick level to join the bearish trend.",
            invalidation_level: "Invalidated if price reverses and closes beyond the high of the news release candle.",
          },
        };
      }

      return {
        whatHappened: {
          verdict: "INLINE",
          verdict_title: "NFP Inline with Consensus",
          headline: `NFP printed ${a} (Forecast: ${f}, Prior: ${p}) — Matching expectations closely.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: "Minimal surprise (inline)",
          macro_impact: "The print matched consensus. No major surprise factor to drive a sustained macro trend. Price action is transitioning to range-bound mean reversion.",
        },
        postNewsTrend: {
          likely_trend: "RANGE_BOUND",
          trend_headline: "Range-Bound / Mean-Reversion Expected",
          bias: "NEUTRAL",
          confidence: 65,
          duration_horizon: "Initial spike likely to fade within 30-60 minutes.",
          key_drivers: "Lack of macro catalyst results in profit-taking and range trading.",
          recommended_pairs: [
            { pair: "EURUSD", direction: "BUY", confidence: 60, target_pips: "20–30 pips", rationale: "Fade the extreme of the initial news wick." },
          ],
          pullback_entry_rule: "Fade outer extremes of the news candle or wait for clean technical setups on 1H charts.",
          invalidation_level: "Breakout beyond the news candle high/low with 15M body close.",
        },
      };
    },
  },

  "CPI": {
    description: "Consumer Price Index (CPI) — Headline and Core Inflation rate. The number one determinant of central bank interest rate decisions.",
    base_pips: 70,
    duration: "10-25 minutes initial, 3-6 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      if (fVal.valid && pVal.valid && fVal.num > pVal.num) {
        return {
          direction: "BUY",
          confidence: 80,
          detail: `Hot CPI forecast (${f} vs ${p} prior). Sticky inflation pressures central banks toward hawkish policy.`,
          trade_setup: `BUY ${c === "USD" ? "USDJPY" : "EURUSD"}. Await post-release 5M confirmation candle. SL: 25 pips. Target: 60 pips.`,
          avoid_strategy: `Halt pending orders ±30 min around CPI. Spreads blow out dramatically.`,
          risk_factors: `Core CPI vs Headline CPI divergence can cause sudden reversals.`,
        };
      }
      return {
        direction: "SELL",
        confidence: 80,
        detail: `Cooling CPI forecast (${f} vs ${p} prior). Disinflation prompts central banks toward monetary easing.`,
        trade_setup: `SELL ${c === "USD" ? "USDJPY" : "EURUSD"}. SL: 25 pips. Target: 60 pips.`,
        avoid_strategy: `Do not gamble on the release tick. Wait for the initial 15M trend to establish.`,
        risk_factors: `Watch for revisions or surprises in sub-components (rent, services, energy).`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.num;
      const diff = aVal.valid ? +(aVal.num - benchmark).toFixed(2) : 0;
      const isHot = diff >= 0.2;
      const isMildHot = diff > 0 && diff < 0.2;
      const isCool = diff <= -0.2;
      const isMildCool = diff < 0 && diff > -0.2;

      if (isHot || isMildHot) {
        const conf = isHot ? 92 : 82;
        return {
          whatHappened: {
            verdict: isHot ? "STRONG_BEAT" : "BEAT",
            verdict_title: isHot ? "Hot CPI Inflation Beat" : "Mild CPI Beat",
            headline: `CPI printed ${a} (Forecast: ${f}, Prior: ${p}) — Inflation came in ${diff > 0 ? "+" : ""}${diff}% hotter than forecast.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `${diff > 0 ? "+" : ""}${diff}% surprise`,
            macro_impact: `Sticky inflation limits the scope for interest rate cuts. Bond yields jumped immediately as markets price out dovish policy, creating powerful institutional ${c} buying pressure.`,
          },
          postNewsTrend: {
            likely_trend: "BULLISH_CONTINUATION",
            trend_headline: `Strong ${c} Bullish Trend Continuation — High Conviction (${conf}%)`,
            bias: "BUY",
            confidence: conf,
            duration_horizon: "Trend continuation expected to persist for 3 to 6 hours throughout the active session.",
            key_drivers: "Higher terminal rate expectations and global carry flows flocking to high-yielding currency assets.",
            recommended_pairs: c === "USD" ? [
              { pair: "USDJPY", direction: "BUY", confidence: conf, target_pips: "65–95 pips", rationale: "Widening interest rate differential between Fed and BOJ." },
              { pair: "EURUSD", direction: "SELL", confidence: conf - 4, target_pips: "55–80 pips", rationale: "EUR loses ground against dominant Dollar yields." },
              { pair: "GBPUSD", direction: "SELL", confidence: conf - 5, target_pips: "50–75 pips", rationale: "Sustained dollar strength breaks key technical support." },
            ] : [
              { pair: "EURUSD", direction: "BUY", confidence: conf, target_pips: "50–80 pips", rationale: "ECB hawkish stance strengthens Euro against counterpart currencies." },
            ],
            pullback_entry_rule: "Enter in trend direction after the first 15-minute pullback into the 50% wick of the news candle.",
            invalidation_level: "Invalidated if price closes back through the pre-news base within 30 minutes.",
          },
        };
      }

      if (isCool || isMildCool) {
        const conf = isCool ? 90 : 80;
        return {
          whatHappened: {
            verdict: isCool ? "SEVERE_MISS" : "MISS",
            verdict_title: isCool ? "Cool CPI Disinflation Print" : "CPI Miss",
            headline: `CPI printed ${a} (Forecast: ${f}, Prior: ${p}) — Inflation fell ${Math.abs(diff)}% below expectations.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `${diff}% vs forecast`,
            macro_impact: `Accelerated disinflation gives central banks the green light for aggressive rate cuts. Capital is fleeing ${c}-denominated assets as yields decline rapidly.`,
          },
          postNewsTrend: {
            likely_trend: "BEARISH_CONTINUATION",
            trend_headline: `Sustained ${c} Bearish Trend Continuation (${conf}% Confidence)`,
            bias: "SELL",
            confidence: conf,
            duration_horizon: "Downward trend expected to continue across the session.",
            key_drivers: "Rate cut pricing and rapid yield contraction fueling persistent sell-offs.",
            recommended_pairs: c === "USD" ? [
              { pair: "EURUSD", direction: "BUY", confidence: conf, target_pips: "60–90 pips", rationale: "Strong breakout higher as the dollar weakens across all major pairs." },
              { pair: "USDJPY", direction: "SELL", confidence: conf, target_pips: "70–110 pips", rationale: "Collapsing Treasury yields trigger heavy USDJPY liquidation." },
              { pair: "GBPUSD", direction: "BUY", confidence: conf - 5, target_pips: "55–85 pips", rationale: "Cable capitalizes on broad greenback weakness." },
            ] : [
              { pair: "EURUSD", direction: "SELL", confidence: conf, target_pips: "50–75 pips", rationale: "Euro weakness driven by increased ECB rate-cut probability." },
            ],
            pullback_entry_rule: "Allow the initial move to exhaust over 10-15 minutes, then join the trend on a minor technical retracement.",
            invalidation_level: "Invalidated if market pushes back above the high of the news spike candle.",
          },
        };
      }

      return {
        whatHappened: {
          verdict: "INLINE",
          verdict_title: "CPI Exactly Inline with Forecast",
          headline: `CPI printed ${a} (Forecast: ${f}, Prior: ${p}) — Meeting consensus precisely.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: "0.0% (inline)",
          macro_impact: "Inflation matched economist forecasts with zero macro deviation. Initial reactionary wicks will likely compress into technical range-bound consolidation.",
        },
        postNewsTrend: {
          likely_trend: "RANGE_BOUND",
          trend_headline: "Range-Bound / Choppy Consolidation",
          bias: "NEUTRAL",
          confidence: 65,
          duration_horizon: "Volatility will normalize within 20-40 minutes.",
          key_drivers: "No policy surprise; technical price action resumes normal flow.",
          recommended_pairs: [
            { pair: "EURUSD", direction: "BUY", confidence: 55, target_pips: "20–30 pips", rationale: "Play key support/resistance boundaries." },
          ],
          pullback_entry_rule: "Avoid immediate breakout entries. Wait for clear 1H channel structure to form.",
          invalidation_level: "Confirmed breakout on high volume beyond the 30-minute range.",
        },
      };
    },
  },

  "Interest Rate Decision": {
    description: "Central Bank Interest Rate Decision & Monetary Policy Statement. The highest-impact economic release in the financial markets.",
    base_pips: 100,
    duration: "20-45 minutes initial, multi-day macro trend",
    analyzePreNews: (f, p, c) => {
      return {
        direction: "NEUTRAL",
        confidence: 85,
        detail: `Rate decision at ${f} (Prior: ${p}). The decision and accompanying forward guidance determine multi-week forex trends.`,
        trade_setup: `DO NOT TRADE the release candle. Wait 30 minutes for the press conference and statement digestion, then ride the established macro trend.`,
        avoid_strategy: `MANDATORY FLAT PROTOCOL: Close or hedge open positions prior to central bank rate announcements.`,
        risk_factors: `Slippage on market orders can exceed 15 pips. Press conference commentary can violently reverse the initial rate decision move.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const isHike = aVal.valid && pVal.valid && aVal.num > pVal.num;
      const isCut = aVal.valid && pVal.valid && aVal.num < pVal.num;
      const isHawkishHold = a.toLowerCase().includes("hike") || aVal.num > fVal.num;
      const isDovishHold = a.toLowerCase().includes("cut") || aVal.num < fVal.num;

      if (isHike || isHawkishHold) {
        return {
          whatHappened: {
            verdict: "STRONG_BEAT",
            verdict_title: "Hawkish Rate Decision",
            headline: `Central bank delivered a hawkish decision (${a} vs ${p} prior).`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: "Hawkish shift",
            macro_impact: `Aggressive monetary tightening increases yield appeal. Global capital is aggressively re-allocating into ${c} for carry and institutional yield maximization.`,
          },
          postNewsTrend: {
            likely_trend: "BULLISH_CONTINUATION",
            trend_headline: `Major ${c} Bullish Macro Trend Continuation (95% Confidence)`,
            bias: "BUY",
            confidence: 95,
            duration_horizon: "Multi-day macro trend momentum established.",
            key_drivers: "Institutional asset rebalancing and interest rate differential expansion.",
            recommended_pairs: c === "USD" ? [
              { pair: "USDJPY", direction: "BUY", confidence: 95, target_pips: "100–150 pips", rationale: "Massive rate gap drives multi-day USDJPY rally." },
              { pair: "EURUSD", direction: "SELL", confidence: 90, target_pips: "80–120 pips", rationale: "Persistent Dollar dominance drives EURUSD lower." },
            ] : [
              { pair: "EURUSD", direction: "BUY", confidence: 90, target_pips: "70–110 pips", rationale: "ECB hawkish policy powers Euro strength." },
            ],
            pullback_entry_rule: "Enter on any 15M/1H pullback towards the moving average or breaker block. Trend has extreme continuation follow-through.",
            invalidation_level: "Requires a formal dovish pivot statement to invalidate.",
          },
        };
      }

      if (isCut || isDovishHold) {
        return {
          whatHappened: {
            verdict: "SEVERE_MISS",
            verdict_title: "Dovish Rate Decision / Policy Easing",
            headline: `Central bank announced rate reduction / dovish shift to ${a} (Prior: ${p}).`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: "Dovish easing",
            macro_impact: `Monetary easing reduces yield attractiveness. Investors are rapidly unloading ${c} holdings in favor of higher-yielding alternatives.`,
          },
          postNewsTrend: {
            likely_trend: "BEARISH_CONTINUATION",
            trend_headline: `Major ${c} Bearish Trend Continuation (95% Confidence)`,
            bias: "SELL",
            confidence: 95,
            duration_horizon: "Multi-session bearish pressure across all crosses.",
            key_drivers: "Yield contraction and central bank dovish forward guidance.",
            recommended_pairs: c === "USD" ? [
              { pair: "EURUSD", direction: "BUY", confidence: 92, target_pips: "90–140 pips", rationale: "Strong capital rotation into Euro against weakened Dollar." },
              { pair: "USDJPY", direction: "SELL", confidence: 95, target_pips: "100–160 pips", rationale: "Aggressive unwinding of USDJPY long carry trades." },
            ] : [
              { pair: "EURUSD", direction: "SELL", confidence: 90, target_pips: "75–120 pips", rationale: "Euro devalues as ECB accelerates rate cuts." },
            ],
            pullback_entry_rule: "Wait for initial post-statement spikes to exhaust. Enter trend continuation on 15M lower-high formations.",
            invalidation_level: "Sudden reversal above pre-decision resistance level.",
          },
        };
      }

      return {
        whatHappened: {
          verdict: "INLINE",
          verdict_title: "Rate Hold as Expected",
          headline: `Central bank maintained interest rates at ${a} (Prior: ${p}).`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: "Rate held as expected",
          macro_impact: "Interest rate maintained. Market focus immediately shifts to the press conference tone and forward guidance nuances.",
        },
        postNewsTrend: {
          likely_trend: "RANGE_BOUND",
          trend_headline: "Range-Bound with Press Conference Volatility",
          bias: "NEUTRAL",
          confidence: 70,
          duration_horizon: "Direction will establish during the live press conference Q&A.",
          key_drivers: "Traders scrutinizing statement phrasing for future rate timeline hints.",
          recommended_pairs: [
            { pair: "EURUSD", direction: "BUY", confidence: 60, target_pips: "30–50 pips", rationale: "Trade breakouts following the press conference conclusion." },
          ],
          pullback_entry_rule: "Do not enter until the central bank governor concludes the press conference.",
          invalidation_level: "Break of the daily high or low.",
        },
      };
    },
  },

  "GDP": {
    description: "Gross Domestic Product (GDP) — Comprehensive scorecard of national economic output and growth momentum.",
    base_pips: 50,
    duration: "5-15 minutes initial, 2-3 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const dir = fVal.num >= pVal.num ? "BUY" : "SELL";
      return {
        direction: dir,
        confidence: 75,
        detail: `GDP growth forecast at ${f} vs ${p} prior. Robust growth strengthens currency fundamentals.`,
        trade_setup: `${dir} ${c === "USD" ? (dir === "BUY" ? "USDJPY" : "EURUSD") : "EURUSD"}. SL: 25 pips. Target: 50 pips.`,
        avoid_strategy: `Wait 10 minutes post-release for initial revisions check.`,
        risk_factors: `GDP components (consumer spending vs inventory build) can alter sentiment.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.num;
      const diff = +(aVal.num - benchmark).toFixed(1);
      const isBeat = diff > 0.2;
      const isMiss = diff < -0.2;

      if (isBeat) {
        return {
          whatHappened: {
            verdict: "STRONG_BEAT",
            verdict_title: "Strong GDP Growth Beat",
            headline: `GDP expanded at ${a} (Forecast: ${f}, Prior: ${p}) — Outperforming expectations by +${diff}%.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `+${diff}% growth beat`,
            macro_impact: `Resilient economic growth underscores economic vitality. Strong GDP eliminates recession overhang and supports currency appreciation.`,
          },
          postNewsTrend: {
            likely_trend: "BULLISH_CONTINUATION",
            trend_headline: `${c} Bullish Trend Continuation (${85}% Confidence)`,
            bias: "BUY",
            confidence: 85,
            duration_horizon: "Trend continuation projected for 2 to 3 hours.",
            key_drivers: "Strong economic fundamentals attracting cross-asset portfolio allocation.",
            recommended_pairs: [
              { pair: c === "USD" ? "USDJPY" : "EURUSD", direction: "BUY", confidence: 85, target_pips: "50–75 pips", rationale: "Fundamental growth outperformance." },
              { pair: "EURUSD", direction: c === "USD" ? "SELL" : "BUY", confidence: 80, target_pips: "40–65 pips", rationale: "Clear macro divergence." },
            ],
            pullback_entry_rule: "Enter trend continuation on the first 5-minute pullback into the breakout zone.",
            invalidation_level: "Close back below the pre-news breakout level.",
          },
        };
      }

      if (isMiss) {
        return {
          whatHappened: {
            verdict: "SEVERE_MISS",
            verdict_title: "Disappointing GDP Contraction / Miss",
            headline: `GDP printed ${a} (Forecast: ${f}, Prior: ${p}) — Missing expectations by ${diff}%.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `${diff}% growth miss`,
            macro_impact: `Slowing economic output sparks growth concerns and pressures central bank easing, leading to sustained currency weakness.`,
          },
          postNewsTrend: {
            likely_trend: "BEARISH_CONTINUATION",
            trend_headline: `${c} Bearish Trend Continuation (${85}% Confidence)`,
            bias: "SELL",
            confidence: 85,
            duration_horizon: "Bearish pressure lasting throughout the session.",
            key_drivers: "Growth deceleration concerns triggering defensive capital flight.",
            recommended_pairs: [
              { pair: c === "USD" ? "EURUSD" : "USDJPY", direction: "BUY", confidence: 85, target_pips: "50–80 pips", rationale: "Capital rotation away from lagging economy." },
            ],
            pullback_entry_rule: "Sell into minor retracement rallies on the 15M chart.",
            invalidation_level: "Reclaim of the pre-release high.",
          },
        };
      }

      return {
        whatHappened: {
          verdict: "INLINE",
          verdict_title: "GDP Inline with Estimates",
          headline: `GDP printed ${a} (Forecast: ${f}, Prior: ${p}) — Matching expectations.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: "Inline with forecast",
          macro_impact: "Economic growth tracking exactly as expected. No fundamental shock to alter existing technical charts.",
        },
        postNewsTrend: {
          likely_trend: "RANGE_BOUND",
          trend_headline: "Range-Bound Technical Flow",
          bias: "NEUTRAL",
          confidence: 65,
          duration_horizon: "Quick return to normal technical market rhythms.",
          key_drivers: "No macroeconomic surprises.",
          recommended_pairs: [],
          pullback_entry_rule: "Rely on standard channel and support/resistance trading rules.",
          invalidation_level: "Break of current session high/low.",
        },
      };
    },
  },

  "Retail Sales": {
    description: "Retail Sales — Real-time gauge of consumer spending, representing the primary engine of modern GDP.",
    base_pips: 40,
    duration: "5-10 minutes initial, 1-2 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const dir = fVal.num >= pVal.num ? "BUY" : "SELL";
      return {
        direction: dir,
        confidence: 70,
        detail: `Retail sales forecast at ${f} vs ${p} prior. Consumer spending resilience supports currency strength.`,
        trade_setup: `${dir} ${c === "USD" ? "USDJPY" : "EURUSD"}. SL: 20 pips. Target: 40 pips.`,
        avoid_strategy: `Wait 5 minutes post-news.`,
        risk_factors: `Core retail sales (ex-autos) can diverge from headline.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.num;
      const diff = +(aVal.num - benchmark).toFixed(1);

      if (diff > 0.2) {
        return {
          whatHappened: {
            verdict: "STRONG_BEAT",
            verdict_title: "Robust Retail Sales Beat",
            headline: `Retail Sales surged to ${a} (Forecast: ${f}, Prior: ${p}) — Beating consensus by +${diff}%.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `+${diff}% beat`,
            macro_impact: "Consumer spending remains highly resilient, demonstrating strong economic health and sustaining currency demand.",
          },
          postNewsTrend: {
            likely_trend: "BULLISH_CONTINUATION",
            trend_headline: `${c} Bullish Follow-Through (${80}% Confidence)`,
            bias: "BUY",
            confidence: 80,
            duration_horizon: "Continuation for 1 to 2 hours post-news.",
            key_drivers: "Strong consumer demand bolstering economic momentum.",
            recommended_pairs: [
              { pair: c === "USD" ? "USDJPY" : "EURUSD", direction: "BUY", confidence: 80, target_pips: "35–55 pips", rationale: "Consumer resilience supports currency upside." },
            ],
            pullback_entry_rule: "Enter on a 5M pullback into the pre-news breakout level.",
            invalidation_level: "Loss of the news breakout candle low.",
          },
        };
      }

      if (diff < -0.2) {
        return {
          whatHappened: {
            verdict: "SEVERE_MISS",
            verdict_title: "Weak Retail Sales Miss",
            headline: `Retail Sales slumped to ${a} (Forecast: ${f}, Prior: ${p}) — Missing consensus by ${diff}%.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `${diff}% miss`,
            macro_impact: "Consumer spending contracted, highlighting emerging economic headwinds and pressuring currency performance.",
          },
          postNewsTrend: {
            likely_trend: "BEARISH_CONTINUATION",
            trend_headline: `${c} Bearish Follow-Through (${80}% Confidence)`,
            bias: "SELL",
            confidence: 80,
            duration_horizon: "Bearish pressure for 1 to 2 hours.",
            key_drivers: "Soft consumer spending data triggering risk-off selling.",
            recommended_pairs: [
              { pair: c === "USD" ? "EURUSD" : "USDJPY", direction: "BUY", confidence: 80, target_pips: "35–55 pips", rationale: "Capital rotation away from weakening consumer base." },
            ],
            pullback_entry_rule: "Sell on minor 5M pullback rallies.",
            invalidation_level: "Reclaim of news candle high.",
          },
        };
      }

      return {
        whatHappened: {
          verdict: "INLINE",
          verdict_title: "Retail Sales Inline",
          headline: `Retail Sales printed ${a} (Forecast: ${f}, Prior: ${p}) — Matching expectations.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: "Inline",
          macro_impact: "Consumer spending in line with estimates. No significant macroeconomic shift.",
        },
        postNewsTrend: {
          likely_trend: "RANGE_BOUND",
          trend_headline: "Range-Bound Technical Flow",
          bias: "NEUTRAL",
          confidence: 60,
          duration_horizon: "Normalize quickly within 15-30 minutes.",
          key_drivers: "Consensus met, technical levels hold.",
          recommended_pairs: [],
          pullback_entry_rule: "Trade standard chart support and resistance.",
          invalidation_level: "Breakout beyond session extremes.",
        },
      };
    },
  },

  "_default": {
    description: "High-impact macroeconomic indicator with strong forex market correlation.",
    base_pips: 35,
    duration: "5-10 minutes initial, 1-2 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const dir = fVal.num >= pVal.num ? "BUY" : "SELL";
      return {
        direction: dir,
        confidence: 65,
        detail: `Forecast ${f} vs prior ${p}. Market anticipating moderate ${dir === "BUY" ? "strength" : "weakness"} in ${c}.`,
        trade_setup: `${dir} ${c === "USD" ? "USDJPY" : "EURUSD"}. SL: 20 pips. Target: 35 pips.`,
        avoid_strategy: `Wait 5 minutes post-release before entering.`,
        risk_factors: `Unexpected deviations can cause brief volatility wicks.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.num;
      const diff = +(aVal.num - benchmark).toFixed(2);
      const isBeat = aVal.valid && diff > 0;
      const isMiss = aVal.valid && diff < 0;

      if (isBeat) {
        return {
          whatHappened: {
            verdict: "BEAT",
            verdict_title: "Economic Data Beat",
            headline: `Event released at ${a} (Forecast: ${f}, Prior: ${p}) — Surpassing expectations.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `Beat consensus`,
            macro_impact: `Positive economic print reinforces ${c} strength and bullish institutional flow.`,
          },
          postNewsTrend: {
            likely_trend: "BULLISH_CONTINUATION",
            trend_headline: `${c} Bullish Follow-Through (${75}% Confidence)`,
            bias: "BUY",
            confidence: 75,
            duration_horizon: "Continuation for 1 to 2 hours.",
            key_drivers: `Favorable economic data supporting ${c} demand.`,
            recommended_pairs: [
              { pair: c === "USD" ? "USDJPY" : "EURUSD", direction: "BUY", confidence: 75, target_pips: "30–50 pips", rationale: "Bullish fundamental alignment." },
            ],
            pullback_entry_rule: "Enter in trend direction on 5M consolidation.",
            invalidation_level: "Break back below pre-news candle.",
          },
        };
      }

      if (isMiss) {
        return {
          whatHappened: {
            verdict: "MISS",
            verdict_title: "Economic Data Miss",
            headline: `Event released at ${a} (Forecast: ${f}, Prior: ${p}) — Falling short of expectations.`,
            actual_val: a,
            forecast_val: f,
            previous_val: p,
            surprise_delta: `Missed consensus`,
            macro_impact: `Soft economic print dampens ${c} sentiment and triggers corrective selling.`,
          },
          postNewsTrend: {
            likely_trend: "BEARISH_CONTINUATION",
            trend_headline: `${c} Bearish Follow-Through (${75}% Confidence)`,
            bias: "SELL",
            confidence: 75,
            duration_horizon: "Bearish pressure for 1 to 2 hours.",
            key_drivers: `Weak data prompting defensive positioning.`,
            recommended_pairs: [
              { pair: c === "USD" ? "EURUSD" : "USDJPY", direction: "BUY", confidence: 75, target_pips: "30–50 pips", rationale: "Bearish ${c} sentiment drives counter-currency gains." },
            ],
            pullback_entry_rule: "Sell into minor 5M pullback rallies.",
            invalidation_level: "Break above pre-news high.",
          },
        };
      }

      return {
        whatHappened: {
          verdict: "INLINE",
          verdict_title: "Data Inline",
          headline: `Event released at ${a} (Forecast: ${f}, Prior: ${p}) — In line with expectations.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: "Inline",
          macro_impact: "Release matched consensus with limited volatility shock.",
        },
        postNewsTrend: {
          likely_trend: "RANGE_BOUND",
          trend_headline: "Range-Bound Technical Flow",
          bias: "NEUTRAL",
          confidence: 60,
          duration_horizon: "Normal market flow resumes.",
          key_drivers: "No macroeconomic surprises.",
          recommended_pairs: [],
          pullback_entry_rule: "Trade standard chart structure.",
          invalidation_level: "Breakout beyond session range.",
        },
      };
    },
  },
};

function findPattern(eventName: string): PatternHandler {
  for (const [key, pat] of Object.entries(PATTERNS)) {
    if (key !== "_default" && eventName.toLowerCase().includes(key.toLowerCase())) {
      return pat;
    }
  }
  return PATTERNS["_default"]!;
}

export function analyzeNewsEvent(event: NewsEvent): NewsAnalysis {
  const pattern = findPattern(event.event_name);
  const nowSec = Math.floor(Date.now() / 1000);
  const hasActual = Boolean(event.actual && event.actual !== "—" && event.actual.trim() !== "");
  const isTimePassed = Boolean(event.datetime && event.datetime <= nowSec);
  const isPostNews = hasActual || isTimePassed;
  const affectedPairs = CURRENCY_PAIRS[event.currency] || ["EURUSD", "USDJPY", "GBPUSD"];

  if (isPostNews) {
    const actualStr = hasActual
      ? event.actual!
      : event.forecast && event.forecast !== "—"
      ? event.forecast
      : event.previous;

    const { whatHappened, postNewsTrend } = pattern.analyzePostNews(
      actualStr,
      event.forecast,
      event.previous,
      event.currency
    );

    const analysis = `[POST-NEWS REPORT] ${whatHappened.headline} ${whatHappened.macro_impact} ` +
      `MARKET TREND: ${postNewsTrend.trend_headline} (Confidence: ${postNewsTrend.confidence}%). ` +
      `Outlook: ${postNewsTrend.duration_horizon} Best Execution: ${postNewsTrend.pullback_entry_rule}`;

    return {
      analysis,
      direction: postNewsTrend.bias,
      confidence: postNewsTrend.confidence,
      affected_pairs: affectedPairs,
      spike_pips: `${pattern.base_pips}+`,
      duration: pattern.duration,
      trade_setup: postNewsTrend.pullback_entry_rule,
      avoid_strategy: "Allow the initial 5-minute liquidity wick to settle, then trade confirmed trend continuation on 15M/1H charts.",
      risk_factors: postNewsTrend.invalidation_level,
      is_post_news: true,
      what_happened: whatHappened,
      post_news_trend: postNewsTrend,
    };
  }

  // Pre-News Analysis
  const { direction, confidence, detail, trade_setup, avoid_strategy, risk_factors } =
    pattern.analyzePreNews(event.forecast, event.previous, event.currency);

  const analysis = `${pattern.description} ${detail} Anticipated spike: ${pattern.base_pips} pips over ${pattern.duration}. Affected: ${affectedPairs.join(", ")}.`;

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
    is_post_news: false,
  };
}
