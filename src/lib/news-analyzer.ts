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

function generatePairRecommendations(
  currency: string,
  bias: "BUY" | "SELL" | "NEUTRAL",
  confidence: number,
  basePips: number
): PairRecommendation[] {
  if (bias === "NEUTRAL") return [];
  const pips = Math.round(basePips * 0.9);
  const targetStr = `${pips}–${Math.round(pips * 1.5)} pips`;

  if (currency === "USD") {
    return bias === "BUY"
      ? [
          { pair: "USDJPY", direction: "BUY", confidence, target_pips: targetStr, rationale: "Yield expansion powers USD upside against JPY." },
          { pair: "EURUSD", direction: "SELL", confidence: confidence - 4, target_pips: targetStr, rationale: "Dollar strength forces breakdown below key support." },
          { pair: "GBPUSD", direction: "SELL", confidence: confidence - 5, target_pips: targetStr, rationale: "Broad USD strength pressures Cable lower." },
        ]
      : [
          { pair: "EURUSD", direction: "BUY", confidence, target_pips: targetStr, rationale: "Dollar liquidation triggers aggressive EURUSD rally." },
          { pair: "USDJPY", direction: "SELL", confidence, target_pips: `${pips + 10}–${Math.round(pips * 1.6)} pips`, rationale: "Falling Treasury yields drive sharp USDJPY sell-off." },
          { pair: "GBPUSD", direction: "BUY", confidence: confidence - 5, target_pips: targetStr, rationale: "Cable surges on broad USD weakness." },
        ];
  }

  if (currency === "GBP") {
    return bias === "BUY"
      ? [
          { pair: "GBPUSD", direction: "BUY", confidence, target_pips: targetStr, rationale: "Strong UK economic data drives Pound demand." },
          { pair: "EURGBP", direction: "SELL", confidence: confidence - 4, target_pips: `${Math.round(pips * 0.7)}–${pips} pips`, rationale: "Sterling outperformance forces EURGBP cross down." },
          { pair: "GBPJPY", direction: "BUY", confidence: confidence - 5, target_pips: `${pips + 15}–${Math.round(pips * 1.8)} pips`, rationale: "High-beta Pound rallies strongly against Yen." },
        ]
      : [
          { pair: "GBPUSD", direction: "SELL", confidence, target_pips: targetStr, rationale: "Weak UK data sparks aggressive Pound liquidation." },
          { pair: "EURGBP", direction: "BUY", confidence: confidence - 4, target_pips: `${Math.round(pips * 0.7)}–${pips} pips`, rationale: "Pound weakness lifts EURGBP cross." },
          { pair: "GBPJPY", direction: "SELL", confidence: confidence - 5, target_pips: `${pips + 15}–${Math.round(pips * 1.8)} pips`, rationale: "Sterling selloff accelerates drop against Yen." },
        ];
  }

  if (currency === "EUR") {
    return bias === "BUY"
      ? [
          { pair: "EURUSD", direction: "BUY", confidence, target_pips: targetStr, rationale: "Eurozone economic strength boosts Euro." },
          { pair: "EURJPY", direction: "BUY", confidence: confidence - 4, target_pips: targetStr, rationale: "Euro strength drives upside vs Yen." },
          { pair: "EURGBP", direction: "BUY", confidence: confidence - 6, target_pips: `${Math.round(pips * 0.7)}–${pips} pips`, rationale: "Euro gains ground against British Pound." },
        ]
      : [
          { pair: "EURUSD", direction: "SELL", confidence, target_pips: targetStr, rationale: "Eurozone economic headwinds trigger Euro selloff." },
          { pair: "EURJPY", direction: "SELL", confidence: confidence - 4, target_pips: targetStr, rationale: "Euro liquidation accelerates EURJPY drop." },
        ];
  }

  if (currency === "JPY") {
    return bias === "BUY"
      ? [
          { pair: "USDJPY", direction: "SELL", confidence, target_pips: targetStr, rationale: "Yen strength forces USDJPY downward." },
          { pair: "EURJPY", direction: "SELL", confidence: confidence - 4, target_pips: targetStr, rationale: "Yen appreciation drives EURJPY cross down." },
        ]
      : [
          { pair: "USDJPY", direction: "BUY", confidence, target_pips: targetStr, rationale: "Dovish Yen sentiment powers USDJPY rally." },
          { pair: "GBPJPY", direction: "BUY", confidence: confidence - 4, target_pips: targetStr, rationale: "Yen weakness powers GBPJPY cross higher." },
        ];
  }

  if (currency === "CAD") {
    return bias === "BUY"
      ? [
          { pair: "USDCAD", direction: "SELL", confidence, target_pips: targetStr, rationale: "Strong Canadian data bolsters Loonie strength." },
        ]
      : [
          { pair: "USDCAD", direction: "BUY", confidence, target_pips: targetStr, rationale: "Weak Canadian data boosts USDCAD upside." },
        ];
  }

  if (currency === "AUD") {
    return bias === "BUY"
      ? [
          { pair: "AUDUSD", direction: "BUY", confidence, target_pips: targetStr, rationale: "Australian data outperformance drives Aussie rally." },
        ]
      : [
          { pair: "AUDUSD", direction: "SELL", confidence, target_pips: targetStr, rationale: "Aussie faces downward pressure." },
        ];
  }

  // Default
  return [
    { pair: "EURUSD", direction: bias === "BUY" ? "BUY" : "SELL", confidence, target_pips: targetStr, rationale: `Direct macro alignment with ${currency} ${bias.toLowerCase()} momentum.` },
  ];
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
  "Unemployment": {
    description: "Unemployment Rate — Inverse indicator measuring labor market slack. Lower rate = stronger currency economy.",
    base_pips: 45,
    duration: "5-15 minutes initial, 2-3 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const isDropping = fVal.valid && pVal.valid && fVal.num < pVal.num;
      const isRising = fVal.valid && pVal.valid && fVal.num > pVal.num;
      return {
        direction: isDropping ? "BUY" : isRising ? "SELL" : "NEUTRAL",
        confidence: isDropping || isRising ? 75 : 60,
        detail: `Forecast ${f} vs prior ${p}. Lower unemployment signals tightening labor market and hawkish policy support for ${c}.`,
        trade_setup: `Wait for release. If unemployment drops, look for ${c} long entries after 5M consolidation.`,
        avoid_strategy: `Do not hold pending orders into the release.`,
        risk_factors: `Simultaneous wage growth or participation rate changes can affect final direction.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.valid ? pVal.num : aVal.num;
      // Note: for unemployment, actual < forecast is a POSITIVE BEAT (good for currency)
      const diff = +(aVal.num - benchmark).toFixed(2);
      const isBeat = aVal.valid && diff < -0.05; // Lower unemployment = beat
      const isMiss = aVal.valid && diff > 0.05;  // Higher unemployment = miss

      const conf = isBeat ? 85 : isMiss ? 85 : 70;
      const bias: "BUY" | "SELL" | "NEUTRAL" = isBeat ? "BUY" : isMiss ? "SELL" : "NEUTRAL";
      const verdict = isBeat ? "STRONG_BEAT" : isMiss ? "SEVERE_MISS" : "INLINE";
      const verdictTitle = isBeat ? "Tight Labor Market / Lower Unemployment" : isMiss ? "Rising Unemployment / Labor Slack" : "Unemployment Rate Inline";

      return {
        whatHappened: {
          verdict,
          verdict_title: verdictTitle,
          headline: `Unemployment printed ${a} (Forecast: ${f}, Prior: ${p}) — ${isBeat ? `Lower by ${Math.abs(diff)}% (positive for ${c})` : isMiss ? `Higher by +${diff}% (negative for ${c})` : "Meeting consensus"}.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: `${diff > 0 ? "+" : ""}${diff}% vs forecast`,
          macro_impact: isBeat
            ? `Labor market remains tight with falling unemployment. This supports consumer spending, sustains domestic wage growth, and reinforces hawkish central bank rate expectations, creating strong institutional ${c} buying momentum.`
            : isMiss
            ? `Rising unemployment indicates softening economic conditions and labor market slack. This increases pressure on the central bank to ease monetary policy, triggering defensive capital rotation away from ${c}.`
            : `Unemployment rate matched economist expectations precisely. No unexpected policy shock.`,
        },
        postNewsTrend: {
          likely_trend: isBeat ? "BULLISH_CONTINUATION" : isMiss ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `${c} ${isBeat ? "Bullish" : isMiss ? "Bearish" : "Consolidation"} Trend Continuation (${conf}% Confidence)`,
          bias,
          confidence: conf,
          duration_horizon: "Trend continuation projected for 2 to 3 hours across the active session.",
          key_drivers: `${isBeat ? "Resilient labor fundamentals and yields" : "Labor slack and dovish interest rate repricing"} driving institutional flow.`,
          recommended_pairs: generatePairRecommendations(c, bias, conf, 45),
          pullback_entry_rule: `Wait for the initial 5M liquidity spike to settle. Enter in the direction of the ${bias.toLowerCase()} trend on a 38.2%-50% retracement.`,
          invalidation_level: `Invalidated if price breaks through the pre-news consolidation boundary.`,
        },
      };
    },
  },

  "Employment": {
    description: "Employment Change & Net Jobs Added — Measures workforce expansion and economic vitality.",
    base_pips: 50,
    duration: "5-15 minutes initial, 2-3 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const isHigher = fVal.valid && pVal.valid && fVal.num > pVal.num;
      return {
        direction: isHigher ? "BUY" : "SELL",
        confidence: 75,
        detail: `Employment change forecast at ${f} vs ${p} prior. Positive job growth strengthens ${c} demand.`,
        trade_setup: `Follow post-release momentum after the 5M candle close.`,
        avoid_strategy: `Avoid entering during the first 3 minutes of the release.`,
        risk_factors: `Look for revisions to previous month figures.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.valid ? pVal.num : 0;
      const diff = +(aVal.num - benchmark).toFixed(0);
      const isBeat = aVal.valid && diff > 0;
      const isMiss = aVal.valid && diff < 0;

      const conf = Math.abs(diff) > 20 ? 88 : 78;
      const bias: "BUY" | "SELL" | "NEUTRAL" = isBeat ? "BUY" : isMiss ? "SELL" : "NEUTRAL";

      return {
        whatHappened: {
          verdict: isBeat ? "STRONG_BEAT" : isMiss ? "SEVERE_MISS" : "INLINE",
          verdict_title: isBeat ? "Strong Employment Growth Beat" : isMiss ? "Employment Contraction / Miss" : "Employment Inline",
          headline: `Employment Change printed ${a} (Forecast: ${f}, Prior: ${p}) — ${isBeat ? `Beating estimates by +${diff}` : isMiss ? `Missing estimates by ${diff}` : "Matching consensus"}.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: `${diff > 0 ? "+" : ""}${diff} vs forecast`,
          macro_impact: isBeat
            ? `Substantial employment growth reinforces economic resilience and supports currency appreciation across major forex pairs.`
            : isMiss
            ? `Weaker job creation points to macroeconomic cooling, prompting capital outflow and currency devaluation.`
            : `Employment numbers aligned with market expectations.`,
        },
        postNewsTrend: {
          likely_trend: isBeat ? "BULLISH_CONTINUATION" : isMiss ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `${c} ${isBeat ? "Bullish" : isMiss ? "Bearish" : "Consolidation"} Trend Continuation (${conf}% Confidence)`,
          bias,
          confidence: conf,
          duration_horizon: "Trend continuation projected for 2 to 3 hours.",
          key_drivers: `Institutional asset rebalancing following ${isBeat ? "solid hiring beat" : "employment deceleration"}.`,
          recommended_pairs: generatePairRecommendations(c, bias, conf, 50),
          pullback_entry_rule: `Allow initial volatility to normalize over 5-10 minutes, then enter on a pullback in the direction of the confirmed trend.`,
          invalidation_level: `Loss of the news candle extreme.`,
        },
      };
    },
  },

  "Earnings": {
    description: "Average Earnings & Wage Growth — Key gauge of wage-push inflation and central bank interest rate pressure.",
    base_pips: 40,
    duration: "5-10 minutes initial, 1-2 hours continuation",
    analyzePreNews: (f, p, c) => {
      return {
        direction: "BUY",
        confidence: 70,
        detail: `Wage growth forecast at ${f} vs ${p} prior. Rising earnings increase inflation pressure, supporting ${c} yields.`,
        trade_setup: `Trade continuation if wage growth beats consensus.`,
        avoid_strategy: `Flat during release.`,
        risk_factors: `Wage data released alongside unemployment rate.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.valid ? pVal.num : 0;
      const diff = +(aVal.num - benchmark).toFixed(2);
      const isBeat = aVal.valid && diff >= 0.1;
      const isMiss = aVal.valid && diff <= -0.1;
      const bias: "BUY" | "SELL" | "NEUTRAL" = isBeat ? "BUY" : isMiss ? "SELL" : "NEUTRAL";
      const conf = 80;

      return {
        whatHappened: {
          verdict: isBeat ? "BEAT" : isMiss ? "MISS" : "INLINE",
          verdict_title: isBeat ? "Strong Wage Growth Print" : isMiss ? "Cooling Wage Growth" : "Wage Growth Inline",
          headline: `Average Earnings printed ${a} (Forecast: ${f}, Prior: ${p}) — ${isBeat ? "Accelerating wage growth" : isMiss ? "Slowing wage growth" : "In line with estimates"}.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: `${diff > 0 ? "+" : ""}${diff}% vs forecast`,
          macro_impact: isBeat
            ? `Higher wage growth fuels domestic inflation pressure, making central banks more reluctant to cut interest rates, which directly strengthens ${c}.`
            : isMiss
            ? `Moderating wage growth provides relief for inflation concerns and opens the door for monetary easing, softening ${c} demand.`
            : `Wage growth printed inline with consensus estimates.`,
        },
        postNewsTrend: {
          likely_trend: isBeat ? "BULLISH_CONTINUATION" : isMiss ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `${c} ${isBeat ? "Bullish" : isMiss ? "Bearish" : "Consolidation"} Trend (${conf}% Confidence)`,
          bias,
          confidence: conf,
          duration_horizon: "Trend continuation expected for 1 to 2 hours.",
          key_drivers: `Wage inflation trajectory and monetary policy implications driving currency demand.`,
          recommended_pairs: generatePairRecommendations(c, bias, conf, 40),
          pullback_entry_rule: `Enter on 5M consolidation following the release.`,
          invalidation_level: `Break of the pre-news range.`,
        },
      };
    },
  },

  "Non-Farm Payrolls": {
    description: "US Non-Farm Payrolls (NFP) — Measures net new jobs created outside farming. Primary driver of Fed interest rate expectations.",
    base_pips: 80,
    duration: "10-20 minutes initial, 2-4 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const isHigh = fVal.valid && pVal.valid && fVal.num > pVal.num;
      return {
        direction: isHigh ? "BUY" : "SELL",
        confidence: 85,
        detail: `NFP forecast at ${f} vs ${p} prev. Market anticipating robust USD hiring and hawkish Fed rate trajectory.`,
        trade_setup: `BUY USDJPY or SELL EURUSD. Await 5M post-release consolidation before entering. Stop loss: 30 pips. Target: 75-100 pips.`,
        avoid_strategy: `STAY FLAT ±30 min around release. NFP produces severe 5-pip spread spikes and initial whipsaws.`,
        risk_factors: `Watch Average Hourly Earnings (wages) and Unemployment Rate released simultaneously. Mixed numbers cause choppy 2-way wicks.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);

      const benchmark = fVal.valid ? fVal.num : pVal.num;
      const diff = aVal.valid ? aVal.num - benchmark : 0;
      const isStrongBeat = diff >= 30;
      const isBeat = diff > 5 && diff < 30;
      const isSevereMiss = diff <= -30;
      const isMiss = diff < -5 && diff > -30;

      const bias: "BUY" | "SELL" | "NEUTRAL" = (isStrongBeat || isBeat) ? "BUY" : (isSevereMiss || isMiss) ? "SELL" : "NEUTRAL";
      const conf = isStrongBeat || isSevereMiss ? 92 : 82;

      return {
        whatHappened: {
          verdict: isStrongBeat ? "STRONG_BEAT" : isBeat ? "BEAT" : isSevereMiss ? "SEVERE_MISS" : isMiss ? "MISS" : "INLINE",
          verdict_title: isStrongBeat ? "Massive NFP Beat" : isBeat ? "Solid NFP Beat" : isSevereMiss ? "Severe NFP Miss" : isMiss ? "NFP Miss" : "NFP Inline",
          headline: `NFP printed ${a} (Forecast: ${f}, Prior: ${p}) — ${diff > 0 ? `Surpassing expectations by +${diff.toFixed(0)}K` : `Falling short by ${diff.toFixed(0)}K`}.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: `${diff > 0 ? "+" : ""}${diff.toFixed(0)}K vs forecast`,
          macro_impact: (isStrongBeat || isBeat)
            ? "The US labor market demonstrated exceptional hiring momentum. Strong job creation dispels recession concerns and reinforces higher yields, sparking aggressive institutional capital inflows into the US Dollar."
            : (isSevereMiss || isMiss)
            ? "US hiring slowed down sharply. Weak labor data reinforces market bets on Fed monetary easing and multiple rate cuts, triggering heavy institutional selling across USD pairs."
            : "The print matched consensus. Volatility will normalize into technical range-bound consolidation.",
        },
        postNewsTrend: {
          likely_trend: (isStrongBeat || isBeat) ? "BULLISH_CONTINUATION" : (isSevereMiss || isMiss) ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `High-Confidence US Dollar ${isStrongBeat || isBeat ? "Bullish" : isSevereMiss || isMiss ? "Bearish" : "Consolidation"} Trend Continuation`,
          bias,
          confidence: conf,
          duration_horizon: "Trend continuation projected for 2 to 4 hours into the London/NY session close.",
          key_drivers: "Institutional desks and algorithm programs systematically positioning around revised Fed rate trajectory.",
          recommended_pairs: generatePairRecommendations("USD", bias, conf, 80),
          pullback_entry_rule: "Wait for the initial 5M-15M spike to consolidate. Enter in trend direction on a 38.2%-50% retracement into the news candle body.",
          invalidation_level: "Invalidated if price breaks back above/below the pre-news range origin.",
        },
      };
    },
  },

  "CPI": {
    description: "Consumer Price Index (CPI) — Headline and Core Inflation rate. The number one determinant of central bank interest rate decisions.",
    base_pips: 70,
    duration: "10-25 minutes initial, 3-6 hours continuation",
    analyzePreNews: (f, p, c) => {
      return {
        direction: "BUY",
        confidence: 80,
        detail: `CPI forecast ${f} vs prior ${p}. Inflation numbers dictate rate cuts vs rate hikes.`,
        trade_setup: `Awaits post-release confirmation.`,
        avoid_strategy: `Stay flat ±30 min around release.`,
        risk_factors: `Core vs Headline divergence.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.num;
      const diff = aVal.valid ? +(aVal.num - benchmark).toFixed(2) : 0;
      const isHot = diff >= 0.1;
      const isCool = diff <= -0.1;
      const bias: "BUY" | "SELL" | "NEUTRAL" = isHot ? "BUY" : isCool ? "SELL" : "NEUTRAL";
      const conf = Math.abs(diff) >= 0.2 ? 92 : 82;

      return {
        whatHappened: {
          verdict: isHot ? "STRONG_BEAT" : isCool ? "SEVERE_MISS" : "INLINE",
          verdict_title: isHot ? "Hot CPI Inflation Print" : isCool ? "Cool CPI Disinflation Print" : "CPI Exactly Inline",
          headline: `CPI printed ${a} (Forecast: ${f}, Prior: ${p}) — ${diff > 0 ? `+${diff}% hotter than forecast` : diff < 0 ? `${diff}% cooler than forecast` : "Meeting consensus"}.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: `${diff > 0 ? "+" : ""}${diff}% surprise`,
          macro_impact: isHot
            ? `Sticky inflation limits the scope for rate cuts. Bond yields jumped as markets price out dovish policy, creating powerful institutional ${c} buying pressure.`
            : isCool
            ? `Accelerated disinflation gives central banks the green light for rate cuts. Capital is rotating out of ${c} assets as yields decline.`
            : `Inflation matched forecasts with zero macro deviation.`,
        },
        postNewsTrend: {
          likely_trend: isHot ? "BULLISH_CONTINUATION" : isCool ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `Strong ${c} ${isHot ? "Bullish" : isCool ? "Bearish" : "Neutral"} Trend Continuation (${conf}% Confidence)`,
          bias,
          confidence: conf,
          duration_horizon: "Trend continuation expected to persist for 3 to 6 hours throughout the active session.",
          key_drivers: "Terminal rate expectations and global carry flows driving currency pairs.",
          recommended_pairs: generatePairRecommendations(c, bias, conf, 70),
          pullback_entry_rule: "Enter in trend direction after the first 15-minute pullback into the 50% wick of the news candle.",
          invalidation_level: "Invalidated if price closes back through the pre-news base within 30 minutes.",
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
        trade_setup: `DO NOT TRADE the release candle. Wait 30 minutes for the press conference and statement digestion.`,
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
      const bias: "BUY" | "SELL" | "NEUTRAL" = isHike ? "BUY" : isCut ? "SELL" : "NEUTRAL";
      const conf = 95;

      return {
        whatHappened: {
          verdict: isHike ? "STRONG_BEAT" : isCut ? "SEVERE_MISS" : "INLINE",
          verdict_title: isHike ? "Hawkish Rate Decision" : isCut ? "Dovish Rate Decision / Easing" : "Rate Hold as Expected",
          headline: `Central bank announced rate ${isHike ? "hike" : isCut ? "cut" : "hold"} at ${a} (Prior: ${p}).`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: isHike ? "Hawkish hike" : isCut ? "Dovish cut" : "Held as expected",
          macro_impact: isHike
            ? `Aggressive monetary tightening increases yield appeal, driving global capital into ${c}.`
            : isCut
            ? `Monetary easing reduces yield attractiveness, triggering heavy selling in ${c}.`
            : `Rate maintained. Market focus shifts to forward guidance nuances.`,
        },
        postNewsTrend: {
          likely_trend: isHike ? "BULLISH_CONTINUATION" : isCut ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `Major ${c} ${isHike ? "Bullish" : isCut ? "Bearish" : "Range-Bound"} Macro Trend (95% Confidence)`,
          bias,
          confidence: conf,
          duration_horizon: "Multi-session macro trend momentum established.",
          key_drivers: "Institutional asset rebalancing and interest rate differential expansion.",
          recommended_pairs: generatePairRecommendations(c, bias, conf, 100),
          pullback_entry_rule: "Enter on any 15M/1H pullback towards the moving average or breaker block.",
          invalidation_level: "Requires a formal policy pivot statement to invalidate.",
        },
      };
    },
  },

  "Sentiment": {
    description: "Economic Sentiment & Confidence Index — Measures institutional investor and business growth optimism.",
    base_pips: 40,
    duration: "5-10 minutes initial, 1-2 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const isHigher = fVal.valid && pVal.valid && fVal.num > pVal.num;
      return {
        direction: isHigher ? "BUY" : "SELL",
        confidence: 70,
        detail: `Sentiment forecast at ${f} vs ${p} prior. Rising confidence spurs investment demand for ${c}.`,
        trade_setup: `Follow post-release momentum in direction of surprise.`,
        avoid_strategy: `Wait 5 minutes post-release.`,
        risk_factors: `Market sentiment can decouple from lagging surveys.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.valid ? pVal.num : 0;
      const diff = +(aVal.num - benchmark).toFixed(1);
      const isBeat = aVal.valid && diff >= 2.0;
      const isMiss = aVal.valid && diff <= -2.0;
      const bias: "BUY" | "SELL" | "NEUTRAL" = isBeat ? "BUY" : isMiss ? "SELL" : "NEUTRAL";
      const conf = Math.abs(diff) >= 5.0 ? 85 : 75;

      return {
        whatHappened: {
          verdict: isBeat ? "STRONG_BEAT" : isMiss ? "SEVERE_MISS" : "INLINE",
          verdict_title: isBeat ? "Economic Sentiment Surge" : isMiss ? "Economic Sentiment Slump" : "Sentiment Inline",
          headline: `Economic Sentiment printed ${a} (Forecast: ${f}, Prior: ${p}) — ${isBeat ? `Beating estimates by +${diff}` : isMiss ? `Missing estimates by ${diff}` : "Matching consensus"}.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: `${diff > 0 ? "+" : ""}${diff} vs forecast`,
          macro_impact: isBeat
            ? `Institutional and business sentiment improved significantly, demonstrating rising confidence in ${c} economic outlook and driving currency inflows.`
            : isMiss
            ? `Economic sentiment deteriorated sharply below expectations, reflecting growing economic uncertainty and triggering capital outflow from ${c}.`
            : `Sentiment figures matched consensus expectations closely.`,
        },
        postNewsTrend: {
          likely_trend: isBeat ? "BULLISH_CONTINUATION" : isMiss ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `${c} ${isBeat ? "Bullish" : isMiss ? "Bearish" : "Consolidation"} Trend Follow-Through (${conf}% Confidence)`,
          bias,
          confidence: conf,
          duration_horizon: "Trend continuation projected for 1 to 2 hours.",
          key_drivers: `Institutional confidence shift driving ${c} asset re-weighting.`,
          recommended_pairs: generatePairRecommendations(c, bias, conf, 40),
          pullback_entry_rule: `Enter in trend direction on 5M consolidation.`,
          invalidation_level: `Loss of the initial release candle boundary.`,
        },
      };
    },
  },

  "Trade Balance": {
    description: "Balance of Trade / Current Account — Measures net export vs import capital inflows.",
    base_pips: 35,
    duration: "5-10 minutes initial, 1-2 hours continuation",
    analyzePreNews: (f, p, c) => {
      return {
        direction: "BUY",
        confidence: 65,
        detail: `Trade balance forecast ${f} vs prior ${p}. Trade surpluses indicate net commercial demand for ${c}.`,
        trade_setup: `Follow momentum on trade surplus expansion.`,
        avoid_strategy: `Standard 5-minute wait.`,
        risk_factors: `Global commodity price fluctuations.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.valid ? pVal.num : 0;
      const diff = +(aVal.num - benchmark).toFixed(1);
      const isBeat = aVal.valid && diff > 0.5;
      const isMiss = aVal.valid && diff < -0.5;
      const bias: "BUY" | "SELL" | "NEUTRAL" = isBeat ? "BUY" : isMiss ? "SELL" : "NEUTRAL";
      const conf = 75;

      return {
        whatHappened: {
          verdict: isBeat ? "BEAT" : isMiss ? "MISS" : "INLINE",
          verdict_title: isBeat ? "Trade Surplus Expansion" : isMiss ? "Trade Balance Contraction" : "Trade Balance Inline",
          headline: `Balance of Trade printed ${a} (Forecast: ${f}, Prior: ${p}) — ${isBeat ? `Surplus widened by +${diff}` : isMiss ? `Deficit widened by ${diff}` : "Matching expectations"}.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: `${diff > 0 ? "+" : ""}${diff} vs forecast`,
          macro_impact: isBeat
            ? `Net export surplus expanded, indicating positive cross-border commercial demand for ${c} and supporting currency appreciation.`
            : isMiss
            ? `Trade balance narrowed or shifted into deficit, signaling reduced international capital demand for ${c}.`
            : `Trade balance printed in line with estimates.`,
        },
        postNewsTrend: {
          likely_trend: isBeat ? "BULLISH_CONTINUATION" : isMiss ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `${c} ${isBeat ? "Bullish" : isMiss ? "Bearish" : "Consolidation"} Trend (${conf}% Confidence)`,
          bias,
          confidence: conf,
          duration_horizon: "Trend follow-through for 1 to 2 hours.",
          key_drivers: `Commercial flow and trade balance momentum supporting ${c} valuation.`,
          recommended_pairs: generatePairRecommendations(c, bias, conf, 35),
          pullback_entry_rule: `Enter on 5M consolidation following the release.`,
          invalidation_level: `Break of the pre-news range.`,
        },
      };
    },
  },

  "_default": {
    description: "Macroeconomic indicator with direct currency valuation impact.",
    base_pips: 40,
    duration: "5-10 minutes initial, 1-2 hours continuation",
    analyzePreNews: (f, p, c) => {
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const dir = fVal.num >= pVal.num ? "BUY" : "SELL";
      return {
        direction: dir,
        confidence: 65,
        detail: `Forecast ${f} vs prior ${p}. Market anticipating ${dir === "BUY" ? "strength" : "weakness"} in ${c}.`,
        trade_setup: `Follow confirmed momentum after 5M close.`,
        avoid_strategy: `Wait 5 minutes post-release before entering.`,
        risk_factors: `Unexpected deviations can cause brief volatility wicks.`,
      };
    },
    analyzePostNews: (a, f, p, c) => {
      const aVal = parseValue(a);
      const fVal = parseValue(f);
      const pVal = parseValue(p);
      const benchmark = fVal.valid ? fVal.num : pVal.valid ? pVal.num : 0;
      const diff = +(aVal.num - benchmark).toFixed(2);
      const isBeat = aVal.valid && diff > 0;
      const isMiss = aVal.valid && diff < 0;
      const bias: "BUY" | "SELL" | "NEUTRAL" = isBeat ? "BUY" : isMiss ? "SELL" : "NEUTRAL";
      const conf = 78;

      return {
        whatHappened: {
          verdict: isBeat ? "BEAT" : isMiss ? "MISS" : "INLINE",
          verdict_title: isBeat ? "Economic Data Beat" : isMiss ? "Economic Data Miss" : "Data Inline",
          headline: `Event released at ${a} (Forecast: ${f}, Prior: ${p}) — ${isBeat ? `Surpassing consensus by +${diff}` : isMiss ? `Missing consensus by ${diff}` : "Meeting expectations"}.`,
          actual_val: a,
          forecast_val: f,
          previous_val: p,
          surprise_delta: `${diff > 0 ? "+" : ""}${diff} vs forecast`,
          macro_impact: isBeat
            ? `Positive economic print reinforces ${c} strength and bullish institutional order flow.`
            : isMiss
            ? `Soft economic print dampens ${c} sentiment and triggers corrective selling.`
            : `Release matched consensus with limited volatility shock.`,
        },
        postNewsTrend: {
          likely_trend: isBeat ? "BULLISH_CONTINUATION" : isMiss ? "BEARISH_CONTINUATION" : "RANGE_BOUND",
          trend_headline: `${c} ${isBeat ? "Bullish" : isMiss ? "Bearish" : "Consolidation"} Trend Follow-Through (${conf}% Confidence)`,
          bias,
          confidence: conf,
          duration_horizon: "Continuation for 1 to 2 hours.",
          key_drivers: `Macroeconomic data flow supporting ${c} positioning.`,
          recommended_pairs: generatePairRecommendations(c, bias, conf, 40),
          pullback_entry_rule: "Enter in trend direction on 5M consolidation.",
          invalidation_level: "Break back below pre-news candle.",
        },
      };
    },
  },
};

function findPattern(eventName: string): PatternHandler {
  const lower = eventName.toLowerCase();
  if (lower.includes("unemployment") || lower.includes("jobless") || lower.includes("claimant")) {
    return PATTERNS["Unemployment"]!;
  }
  if (lower.includes("employment") || lower.includes("payrolls") || lower.includes("nfp") || lower.includes("jobs")) {
    if (lower.includes("non-farm") || lower.includes("nfp")) return PATTERNS["Non-Farm Payrolls"]!;
    return PATTERNS["Employment"]!;
  }
  if (lower.includes("earnings") || lower.includes("wage") || lower.includes("salary")) {
    return PATTERNS["Earnings"]!;
  }
  if (lower.includes("cpi") || lower.includes("inflation") || lower.includes("pce") || lower.includes("consumer price")) {
    return PATTERNS["CPI"]!;
  }
  if (lower.includes("rate") || lower.includes("monetary") || lower.includes("fomc") || lower.includes("ecb") || lower.includes("boe")) {
    return PATTERNS["Interest Rate Decision"]!;
  }
  if (lower.includes("sentiment") || lower.includes("zew") || lower.includes("ifo") || lower.includes("confidence")) {
    return PATTERNS["Sentiment"]!;
  }
  if (lower.includes("trade") || lower.includes("balance of trade") || lower.includes("current account")) {
    return PATTERNS["Trade Balance"]!;
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
