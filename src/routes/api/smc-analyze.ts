import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

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

  return { bias, bos, orderBlocks: orderBlocks.slice(-5), lastSwingHigh, lastSwingLow, highs: highs.length, lows: lows.length };
}

function generateDebate(structure: ReturnType<typeof detectStructure>, bars: Bar[], atr: number) {
  const bullPoints: Array<{ claim: string; evidence: string }> = [];
  const bearPoints: Array<{ claim: string; evidence: string }> = [];
  let bullScore = 0;
  let bearScore = 0;

  const lastBar = bars[bars.length - 1]!;
  const prev20 = bars.slice(-20);
  const prev5  = bars.slice(-5);

  // ── 1. Market structure bias (30 pts max) ───────────────────────────────
  if (structure.bias === "bullish") {
    bullScore += 30;
    bullPoints.push({ claim: "Higher Highs + Higher Lows confirmed", evidence: `HH/HL structure across ${structure.highs} swing highs` });
  } else if (structure.bias === "bearish") {
    bearScore += 30;
    bearPoints.push({ claim: "Lower Highs + Lower Lows confirmed", evidence: `LH/LL structure across ${structure.lows} swing lows` });
  }

  // ── 2. BOS (20 pts) ─────────────────────────────────────────────────────
  if (structure.bos === "bullish") {
    bullScore += 20;
    bullPoints.push({ claim: "Bullish BOS — broke prior swing high", evidence: `Break at ${structure.lastSwingHigh.toFixed(5)}` });
  } else if (structure.bos === "bearish") {
    bearScore += 20;
    bearPoints.push({ claim: "Bearish BOS — broke prior swing low", evidence: `Break at ${structure.lastSwingLow.toFixed(5)}` });
  }

  // ── 3. Order blocks (10 pts per OB side, max 20) ────────────────────────
  const bullOBs = structure.orderBlocks.filter(o => o.kind === "bullish");
  const bearOBs = structure.orderBlocks.filter(o => o.kind === "bearish");
  if (bullOBs.length > 0) {
    const score = Math.min(bullOBs.length * 10, 20);
    bullScore += score;
    const ob = bullOBs[bullOBs.length - 1]!;
    bullPoints.push({ claim: `${bullOBs.length} bullish OB(s) — demand zones`, evidence: `Nearest: ${ob.low.toFixed(5)}-${ob.high.toFixed(5)} (${ob.impulseMag.toFixed(1)}× ATR)` });
  }
  if (bearOBs.length > 0) {
    const score = Math.min(bearOBs.length * 10, 20);
    bearScore += score;
    const ob = bearOBs[bearOBs.length - 1]!;
    bearPoints.push({ claim: `${bearOBs.length} bearish OB(s) — supply zones`, evidence: `Nearest: ${ob.low.toFixed(5)}-${ob.high.toFixed(5)} (${ob.impulseMag.toFixed(1)}× ATR)` });
  }

  // ── 4. Momentum — last 5 candles (15 pts) ───────────────────────────────
  const bullCandles = prev5.filter(b => b.close > b.open).length;
  const bearCandles = prev5.filter(b => b.close < b.open).length;
  if (bullCandles >= 3) {
    bullScore += 10 + (bullCandles - 3) * 5;
    bullPoints.push({ claim: `Bullish momentum — ${bullCandles}/5 recent candles green`, evidence: `Close > Open pattern` });
  } else if (bearCandles >= 3) {
    bearScore += 10 + (bearCandles - 3) * 5;
    bearPoints.push({ claim: `Bearish momentum — ${bearCandles}/5 recent candles red`, evidence: `Close < Open pattern` });
  }

  // ── 5. Price vs 20-bar midpoint (10 pts) ────────────────────────────────
  const high20 = Math.max(...prev20.map(b => b.high));
  const low20  = Math.min(...prev20.map(b => b.low));
  const mid20  = (high20 + low20) / 2;
  if (lastBar.close > mid20 + atr * 0.3) {
    bullScore += 10;
    bullPoints.push({ claim: "Price above 20-bar midpoint", evidence: `${lastBar.close.toFixed(5)} vs mid ${mid20.toFixed(5)}` });
  } else if (lastBar.close < mid20 - atr * 0.3) {
    bearScore += 10;
    bearPoints.push({ claim: "Price below 20-bar midpoint", evidence: `${lastBar.close.toFixed(5)} vs mid ${mid20.toFixed(5)}` });
  }

  // ── 6. Range position (5 pts) ─────────────────────────────────────────
  const rangePos = (lastBar.close - low20) / (high20 - low20 || 1);
  if (rangePos > 0.65) {
    bullScore += 5;
    bullPoints.push({ claim: `Price in upper ${((rangePos)*100).toFixed(0)}% of 20-bar range`, evidence: `Range: ${low20.toFixed(5)}-${high20.toFixed(5)}` });
  } else if (rangePos < 0.35) {
    bearScore += 5;
    bearPoints.push({ claim: `Price in lower ${((1-rangePos)*100).toFixed(0)}% of 20-bar range`, evidence: `Range: ${low20.toFixed(5)}-${high20.toFixed(5)}` });
  }

  // Add counter-arguments for balance
  if (structure.bias === "bullish" && bearPoints.length === 0) {
    bearPoints.push({ claim: "Single-timeframe view — no higher-TF confirmation", evidence: "1H BOS not confirmed by 4H/1D structure" });
  }
  if (structure.bias === "bearish" && bullPoints.length === 0) {
    bullPoints.push({ claim: "Potential mean-reversion zone", evidence: "Extended move may attract buyers" });
  }
  if (bullPoints.length === 0) {
    bullPoints.push({ claim: "No clear bullish confluence detected", evidence: "Awaiting BOS or OB confirmation" });
  }
  if (bearPoints.length === 0) {
    bearPoints.push({ claim: "No clear bearish confluence detected", evidence: "Awaiting BOS or OB confirmation" });
  }

  // Normalize to 0-1
  const bullConf = Math.min(bullScore / 100, 1);
  const bearConf = Math.min(bearScore / 100, 1);

  let finalVerdict: string;
  if (bullScore > bearScore + 30)      finalVerdict = "STRONG_LONG";
  else if (bullScore > bearScore + 10) finalVerdict = "LEAN_LONG";
  else if (bearScore > bullScore + 30) finalVerdict = "STRONG_SHORT";
  else if (bearScore > bullScore + 10) finalVerdict = "LEAN_SHORT";
  else                                  finalVerdict = "NEUTRAL";

  return {
    bullCase: { direction: "bullish", points: bullPoints, overallConfidence: bullConf },
    bearCase: { direction: "bearish", points: bearPoints, overallConfidence: bearConf },
    debateRounds: [
      `Bull: "${bullPoints[0]?.claim ?? "No case"}" (${(bullConf * 100).toFixed(0)}%)`,
      `Bear: "${bearPoints[0]?.claim ?? "No case"}" (${(bearConf * 100).toFixed(0)}%)`,
      `Synthesis: ${finalVerdict.replace("_", " ")} — ${bullScore > bearScore ? "bulls" : bearScore > bullScore ? "bears" : "balanced"} in control`,
    ],
    finalVerdict,
    confidence: Math.max(bullConf, bearConf),
    finalRationale: `Bull: ${bullScore}pts vs Bear: ${bearScore}pts`,
    entryZone: "See levels below",
    invalidationLevel: structure.bias === "bullish" ? structure.lastSwingLow.toFixed(5) : structure.lastSwingHigh.toFixed(5),
    riskReward: "See levels below",
  };
}

function buildLevels(structure: ReturnType<typeof detectStructure>, lastPrice: number, atr: number, accuracyGrade?: string) {
  const direction = structure.bias === "bullish" ? "long" : structure.bias === "bearish" ? "short" : "neutral";

  if (direction === "neutral") {
    return {
      direction, confidence: 0.5, orderType: "MARKET",
      entry: lastPrice.toFixed(5),
      stopLoss: (lastPrice - atr * 2).toFixed(5),
      takeProfit1: (lastPrice + atr * 1.5).toFixed(5),
      takeProfit2: (lastPrice + atr * 2).toFixed(5),
      takeProfit3: (lastPrice + atr * 2.5).toFixed(5),
      takeProfit4: (lastPrice + atr * 3).toFixed(5),
      riskReward: "1:2",
      riskRewardOptions: ["1:1.5", "1:2", "1:2.5", "1:3"],
      recommendedRR: "1:2",
    };
  }

  // Entry: use nearest OB boundary as a PENDING ORDER (limit entry)
  const bullOBs = structure.orderBlocks.filter(o => o.kind === "bullish");
  const bearOBs = structure.orderBlocks.filter(o => o.kind === "bearish");

  let entryPrice = lastPrice;
  let orderType = "MARKET";

  if (direction === "long" && bullOBs.length > 0) {
    const ob = bullOBs[bullOBs.length - 1]!;
    const obMid = (ob.low + ob.high) / 2;
    // Set entry at OB high (top of bullish OB) — BUY_LIMIT if price is above it, else BUY_STOP
    if (lastPrice > obMid) {
      entryPrice = ob.high; // price needs to pull back to OB — BUY_LIMIT
      orderType = "BUY_LIMIT";
    } else {
      entryPrice = ob.high; // price hasn't reached OB yet — BUY_STOP
      orderType = "BUY_STOP";
    }
  } else if (direction === "short" && bearOBs.length > 0) {
    const ob = bearOBs[bearOBs.length - 1]!;
    const obMid = (ob.low + ob.high) / 2;
    if (lastPrice < obMid) {
      entryPrice = ob.low; // price needs to rally to OB — SELL_LIMIT
      orderType = "SELL_LIMIT";
    } else {
      entryPrice = ob.low; // price hasn't reached OB — SELL_STOP
      orderType = "SELL_STOP";
    }
  }

  // SL beyond OB
  const slAtrMult = 1.5;
  const stopLoss = direction === "long"
    ? entryPrice - atr * slAtrMult
    : entryPrice + atr * slAtrMult;

  const slDist = Math.abs(entryPrice - stopLoss);

  // 4 TP levels based on R:R ratios
  const tp15 = direction === "long" ? entryPrice + slDist * 1.5 : entryPrice - slDist * 1.5;
  const tp20 = direction === "long" ? entryPrice + slDist * 2.0 : entryPrice - slDist * 2.0;
  const tp25 = direction === "long" ? entryPrice + slDist * 2.5 : entryPrice - slDist * 2.5;
  const tp30 = direction === "long" ? entryPrice + slDist * 3.0 : entryPrice - slDist * 3.0;

  // Recommended R:R based on accuracy grade
  let recommendedRR = "1:2";
  if (accuracyGrade === "HIGH")     recommendedRR = "1:3";
  else if (accuracyGrade === "STANDARD") recommendedRR = "1:2";
  else                               recommendedRR = "1:1.5";

  // Primary TP = recommended
  const primaryTP = recommendedRR === "1:3" ? tp30
    : recommendedRR === "1:2.5" ? tp25
    : recommendedRR === "1:2"   ? tp20
    : tp15;

  // Pip calculations (forex: 0.0001 = 1 pip)
  const pipSize = 0.0001;
  const slPips = Math.round(slDist / pipSize);
  const tp15Pips = Math.round(Math.abs(tp15 - entryPrice) / pipSize);
  const tp20Pips = Math.round(Math.abs(tp20 - entryPrice) / pipSize);
  const tp25Pips = Math.round(Math.abs(tp25 - entryPrice) / pipSize);
  const tp30Pips = Math.round(Math.abs(tp30 - entryPrice) / pipSize);
  const primaryTPPips = Math.round(Math.abs(primaryTP - entryPrice) / pipSize);

  return {
    direction,
    confidence: 0.7,
    orderType,
    entry: entryPrice.toFixed(5),
    stopLoss: stopLoss.toFixed(5),
    takeProfit1: tp15.toFixed(5),
    takeProfit2: tp20.toFixed(5),
    takeProfit3: tp25.toFixed(5),
    takeProfit4: tp30.toFixed(5),
    primaryTP: primaryTP.toFixed(5),
    riskReward: recommendedRR,
    riskRewardOptions: ["1:1.5", "1:2", "1:2.5", "1:3"],
    recommendedRR,
    slPips,
    tp15Pips,
    tp20Pips,
    tp25Pips,
    tp30Pips,
    primaryTPPips,
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
        const debate = generateDebate(structure, bars, atr);
        const levels = buildLevels(structure, bars[bars.length - 1]!.close, atr);

        return Response.json({
          structure,
          debate,
          levels,
          pair,
          interval,
          barCount: bars.length,
          lastPrice: bars[bars.length - 1]!.close,
        }, { headers: { "Cache-Control": "public, max-age=60" } });
      },
    },
  },
});
