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
    const tr = Math.max(
      bars[bars.length - i].high - bars[bars.length - i].low,
      Math.abs(bars[bars.length - i].high - bars[bars.length - i - 1].close),
      Math.abs(bars[bars.length - i].low - bars[bars.length - i - 1].close),
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
      if (bars[j].high >= bars[i].high) isH = false;
      if (bars[j].low <= bars[i].low) isL = false;
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
    if (bars[lastH].high > bars[prevH].high && bars[lastL].low > bars[prevL].low) {
      bias = "bullish";
    } else if (bars[lastH].high < bars[prevH].high && bars[lastL].low < bars[prevL].low) {
      bias = "bearish";
    }
  }
  const lastSwingHigh = highs.length > 0 ? bars[highs[highs.length - 1]].high : 0;
  const lastSwingLow = lows.length > 0 ? bars[lows[lows.length - 1]].low : 0;
  const bos = bias === "bullish" ? "bullish" : bias === "bearish" ? "bearish" : null;

  const orderBlocks: Array<{ low: number; high: number; kind: string; impulseMag: number }> = [];
  const atr = calcATR(bars, 14);
  for (let i = 5; i < bars.length - 3; i++) {
    const c = bars[i];
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

function generateDebate(structure: ReturnType<typeof detectStructure>) {
  const bullPoints: Array<{ claim: string; evidence: string }> = [];
  const bearPoints: Array<{ claim: string; evidence: string }> = [];

  if (structure.bias === "bullish") {
    bullPoints.push({ claim: "Bullish structure: higher highs + higher lows", evidence: `${structure.highs} swing highs, ${structure.lows} swing lows detected` });
  }
  if (structure.bias === "bearish") {
    bearPoints.push({ claim: "Bearish structure: lower highs + lower lows", evidence: `${structure.highs} swing highs, ${structure.lows} swing lows detected` });
  }
  if (structure.bos === "bullish") {
    bullPoints.push({ claim: "Bullish BOS — price broke prior swing high", evidence: `BOS at ${structure.lastSwingHigh.toFixed(5)}` });
  }
  if (structure.bos === "bearish") {
    bearPoints.push({ claim: "Bearish BOS — price broke prior swing low", evidence: `BOS at ${structure.lastSwingLow.toFixed(5)}` });
  }

  const bullOBs = structure.orderBlocks.filter(o => o.kind === "bullish");
  const bearOBs = structure.orderBlocks.filter(o => o.kind === "bearish");
  if (bullOBs.length > 0) {
    const ob = bullOBs[bullOBs.length - 1];
    bullPoints.push({ claim: `${bullOBs.length} bullish OB(s) detected`, evidence: `Nearest: ${ob.low.toFixed(5)}-${ob.high.toFixed(5)} (${ob.impulseMag.toFixed(1)}× ATR)` });
  }
  if (bearOBs.length > 0) {
    const ob = bearOBs[bearOBs.length - 1];
    bearPoints.push({ claim: `${bearOBs.length} bearish OB(s) detected`, evidence: `Nearest: ${ob.low.toFixed(5)}-${ob.high.toFixed(5)} (${ob.impulseMag.toFixed(1)}× ATR)` });
  }

  if (structure.bias === "bullish") {
    bearPoints.push({ claim: "Structure may be weakening — watch for CHoCH", evidence: "Single BOS not confirmed by higher timeframe" });
  }
  if (structure.bias === "bearish") {
    bullPoints.push({ claim: "Potential reversal — oversold conditions possible", evidence: "Price may reject and form CHoCH" });
  }

  const bullConfidence = bullPoints.length * 0.2 + (structure.bias === "bullish" ? 0.3 : 0);
  const bearConfidence = bearPoints.length * 0.2 + (structure.bias === "bearish" ? 0.3 : 0);

  let finalVerdict: string;
  if (bullConfidence > bearConfidence + 0.2) finalVerdict = "STRONG_LONG";
  else if (bullConfidence > bearConfidence) finalVerdict = "LEAN_LONG";
  else if (bearConfidence > bullConfidence + 0.2) finalVerdict = "STRONG_SHORT";
  else if (bearConfidence > bullConfidence) finalVerdict = "LEAN_SHORT";
  else finalVerdict = "NEUTRAL";

  return {
    bullCase: { direction: "bullish", points: bullPoints, overallConfidence: Math.min(bullConfidence, 1) },
    bearCase: { direction: "bearish", points: bearPoints, overallConfidence: Math.min(bearConfidence, 1) },
    debateRounds: [
      `Bull: "${bullPoints[0]?.claim ?? "No strong case"}" (${(bullConfidence * 100).toFixed(0)}%)`,
      `Bear: "${bearPoints[0]?.claim ?? "No strong case"}" (${(bearConfidence * 100).toFixed(0)}%)`,
      `Synthesis: ${finalVerdict.replace("_", " ")} — ${bullConfidence > bearConfidence ? "bulls" : bearConfidence > bullConfidence ? "bears" : "balance"} in control`,
    ],
    finalVerdict,
    confidence: Math.max(bullConfidence, bearConfidence),
    finalRationale: `Net confidence: ${((bullConfidence - bearConfidence) * 100).toFixed(0)}%`,
    entryZone: "See levels below",
    invalidationLevel: structure.bias === "bullish" ? structure.lastSwingLow.toFixed(5) : structure.lastSwingHigh.toFixed(5),
    riskReward: "See levels below",
  };
}

function buildLevels(structure: ReturnType<typeof detectStructure>, lastPrice: number, atr: number) {
  const direction = structure.bias === "bullish" ? "long" : structure.bias === "bearish" ? "short" : "neutral";
  if (direction === "neutral") return { direction, confidence: 0.5, entry: lastPrice.toFixed(5), stopLoss: (lastPrice - atr * 2).toFixed(5), takeProfit1: (lastPrice + atr * 2).toFixed(5), takeProfit2: (lastPrice + atr * 3).toFixed(5), riskReward: "1.0" };

  const stopLoss = direction === "long" ? lastPrice - atr * 1.5 : lastPrice + atr * 1.5;
  const takeProfit1 = direction === "long" ? lastPrice + atr * 2 : lastPrice - atr * 2;
  const takeProfit2 = direction === "long" ? lastPrice + atr * 3 : lastPrice - atr * 3;

  return {
    direction,
    confidence: 0.7,
    entry: lastPrice.toFixed(5),
    stopLoss: stopLoss.toFixed(5),
    takeProfit1: takeProfit1.toFixed(5),
    takeProfit2: takeProfit2.toFixed(5),
    riskReward: ((Math.abs(takeProfit2 - lastPrice)) / Math.abs(stopLoss - lastPrice)).toFixed(1),
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
        const debate = generateDebate(structure);
        const levels = buildLevels(structure, bars[bars.length - 1].close, atr);

        return Response.json({
          structure,
          debate,
          levels,
          pair,
          interval,
          barCount: bars.length,
          lastPrice: bars[bars.length - 1].close,
        }, { headers: { "Cache-Control": "public, max-age=60" } });
      },
    },
  },
});
