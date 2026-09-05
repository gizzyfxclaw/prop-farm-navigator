import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";
import { pairSpec } from "@/lib/engine/pairs";

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const TVREMIX_URL = "https://tvremix.xyz/api/mcp/v1";
const TV_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1D", "1w": "1W",
};

async function fetchBars(apiKey: string, pair: string, interval: string, count: number): Promise<Bar[] | null> {
  const tvInterval = TV_INTERVAL[interval] ?? "1h";
  let res: Response;
  try {
    res = await fetch(TVREMIX_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "get_ohlcv", arguments: { symbol: `OANDA:${pair}`, interval: tvInterval, count } },
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json: any;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  if (json.error || json.result?.isError) return null;
  const raw = json.result?.structuredContent?.bars;
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((b: any) => b.t != null && b.o != null && b.h != null && b.l != null && b.c != null)
    .map((b: any) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }));
}

function calcATR(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 0.001;
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    const cur  = bars[bars.length - i]!;
    const prev = bars[bars.length - i - 1]!;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low  - prev.close),
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
      if (bars[j]!.low  <= bars[i]!.low)  isL = false;
      if (!isH && !isL) break;
    }
    if (isH) highs.push(i);
    if (isL) lows.push(i);
  }
  return { highs, lows };
}

/**
 * Generic swing structure (HH/HL bias, order blocks). Kept as SUPPORTING
 * signal — feeds the multi-timeframe confluence check and the "conflicting
 * level near target" check — but no longer the primary setup detector.
 * See detectChannel() below for the actual GizzyFx strategy logic.
 */
function detectStructure(bars: Bar[]) {
  const { highs, lows } = findSwings(bars, 5);
  let bias = "neutral";
  if (highs.length >= 2 && lows.length >= 2) {
    const lastH = highs[highs.length - 1];
    const prevH = highs[highs.length - 2];
    const lastL = lows[lows.length - 1];
    const prevL = lows[lows.length - 2];
    if (bars[lastH!]!.high > bars[prevH!]!.high && bars[lastL!]!.low > bars[prevL!]!.low) {
      bias = "bullish";
    } else if (bars[lastH!]!.high < bars[prevH!]!.high && bars[lastL!]!.low < bars[prevL!]!.low) {
      bias = "bearish";
    }
  }
  const lastSwingHigh = highs.length > 0 ? bars[highs[highs.length - 1]!]!.high : 0;
  const lastSwingLow  = lows.length  > 0 ? bars[lows[lows.length   - 1]!]!.low  : 0;
  const bos = bias === "bullish" ? "bullish" : bias === "bearish" ? "bearish" : null;

  const swingPoint = (idxArr: number[], nth: number, field: "high" | "low") => {
    const idx = idxArr.length > nth ? idxArr[idxArr.length - 1 - nth] : undefined;
    return idx != null ? { time: bars[idx]!.time, price: bars[idx]![field] } : null;
  };
  const trendline = {
    highs: [swingPoint(highs, 1, "high"), swingPoint(highs, 0, "high")].filter(Boolean),
    lows: [swingPoint(lows, 1, "low"), swingPoint(lows, 0, "low")].filter(Boolean),
  };

  const orderBlocks: Array<{ low: number; high: number; kind: string; impulseMag: number }> = [];
  const atr = calcATR(bars, 14);
  for (let i = 5; i < bars.length - 3; i++) {
    const c = bars[i]!;
    if (c.close < c.open) {
      const futureMax = Math.max(...bars.slice(i + 1, i + 4).map(b => b.close));
      if (futureMax - c.close > atr * 1.5) {
        orderBlocks.push({ low: c.low, high: c.high, kind: "bullish", impulseMag: (futureMax - c.close) / atr });
      }
    } else {
      const futureMin = Math.min(...bars.slice(i + 1, i + 4).map(b => b.close));
      if (c.close - futureMin > atr * 1.5) {
        orderBlocks.push({ low: c.low, high: c.high, kind: "bearish", impulseMag: (c.close - futureMin) / atr });
      }
    }
  }

  return { bias, bos, orderBlocks: orderBlocks.slice(-5), lastSwingHigh, lastSwingLow, highs: highs.length, lows: lows.length, trendline };
}

/* ── GizzyFx Parallel Channel Breakout — the actual strategy ───────────────
   1) Draw an ascending or descending parallel channel from recent swing
      points. 2) The far boundary (resistance for ascending, support for
      descending) is the breakout level. 3) That boundary needs 2+ valid
      retests before it's tradeable — 2 is the floor, not a cap. 4) A setup
      is ALWAYS given as a pending order at the boundary (buy-stop above
      resistance / sell-stop below support) — it does not wait for the 5M
      breakout to already have happened. 5) SL is fixed 30 pips. 6) R:R is
      1:2 when the 5M breakout is already confirmed + 3+ clean retests + no
      conflicting level near target; 1:1.5 otherwise.
   ─────────────────────────────────────────────────────────────────────── */

export interface ChannelPoint { time: number; price: number; }
export interface Channel {
  type: "ascending" | "descending" | "none";
  direction: "long" | "short" | "neutral";
  baseLine: [ChannelPoint, ChannelPoint] | null;
  breakoutLine: [ChannelPoint, ChannelPoint] | null;
  breakoutBoundary: number;
  retestCount: number;
  retests: ChannelPoint[];
}

function linreg(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

const EMPTY_CHANNEL: Channel = {
  type: "none", direction: "neutral", baseLine: null, breakoutLine: null,
  breakoutBoundary: 0, retestCount: 0, retests: [],
};

function detectChannel(bars: Bar[], atr: number): Channel {
  const { highs, lows } = findSwings(bars, 5);
  if (highs.length < 3 || lows.length < 3) return EMPTY_CHANNEL;

  const recentHighIdx = highs.slice(-5);
  const recentLowIdx = lows.slice(-5);
  const highPts = recentHighIdx.map((i) => ({ x: i, y: bars[i]!.high }));
  const lowPts = recentLowIdx.map((i) => ({ x: i, y: bars[i]!.low }));

  const highReg = linreg(highPts);
  const lowReg = linreg(lowPts);

  // Normalize slope by price so the ascending/descending threshold isn't
  // pair-scale-dependent (JPY/XAU prices are 100-1000x FX majors).
  const avgPrice = bars[bars.length - 1]!.close || 1;
  const normSlope = ((highReg.slope + lowReg.slope) / 2) / avgPrice;
  if (Math.abs(normSlope) < 0.00002) return EMPTY_CHANNEL; // too flat — no channel

  const ascending = normSlope > 0;
  const baseReg = ascending ? lowReg : highReg;   // channel is anchored to this side
  const otherPts = ascending ? highPts : lowPts;  // opposite side sets the parallel offset

  let offset = ascending ? -Infinity : Infinity;
  for (const p of otherPts) {
    const baseY = baseReg.slope * p.x + baseReg.intercept;
    const d = p.y - baseY;
    offset = ascending ? Math.max(offset, d) : Math.min(offset, d);
  }
  if (!Number.isFinite(offset)) return EMPTY_CHANNEL;

  const lastIdx = bars.length - 1;
  const lineAt = (i: number) => baseReg.slope * i + baseReg.intercept;
  const breakoutBoundary = lineAt(lastIdx) + offset;

  const baseIdxs = ascending ? recentLowIdx : recentHighIdx;
  const firstI = baseIdxs[0]!;
  const lastI = baseIdxs[baseIdxs.length - 1]!;
  const baseLine: [ChannelPoint, ChannelPoint] = [
    { time: bars[firstI]!.time, price: lineAt(firstI) },
    { time: bars[lastI]!.time, price: lineAt(lastI) },
  ];
  const breakoutLine: [ChannelPoint, ChannelPoint] = [
    { time: bars[firstI]!.time, price: lineAt(firstI) + offset },
    { time: bars[lastI]!.time, price: lineAt(lastI) + offset },
  ];

  // Retests: bars whose high (ascending → testing resistance) or low
  // (descending → testing support) came close to the boundary at that bar's
  // index without a full close through it. Consecutive touches collapse
  // into one retest (a real test usually spans a few candles).
  const tolerance = atr * 0.5;
  const rawRetests: ChannelPoint[] = [];
  const lookbackStart = Math.max(0, lastIdx - 150);
  for (let i = lookbackStart; i <= lastIdx; i++) {
    const boundaryAtI = lineAt(i) + offset;
    const bar = bars[i]!;
    if (ascending) {
      const dist = boundaryAtI - bar.high;
      if (dist >= -tolerance * 0.3 && dist <= tolerance && bar.close < boundaryAtI) {
        rawRetests.push({ time: bar.time, price: bar.high });
      }
    } else {
      const dist = bar.low - boundaryAtI;
      if (dist >= -tolerance * 0.3 && dist <= tolerance && bar.close > boundaryAtI) {
        rawRetests.push({ time: bar.time, price: bar.low });
      }
    }
  }
  const barSeconds = bars.length > 1 ? bars[1]!.time - bars[0]!.time : 3600;
  const minGap = Math.max(barSeconds * 3, 3600);
  const retests: ChannelPoint[] = [];
  for (const r of rawRetests) {
    const prev = retests[retests.length - 1];
    if (!prev || r.time - prev.time > minGap) retests.push(r);
  }

  return {
    type: ascending ? "ascending" : "descending",
    direction: ascending ? "long" : "short",
    baseLine,
    breakoutLine,
    breakoutBoundary,
    retestCount: retests.length,
    retests,
  };
}

/** Has the breakout already happened on the true 5-minute chart? Checked
 *  independently of whatever timeframe the channel itself was drawn on —
 *  requires the last 3 five-minute closes through the boundary, not a
 *  single wick, to avoid a false positive. */
function checkBreakoutConfirmed(bars5m: Bar[] | null, boundary: number, direction: Channel["direction"]): boolean {
  if (!bars5m || direction === "neutral" || bars5m.length < 3 || boundary === 0) return false;
  const lastCloses = bars5m.slice(-3).map((b) => b.close);
  return direction === "long" ? lastCloses.every((c) => c > boundary) : lastCloses.every((c) => c < boundary);
}

function hasNearbyConflict(
  orderBlocks: Array<{ low: number; high: number; kind: string }>,
  targetPrice: number,
  direction: Channel["direction"],
  atr: number,
): boolean {
  if (direction === "neutral") return false;
  const opposingKind = direction === "long" ? "bearish" : "bullish";
  return orderBlocks.some(
    (ob) => ob.kind === opposingKind && Math.min(Math.abs(ob.low - targetPrice), Math.abs(ob.high - targetPrice)) < atr,
  );
}

/**
 * Top-down trend alignment — the GizzyFx strategy requires the higher
 * timeframes to agree with the channel's direction before a setup is
 * trustworthy. Daily down to 5-minute is the full stack; anything narrower
 * risks trading against the dominant trend on a lower timeframe.
 */
const MTF_STACK = ["1d", "4h", "1h", "15m", "5m"] as const;
type Bias = "bullish" | "bearish" | "neutral";

export interface TimeframeAlignment {
  requested: string;
  biasByTf: Record<string, Bias>;
  aligned: boolean;
  agreeCount: number;
  totalCount: number;
  conflictingTfs: string[];
}

async function fetchTimeframeBias(apiKey: string, pair: string, interval: string): Promise<Bias> {
  const bars = await fetchBars(apiKey, pair, interval, 300);
  if (!bars || bars.length < 20) return "neutral";
  return detectStructure(bars).bias as Bias;
}

async function computeAlignment(
  apiKey: string,
  pair: string,
  requestedInterval: string,
  requestedBias: Bias,
): Promise<TimeframeAlignment> {
  const others = MTF_STACK.filter((tf) => tf !== requestedInterval);
  const otherBiases = await Promise.all(others.map((tf) => fetchTimeframeBias(apiKey, pair, tf)));

  const biasByTf: Record<string, Bias> = { [requestedInterval]: requestedBias };
  others.forEach((tf, i) => { biasByTf[tf] = otherBiases[i]!; });

  const dominant = requestedBias;
  const conflictingTfs = dominant === "neutral"
    ? []
    : Object.entries(biasByTf)
        .filter(([tf, b]) => tf !== requestedInterval && b !== "neutral" && b !== dominant)
        .map(([tf]) => tf);
  const agreeCount = Object.values(biasByTf).filter((b) => b === dominant).length;

  return {
    requested: requestedInterval,
    biasByTf,
    aligned: dominant !== "neutral" && conflictingTfs.length === 0,
    agreeCount,
    totalCount: Object.keys(biasByTf).length,
    conflictingTfs,
  };
}

function generateDebate(
  channel: Channel,
  breakoutConfirmed5m: boolean,
  nearbyConflict: boolean,
  alignment: TimeframeAlignment,
) {
  const points: Array<{ claim: string; evidence: string }> = [];
  const counterPoints: Array<{ claim: string; evidence: string }> = [];
  let score = 0;

  // ── 1. Channel validity + retest gate (40 pts) — the core strategy rule ──
  if (channel.type !== "none" && channel.retestCount >= 2) {
    score += 40;
    points.push({
      claim: `${channel.type === "ascending" ? "Ascending" : "Descending"} channel confirmed — ${channel.retestCount} retest(s) of the breakout boundary`,
      evidence: `Boundary at ${channel.breakoutBoundary.toFixed(5)}`,
    });
  } else if (channel.type !== "none") {
    counterPoints.push({
      claim: `Channel found but only ${channel.retestCount} retest(s) — needs 2+ before it's tradeable`,
      evidence: `Boundary at ${channel.breakoutBoundary.toFixed(5)} not yet validated`,
    });
  } else {
    counterPoints.push({ claim: "No valid parallel channel detected", evidence: "Price action too choppy or ranging for a clean channel" });
  }

  // ── 2. Retest quality — 3+ is "clean" per the strategy doc (15 pts) ─────
  if (channel.retestCount >= 3) {
    score += 15;
    points.push({ claim: `${channel.retestCount} clean retests — exceeds the 2-touch floor`, evidence: "Stronger validation of the boundary" });
  }

  // ── 3. 5M breakout confirmation (20 pts) — feeds R:R, not a hard gate ───
  if (breakoutConfirmed5m) {
    score += 20;
    points.push({ claim: "5M breakout already confirmed", evidence: "Last 3 five-minute closes are through the boundary" });
  } else {
    counterPoints.push({ claim: "5M breakout not yet confirmed", evidence: "Still anticipatory — pending order, not a live break" });
  }

  // ── 4. No conflicting level near the 1:2 target (10 pts) ────────────────
  if (nearbyConflict) {
    counterPoints.push({ claim: "Conflicting order block near the 1:2 target", evidence: "TP2 sits close to an opposing supply/demand zone" });
  } else if (channel.type !== "none") {
    score += 10;
    points.push({ claim: "No conflicting level near target", evidence: "Clear path to the 1:2 take-profit" });
  }

  // ── 5. Multi-timeframe alignment, Daily → 5M (25 pts) ───────────────────
  const tfOrder = [...MTF_STACK, alignment.requested].filter(
    (tf, i, arr) => tf in alignment.biasByTf && arr.indexOf(tf) === i,
  );
  const tfSummary = tfOrder.map((tf) => `${tf.toUpperCase()}=${alignment.biasByTf[tf]}`).join(", ");
  if (alignment.aligned) {
    score += 25;
    points.push({
      claim: `Multi-timeframe alignment — ${alignment.agreeCount}/${alignment.totalCount} timeframes agree ${channel.direction === "long" ? "bullish" : "bearish"}`,
      evidence: tfSummary,
    });
  } else if (alignment.conflictingTfs.length > 0) {
    counterPoints.push({
      claim: `${alignment.conflictingTfs.length} timeframe(s) disagree`,
      evidence: `Conflicting: ${alignment.conflictingTfs.map((tf) => tf.toUpperCase()).join(", ")} — full stack: ${tfSummary}`,
    });
  }

  if (points.length === 0) points.push({ claim: "No supporting confluence yet", evidence: "Wait for a valid channel + retests" });
  if (counterPoints.length === 0) counterPoints.push({ claim: "No major red flags", evidence: "Setup passes the base checklist" });

  const confidence = Math.min(score / 110, 1); // max: 40+15+20+10+25
  const isLong = channel.direction === "long";

  let finalVerdict: string;
  if (channel.direction === "neutral") finalVerdict = "NEUTRAL";
  else if (confidence >= 0.75) finalVerdict = isLong ? "STRONG_LONG" : "STRONG_SHORT";
  else if (confidence >= 0.5) finalVerdict = isLong ? "LEAN_LONG" : "LEAN_SHORT";
  else finalVerdict = "NEUTRAL";

  return {
    // bullCase/bearCase kept as the frontend's existing shape — populated
    // with whichever list (for/against) actually matches "bullish"/"bearish"
    // given the channel's direction, not a separate bull-vs-bear score.
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

function buildStrategyLevels(
  channel: Channel,
  orderBlocks: ReturnType<typeof detectStructure>["orderBlocks"],
  lastPrice: number,
  atr: number,
  pairSymbol: string,
  breakoutConfirmed5m: boolean,
) {
  const spec = pairSpec(pairSymbol);
  const SL_PIPS = 30; // fixed, per the strategy doc — never ATR-derived

  if (channel.type === "none" || channel.retestCount < 2) {
    return {
      direction: "neutral" as const,
      confidence: 0.3,
      orderType: "NONE",
      entry: lastPrice.toFixed(spec.decimals),
      stopLoss: lastPrice.toFixed(spec.decimals),
      takeProfit1: lastPrice.toFixed(spec.decimals),
      takeProfit2: lastPrice.toFixed(spec.decimals),
      riskReward: "1:1.5",
      riskRewardOptions: ["1:1.5", "1:2"],
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

  // Per the documented rule: 1:2 only when the breakout is already
  // confirmed on 5M AND there have been 3+ clean retests AND no conflicting
  // level sits near the 1:2 target; 1:1.5 otherwise (still anticipatory, or
  // right at the 2-touch minimum, or a level is in the way).
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
    riskRewardOptions: ["1:1.5", "1:2"],
    recommendedRR,
    slPips: SL_PIPS,
    tp15Pips: SL_PIPS * 1.5,
    tp20Pips: SL_PIPS * 2,
    primaryTPPips,
    retestCount: channel.retestCount,
    breakoutConfirmed5m,
    nearbyConflict,
  };
}

export const Route = createFileRoute("/api/smc-analyze")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const pair = (url.searchParams.get("pair") ?? "EURUSD").toUpperCase().replace("/", "");
        const interval = url.searchParams.get("interval") ?? "1h";
        const count = Math.min(parseInt(url.searchParams.get("limit") ?? "500", 10) || 500, 5000);

        const apiKey = getCFEnv()?.TVREMIX_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "TVREMIX_API_KEY not configured" }, { status: 503 });
        }

        const bars = await fetchBars(apiKey, pair, interval, count);
        if (!bars || bars.length === 0) {
          return Response.json({ error: "no data from upstream" }, { status: 502 });
        }

        const atr = calcATR(bars, 14);
        const structure = detectStructure(bars);
        const channel = detectChannel(bars, atr);

        // 5M confirmation is always checked on the true 5-minute chart,
        // regardless of which timeframe the channel was drawn on — reuse
        // `bars` when the request already IS 5m to avoid a redundant fetch.
        const bars5m = interval === "5m" ? bars : await fetchBars(apiKey, pair, "5m", 200);
        const breakoutConfirmed5m = checkBreakoutConfirmed(bars5m, channel.breakoutBoundary, channel.direction);

        const channelBias: Bias = channel.direction === "long" ? "bullish" : channel.direction === "short" ? "bearish" : "neutral";
        const alignment = await computeAlignment(apiKey, pair, interval, channelBias);

        const levels = buildStrategyLevels(channel, structure.orderBlocks, bars[bars.length - 1]!.close, atr, pair, breakoutConfirmed5m);
        const debate = generateDebate(channel, breakoutConfirmed5m, levels.nearbyConflict, alignment);

        return Response.json({
          structure,
          channel,
          debate,
          levels,
          timeframeAlignment: alignment,
          pair,
          interval,
          barCount: bars.length,
          lastPrice: bars[bars.length - 1]!.close,
        }, { headers: { "Cache-Control": "public, max-age=60" } });
      },
    },
  },
});
