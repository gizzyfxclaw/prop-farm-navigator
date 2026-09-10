import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";
import { pairSpec } from "@/lib/engine/pairs";
import { summarizeSMC } from "@/lib/smc-engine";
import { fetchBarsWithRetry, type Bar } from "@/lib/tvremix";

/**
 * Live TradingView Analysis endpoint.
 * GET /api/smc-analyze?pair=EURUSD&interval=1h&limit=300
 * Returns full SMC summary + raw bars for client-side charting.
 * Used by Hermes for on-demand chart analysis with live TradingView screenshots.
 */

function calcATR(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 0.001;
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    const cur = bars[bars.length - i]!;
    const prev = bars[bars.length - i - 1]!;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    sum += tr;
  }
  return sum / period;
}

function findSwings(bars: Bar[], lookback: number) {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    let isH = true, isL = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (bars[j]!.high >= bars[i]!.high) isH = false;
      if (bars[j]!.low <= bars[i]!.low) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) highs.push(i);
    if (isL) lows.push(i);
  }
  return { highs, lows };
}

type Bias = "bullish" | "bearish" | "neutral";

interface Channel {
  type: "ascending" | "descending" | "none";
  direction: "long" | "short" | "neutral";
  breakoutBoundary: number;
  retestCount: number;
  baseLine: { time: number; price: number }[] | null;
  resistanceLine: { time: number; price: number }[] | null;
  supportLine: { time: number; price: number }[] | null;
}

function detectChannel(bars: Bar[], atr: number): Channel {
  const { highs, lows } = findSwings(bars, 5);
  if (highs.length < 2 || lows.length < 2) {
    return { type: "none", direction: "neutral", breakoutBoundary: 0, retestCount: 0, baseLine: null, resistanceLine: null, supportLine: null };
  }

  const lastH = highs[highs.length - 1]!;
  const prevH = highs[highs.length - 2]!;
  const lastL = lows[lows.length - 1]!;
  const prevL = lows[lows.length - 2]!;

  const hh = bars[lastH]!.high > bars[prevH]!.high;
  const hl = bars[lastL]!.low > bars[prevL]!.low;
  const lh = bars[lastH]!.high < bars[prevH]!.high;
  const ll = bars[lastL]!.low < bars[prevL]!.low;

  let direction: "long" | "short" | "neutral" = "neutral";
  let boundary = 0;
  let resistanceLine: { time: number; price: number }[] | null = null;
  let supportLine: { time: number; price: number }[] | null = null;
  let baseLine: { time: number; price: number }[] | null = null;

  if (hh && hl) {
    direction = "long";
    boundary = bars[lastH]!.high;
    resistanceLine = [
      { time: bars[prevH]!.time, price: bars[prevH]!.high },
      { time: bars[lastH]!.time, price: bars[lastH]!.high },
    ];
    const slope = (bars[lastH]!.high - bars[prevH]!.high) / (bars[lastH]!.time - bars[prevH]!.time);
    const prevLPrice = bars[prevL]!.low - slope * (bars[prevL]!.time - bars[prevH]!.time);
    const lastLPrice = bars[lastL]!.low - slope * (bars[lastL]!.time - bars[lastH]!.time);
    supportLine = [
      { time: bars[prevH]!.time, price: prevLPrice },
      { time: bars[lastH]!.time, price: lastLPrice },
    ];
    baseLine = supportLine;
  } else if (lh && ll) {
    direction = "short";
    boundary = bars[lastL]!.low;
    supportLine = [
      { time: bars[prevL]!.time, price: bars[prevL]!.low },
      { time: bars[lastL]!.time, price: bars[lastL]!.low },
    ];
    const slope = (bars[lastL]!.low - bars[prevL]!.low) / (bars[lastL]!.time - bars[prevL]!.time);
    const prevHPrice = bars[prevH]!.high - slope * (bars[prevH]!.time - bars[prevL]!.time);
    const lastHPrice = bars[lastH]!.high - slope * (bars[lastH]!.time - bars[lastL]!.time);
    resistanceLine = [
      { time: bars[prevL]!.time, price: prevHPrice },
      { time: bars[lastL]!.time, price: lastHPrice },
    ];
    baseLine = resistanceLine;
  } else {
    return { type: "none", direction: "neutral", breakoutBoundary: 0, retestCount: 0, baseLine: null, resistanceLine: null, supportLine: null };
  }

  // Count retests
  let retestCount = 0;
  const tolerance = atr * 0.5;
  for (let i = Math.max(lastH, lastL) + 1; i < bars.length - 1; i++) {
    if (direction === "long") {
      if (Math.abs(bars[i]!.high - boundary) <= tolerance) retestCount++;
    } else {
      if (Math.abs(bars[i]!.low - boundary) <= tolerance) retestCount++;
    }
  }

  return {
    type: direction === "long" ? "ascending" : "descending",
    direction,
    breakoutBoundary: boundary,
    retestCount,
    baseLine,
    resistanceLine,
    supportLine,
  };
}

function checkBreakoutConfirmed(bars: Bar[] | null, boundary: number, direction: "long" | "short" | "neutral"): boolean {
  if (!bars || bars.length === 0 || direction === "neutral") return false;
  const last = bars[bars.length - 1]!;
  if (direction === "long") {
    return last.close > boundary;
  } else {
    return last.close < boundary;
  }
}

async function computeAlignment(apiKey: string, pair: string, currentTf: string, channelBias: Bias): Promise<{ biasByTf: Record<string, string>; aligned: boolean; agreeCount: number; totalCount: number }> {
  const tfs = ["1h", "4h", "1d"];
  const biasByTf: Record<string, string> = {};
  let agreeCount = 0;
  let totalCount = 0;

  for (const tf of tfs) {
    if (tf === currentTf) continue;
    const bars = await fetchBarsWithRetry(apiKey, pair, tf, 200);
    if (!bars || bars.length < 20) continue;
    const { highs, lows } = findSwings(bars, 5);
    let bias = "neutral";
    if (highs.length >= 2 && lows.length >= 2) {
      const lastH = highs[highs.length - 1]!;
      const prevH = highs[highs.length - 2]!;
      const lastL = lows[lows.length - 1]!;
      const prevL = lows[lows.length - 2]!;
      if (bars[lastH]!.high > bars[prevH]!.high && bars[lastL]!.low > bars[prevL]!.low) bias = "bullish";
      else if (bars[lastH]!.high < bars[prevH]!.high && bars[lastL]!.low < bars[prevL]!.low) bias = "bearish";
    }
    biasByTf[tf] = bias;
    totalCount++;
    if (bias === channelBias) agreeCount++;
  }

  biasByTf[currentTf] = channelBias;
  totalCount++;
  agreeCount++;

  return { biasByTf, aligned: agreeCount >= Math.ceil(totalCount * 0.6), agreeCount, totalCount };
}

function hasNearbyConflict(orderBlocks: any[], targetPrice: number, direction: string, atr: number): boolean {
  for (const ob of orderBlocks) {
    if (direction === "long") {
      if (ob.kind === "bearish" && ob.high > targetPrice - atr * 2 && ob.high < targetPrice + atr) return true;
    } else {
      if (ob.kind === "bullish" && ob.low < targetPrice + atr * 2 && ob.low > targetPrice - atr) return true;
    }
  }
  return false;
}

interface DrawableLevels {
  direction: "long" | "short" | "neutral";
  confidence: number;
  orderType: string;
  entry: string;
  stopLoss: string;
  takeProfit1: string;
  takeProfit2: string;
  riskReward: string;
  recommendedRR: string;
  slPips: number;
  tp15Pips: number;
  tp20Pips: number;
  primaryTPPips: number;
  primaryTP: string;
  retestCount: number;
  breakoutConfirmed5m: boolean;
  nearbyConflict: boolean;
  reason: string;
}

function buildStrategyLevels(
  channel: Channel,
  orderBlocks: any[],
  lastPrice: number,
  atr: number,
  pairSymbol: string,
  breakoutConfirmed5m: boolean,
): DrawableLevels {
  const spec = pairSpec(pairSymbol);
  const SL_PIPS = 30;

  if (channel.type === "none" || channel.retestCount < 2) {
    return {
      direction: "neutral",
      confidence: 0.3,
      orderType: "NONE",
      entry: lastPrice.toFixed(spec.decimals),
      stopLoss: lastPrice.toFixed(spec.decimals),
      takeProfit1: lastPrice.toFixed(spec.decimals),
      takeProfit2: lastPrice.toFixed(spec.decimals),
      riskReward: "1:1.5",
      recommendedRR: "1:1.5",
      slPips: SL_PIPS,
      tp15Pips: 0,
      tp20Pips: 0,
      primaryTPPips: 0,
      primaryTP: lastPrice.toFixed(spec.decimals),
      retestCount: channel.retestCount,
      breakoutConfirmed5m,
      nearbyConflict: false,
      reason: channel.type === "none"
        ? "No valid ascending/descending channel — market is too choppy or ranging"
        : `Only ${channel.retestCount} retest(s) of the breakout boundary — needs 2+ before this is tradeable`,
    };
  }

  const entryPrice = channel.breakoutBoundary;
  const slDist = SL_PIPS * spec.pipSize;
  const stopLoss = channel.direction === "long" ? entryPrice - slDist : entryPrice + slDist;

  const tp15Dist = SL_PIPS * 1.5 * spec.pipSize;
  const tp20Dist = SL_PIPS * 2 * spec.pipSize;
  const tp15 = channel.direction === "long" ? entryPrice + tp15Dist : entryPrice - tp15Dist;
  const tp20 = channel.direction === "long" ? entryPrice + tp20Dist : entryPrice - tp20Dist;

  const nearbyConflict = hasNearbyConflict(orderBlocks, tp20, channel.direction, atr);

  const strongSetup = breakoutConfirmed5m && channel.retestCount >= 3 && !nearbyConflict;
  const recommendedRR = strongSetup ? "1:2" : "1:1.5";
  const primaryTP = strongSetup ? tp20 : tp15;
  const primaryTPPips = strongSetup ? SL_PIPS * 2 : SL_PIPS * 1.5;

  return {
    direction: channel.direction,
    confidence: strongSetup ? 0.85 : 0.65,
    orderType: channel.direction === "long" ? "BUY_STOP" : "SELL_STOP",
    entry: entryPrice.toFixed(spec.decimals),
    stopLoss: stopLoss.toFixed(spec.decimals),
    takeProfit1: tp15.toFixed(spec.decimals),
    takeProfit2: tp20.toFixed(spec.decimals),
    primaryTP: primaryTP.toFixed(spec.decimals),
    riskReward: recommendedRR,
    recommendedRR,
    slPips: SL_PIPS,
    tp15Pips: SL_PIPS * 1.5,
    tp20Pips: SL_PIPS * 2,
    primaryTPPips,
    retestCount: channel.retestCount,
    breakoutConfirmed5m,
    nearbyConflict,
    reason: "",
  };
}

interface DebateResult {
  bullCase: { direction: string; points: any[]; overallConfidence: number };
  bearCase: { direction: string; points: any[]; overallConfidence: number };
  debateRounds: string[];
  finalVerdict: string;
  confidence: number;
  finalRationale: string;
  entryZone: string;
  invalidationLevel: string;
  riskReward: string;
}

function generateDebate(
  channel: Channel,
  breakoutConfirmed5m: boolean,
  nearbyConflict: boolean,
  alignment: { biasByTf: Record<string, string>; aligned: boolean; agreeCount: number; totalCount: number },
): DebateResult {
  const isLong = channel.direction === "long";
  const points: any[] = [];
  const counterPoints: any[] = [];
  let score = 0;

  if (channel.type !== "none") {
    score += 25;
    points.push({ claim: `Valid ${channel.type} channel with ${channel.retestCount} retest(s) of the breakout boundary` });
  } else {
    counterPoints.push({ claim: "No valid channel — market is too choppy or ranging" });
  }

  if (breakoutConfirmed5m) {
    score += 20;
    points.push({ claim: "5M breakout already confirmed" });
  } else {
    counterPoints.push({ claim: "5M breakout not yet confirmed — still anticipatory" });
  }

  if (nearbyConflict) {
    counterPoints.push({ claim: "Conflicting order block near the 1:2 target" });
  } else if (channel.type !== "none") {
    score += 15;
    points.push({ claim: "No conflicting level near target" });
  }

  if (alignment.aligned) {
    score += 25;
    points.push({ claim: `Multi-timeframe aligned (${alignment.agreeCount}/${alignment.totalCount})` });
  } else {
    counterPoints.push({ claim: `Timeframes conflict: ${Object.entries(alignment.biasByTf).map(([tf, b]) => `${tf.toUpperCase()}=${b}`).join(", ")}` });
  }

  let finalVerdict = "NEUTRAL";
  let confidence = 0.5;
  if (score >= 65) {
    finalVerdict = isLong ? "STRONG_LONG" : "STRONG_SHORT";
    confidence = 0.85;
  } else if (score >= 40) {
    finalVerdict = isLong ? "LEAN_LONG" : "LEAN_SHORT";
    confidence = 0.65;
  } else {
    confidence = 0.3;
  }

  return {
    bullCase: { direction: "bullish", points: isLong ? points : counterPoints, overallConfidence: isLong ? confidence : 1 - confidence },
    bearCase: { direction: "bearish", points: isLong ? counterPoints : points, overallConfidence: isLong ? 1 - confidence : confidence },
    debateRounds: [
      `For: "${points[0]?.claim ?? "No case"}"`,
      `Against: "${counterPoints[0]?.claim ?? "No case"}"`,
      `Synthesis: ${finalVerdict.replace("_", " ")} — confidence ${(confidence * 100).toFixed(0)}%`,
    ],
    finalVerdict,
    confidence,
    finalRationale: `Setup score: ${score}/110`,
    entryZone: channel.type !== "none" ? channel.breakoutBoundary.toFixed(5) : "See levels below",
    invalidationLevel: channel.baseLine ? channel.baseLine[1].price.toFixed(5) : "",
    riskReward: "See levels below",
  };
}

export const Route = createFileRoute("/api/smc-analyze")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const pair = (url.searchParams.get("pair") ?? "EURUSD").toUpperCase().replace("/", "");
        const interval = url.searchParams.get("interval") ?? "1h";
        const strategy = url.searchParams.get("strategy") ?? "channel-breakout";
        const count = Math.min(parseInt(url.searchParams.get("limit") ?? "500", 10) || 500, 5000);

        const apiKey = getCFEnv()?.TVREMIX_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "TVREMIX_API_KEY not configured" }, { status: 503 });
        }

        // Check cache first
        const env = getCFEnv();
        const cacheKey = `${pair}-${interval}-${strategy}-${count}`;
        const now = new Date().toISOString();
        
        if (env?.DB) {
          try {
            const cached = await env.DB.prepare(
              "SELECT result FROM smc_analysis_cache WHERE id = ? AND expires_at > ?"
            ).bind(cacheKey, now).first() as { result?: string } | null;
            
            if (cached?.result) {
              return Response.json(JSON.parse(cached.result), { headers: { "Cache-Control": "public, max-age=60", "X-Cache": "HIT" } });
            }
          } catch {
            // Cache miss or error - continue to fetch
          }
        }

        const bars = await fetchBarsWithRetry(apiKey, pair, interval, count);
        if (!bars || bars.length === 0) {
          return Response.json({ error: "no data from upstream" }, { status: 502 });
        }

        const atr = calcATR(bars, 14);
        const smcResult = summarizeSMC(bars);
        const channel = detectChannel(bars, atr);

        // 5M confirmation is always checked on the true 5-minute chart,
        // regardless of which timeframe the channel was drawn on — reuse
        // `bars` when the request already IS 5m to avoid a redundant fetch.
        const bars5m = interval === "5m" ? bars : await fetchBarsWithRetry(apiKey, pair, "5m", 200);
        const breakoutConfirmed5m = checkBreakoutConfirmed(bars5m, channel.breakoutBoundary, channel.direction);

        const channelBias: Bias = channel.direction === "long" ? "bullish" : channel.direction === "short" ? "bearish" : "neutral";
        const alignment = await computeAlignment(apiKey, pair, interval, channelBias);
        
        const includeBars = url.searchParams.get("include_bars") === "true";

        const requestedCount = count;
        const actualCount = bars.length;
        const wasRetried = actualCount < requestedCount;

        // Generate debate and levels for frontend
        const nearbyConflict = hasNearbyConflict(smcResult.orderBlocks, channel.breakoutBoundary, channel.direction, atr);
        const debate = generateDebate(channel, breakoutConfirmed5m, nearbyConflict, alignment);
        const levels = buildStrategyLevels(channel, smcResult.orderBlocks, bars[bars.length - 1]!.close, atr, pair, breakoutConfirmed5m);

        // Flatten structure for frontend compatibility
        // Frontend expects: structure.bias, structure.bos, structure.orderBlocks, etc.
        // summarizeSMC returns: { ok, structure: { bias, bos, ... }, orderBlocks, ... }
        const structureForFrontend = {
          bias: smcResult.structure.bias,
          bos: smcResult.structure.bos,
          choch: smcResult.structure.choch,
          swings: smcResult.structure.swings,
          orderBlocks: smcResult.orderBlocks.map(ob => ({
            low: ob.low,
            high: ob.high,
            kind: ob.kind,
            impulseMag: ob.impulseMag,
            invalidated: ob.invalidated,
            invalidatedIdx: ob.invalidatedIdx,
            time: bars[ob.idx]?.time,
          })),
          fvgs: smcResult.fvgs,
          sweeps: smcResult.sweeps,
          zone: smcResult.zone,
          summary: smcResult.summary,
          lastSwingHigh: smcResult.structure.swings.filter(s => s.kind === 'high').slice(-1)[0]?.price ?? 0,
          lastSwingLow: smcResult.structure.swings.filter(s => s.kind === 'low').slice(-1)[0]?.price ?? 0,
          highs: smcResult.structure.swings.filter(s => s.kind === 'high').length,
          lows: smcResult.structure.swings.filter(s => s.kind === 'low').length,
        };

        const strategyInfo = {
          id: strategy,
          name: strategy === "channel-breakout" ? "GizzyFx Channel Breakout" : strategy === "asia-sweep-reversals" ? "Asia Sweep Reversals" : strategy === "pdh-l-fvg" ? "PDH/L FVG" : strategy === "trend-continuation" ? "Trend Continuation" : strategy === "london-breakout" ? "London Breakout" : strategy === "ema-9-vwap" ? "EMA 9 + VWAP" : strategy,
          family: strategy === "channel-breakout" || strategy === "asia-sweep-reversals" || strategy === "pdh-l-fvg" ? "SMC/ICT" : strategy === "trend-continuation" || strategy === "ema-9-vwap" ? "Trend" : strategy === "london-breakout" ? "Session" : "SMC",
          description: strategy === "channel-breakout" ? "Parallel channel breakout with retest confirmation" : strategy === "asia-sweep-reversals" ? "Asia session range sweep + CHoCH entry" : strategy === "pdh-l-fvg" ? "Previous Day High/Low Fair Value Gap" : strategy === "trend-continuation" ? "Breakout entries in trend direction" : strategy === "london-breakout" ? "London session breakout with momentum" : strategy === "ema-9-vwap" ? "EMA 9 + VWAP with ATR Trailing Stop" : "",
        };

        const response = {
          structure: structureForFrontend,
          debate,
          levels,
          channel,
          strategy: strategyInfo,
          ...(includeBars ? { bars } : { barCount: actualCount }),
          actualBarCount: actualCount,
          wasRetried,
          timeframeAlignment: alignment,
          pair,
          interval,
          lastPrice: bars[bars.length - 1]!.close,
        };

        // Store in cache (30 minute TTL)
        if (env?.DB) {
          try {
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            await env.DB.prepare(
              "INSERT OR REPLACE INTO smc_analysis_cache (id, pair, interval, requested_count, result, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind(cacheKey, pair, interval, count, JSON.stringify(response), expiresAt).run();
          } catch {
            // Ignore cache errors
          }
        }

        return Response.json(response, { headers: { "Cache-Control": "public, max-age=60", "X-Cache": "MISS" } });
      },
    },
  },
});
