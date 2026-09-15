import { createFileRoute } from "@tanstack/react-router";

/**
 * Live TradingView Technical Analysis Scanner Endpoint
 *
 * Fetches institutional technical indicator data and summary ratings directly
 * from TradingView's official scanner engine.
 */

const TV_SCANNER_URL = "https://scanner.tradingview.com/forex/scan";

const SYMBOL_MAP: Record<string, string> = {
  EURUSD: "FX:EURUSD",
  USDJPY: "FX:USDJPY",
  GBPUSD: "FX:GBPUSD",
  AUDUSD: "FX:AUDUSD",
  USDCAD: "FX:USDCAD",
  NZDUSD: "FX:NZDUSD",
  USDCHF: "FX:USDCHF",
  XAUUSD: "OANDA:XAUUSD",
};

const COLUMNS = [
  "Recommend.Other",   // 0: Oscillators rating (-1.0 to 1.0)
  "Recommend.All",     // 1: Overall summary rating (-1.0 to 1.0)
  "Recommend.MA",      // 2: Moving Averages rating (-1.0 to 1.0)
  "RSI",               // 3: Relative Strength Index (14)
  "RSI[1]",            // 4: Prior RSI
  "Stoch.K",           // 5: Stochastic %K
  "Stoch.D",           // 6: Stochastic %D
  "CCI20",             // 7: Commodity Channel Index (20)
  "ADX",               // 8: Average Directional Index (14)
  "AO",                // 9: Awesome Oscillator
  "Mom",               // 10: Momentum (10)
  "MACD.macd",         // 11: MACD Level
  "MACD.signal",       // 12: MACD Signal Line
  "Rec.Stoch.RSI",     // 13: Stoch RSI recommendation
  "Stoch.RSI.K",       // 14: Stoch RSI %K
  "Rec.WR",            // 15: Williams %R recommendation
  "W.R",               // 16: Williams %R
  "Rec.BBPower",       // 17: Bull Bear Power recommendation
  "BBPower",           // 18: Bull Bear Power value
  "EMA10",             // 19: Exponential Moving Average 10
  "SMA10",             // 20: Simple Moving Average 10
  "EMA20",             // 21: Exponential Moving Average 20
  "SMA20",             // 22: Simple Moving Average 20
  "EMA50",             // 23: Exponential Moving Average 50
  "SMA50",             // 24: Simple Moving Average 50
  "EMA100",            // 25: Exponential Moving Average 100
  "SMA100",            // 26: Simple Moving Average 100
  "EMA200",            // 27: Exponential Moving Average 200
  "SMA200",            // 28: Simple Moving Average 200
  "Pivot.M.Classic.S1", // 29: Classic Pivot S1
  "Pivot.M.Classic.Middle", // 30: Classic Pivot Point
  "Pivot.M.Classic.R1", // 31: Classic Pivot R1
  "close",             // 32: Current close price
  "high",              // 33: Current high
  "low",               // 34: Current low
];

function ratingToVerdict(score: number): "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" {
  if (score >= 0.5) return "STRONG_BUY";
  if (score >= 0.1) return "BUY";
  if (score <= -0.5) return "STRONG_SELL";
  if (score <= -0.1) return "SELL";
  return "NEUTRAL";
}

export const Route = createFileRoute("/api/technicals")({
  server: {
    handlers: {
      async GET({ request }) {
        const url = new URL(request.url);
        const pairParam = url.searchParams.get("pair")?.toUpperCase().replace(/[^A-Z]/g, "") || "EURUSD";
        const ticker = SYMBOL_MAP[pairParam] || `FX:${pairParam}`;

        const payload = {
          symbols: {
            tickers: [ticker],
            query: { types: [] },
          },
          columns: COLUMNS,
        };

        try {
          const res = await fetch(TV_SCANNER_URL, {
            method: "POST",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Origin": "https://www.tradingview.com",
              "Referer": "https://www.tradingview.com/",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            return Response.json({ error: `TradingView scanner error ${res.status}` }, { status: res.status });
          }

          const data = await res.json() as any;
          const rows = data.data || [];
          if (rows.length === 0) {
            return Response.json({ error: `No technical data for ${pairParam}` }, { status: 404 });
          }

          const d = rows[0].d;

          const summaryScore = d[1] ?? 0;
          const oscScore = d[0] ?? 0;
          const maScore = d[2] ?? 0;

          const result = {
            pair: pairParam,
            ticker,
            summary: {
              score: summaryScore,
              verdict: ratingToVerdict(summaryScore),
            },
            oscillators: {
              score: oscScore,
              verdict: ratingToVerdict(oscScore),
              rsi: d[3] != null ? +d[3].toFixed(2) : null,
              stoch_k: d[5] != null ? +d[5].toFixed(2) : null,
              stoch_d: d[6] != null ? +d[6].toFixed(2) : null,
              cci20: d[7] != null ? +d[7].toFixed(2) : null,
              adx: d[8] != null ? +d[8].toFixed(2) : null,
              ao: d[9] != null ? +d[9].toFixed(5) : null,
              momentum: d[10] != null ? +d[10].toFixed(5) : null,
              macd_level: d[11] != null ? +d[11].toFixed(5) : null,
              macd_signal: d[12] != null ? +d[12].toFixed(5) : null,
              williams_r: d[16] != null ? +d[16].toFixed(2) : null,
              bull_bear_power: d[18] != null ? +d[18].toFixed(5) : null,
            },
            moving_averages: {
              score: maScore,
              verdict: ratingToVerdict(maScore),
              ema10: d[19] != null ? +d[19].toFixed(5) : null,
              sma10: d[20] != null ? +d[20].toFixed(5) : null,
              ema20: d[21] != null ? +d[21].toFixed(5) : null,
              sma20: d[22] != null ? +d[22].toFixed(5) : null,
              ema50: d[23] != null ? +d[23].toFixed(5) : null,
              sma50: d[24] != null ? +d[24].toFixed(5) : null,
              ema100: d[25] != null ? +d[25].toFixed(5) : null,
              sma100: d[26] != null ? +d[26].toFixed(5) : null,
              ema200: d[27] != null ? +d[27].toFixed(5) : null,
              sma200: d[28] != null ? +d[28].toFixed(5) : null,
            },
            pivots: {
              s1: d[29] != null ? +d[29].toFixed(5) : null,
              middle: d[30] != null ? +d[30].toFixed(5) : null,
              r1: d[31] != null ? +d[31].toFixed(5) : null,
            },
            price: {
              close: d[32] != null ? +d[32].toFixed(5) : null,
              high: d[33] != null ? +d[33].toFixed(5) : null,
              low: d[34] != null ? +d[34].toFixed(5) : null,
            },
            timestamp: new Date().toISOString(),
          };

          return Response.json(result);
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to fetch technicals" }, { status: 500 });
        }
      },
    },
  },
});
