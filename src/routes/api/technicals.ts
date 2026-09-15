import { createFileRoute } from "@tanstack/react-router";

/**
 * Live TradingView Technical Analysis Scanner Endpoint
 *
 * Fetches institutional technical indicator data and summary ratings directly
 * from TradingView's official scanner engine across any requested timeframe.
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

const INTERVAL_SUFFIX: Record<string, string> = {
  "1m": "|1",
  "5m": "|5",
  "15m": "|15",
  "30m": "|30",
  "1h": "|60",
  "2h": "|120",
  "4h": "|240",
  "1d": "",
  "1D": "",
  "1w": "|1W",
  "1W": "|1W",
  "1M": "|1M",
  "1mth": "|1M",
};

function buildColumns(sfx: string) {
  return [
    `Recommend.Other${sfx}`,       // 0: Oscillators summary (-1.0 to 1.0)
    `Recommend.All${sfx}`,         // 1: Overall summary (-1.0 to 1.0)
    `Recommend.MA${sfx}`,          // 2: MA summary (-1.0 to 1.0)
    `RSI${sfx}`,                   // 3: RSI (14)
    `Stoch.K${sfx}`,               // 4: Stoch.K (14, 3, 3)
    `Stoch.D${sfx}`,               // 5: Stoch.D
    `CCI20${sfx}`,                 // 6: CCI (20)
    `ADX${sfx}`,                   // 7: ADX (14)
    `AO${sfx}`,                    // 8: Awesome Oscillator
    `Mom${sfx}`,                   // 9: Momentum (10)
    `MACD.macd${sfx}`,             // 10: MACD Level (12, 26)
    `MACD.signal${sfx}`,           // 11: MACD Signal
    `Rec.Stoch.RSI${sfx}`,         // 12: Stoch RSI recommendation
    `Stoch.RSI.K${sfx}`,           // 13: Stoch RSI K (3, 3, 14, 14)
    `Rec.WR${sfx}`,                // 14: Williams %R recommendation
    `W.R${sfx}`,                   // 15: Williams %R (14)
    `Rec.BBPower${sfx}`,           // 16: Bull Bear Power recommendation
    `BBPower${sfx}`,               // 17: Bull Bear Power
    `Rec.UO${sfx}`,                // 18: Ultimate Oscillator recommendation
    `UO${sfx}`,                    // 19: Ultimate Oscillator (7, 14, 28)
    `EMA10${sfx}`,                 // 20: EMA 10
    `SMA10${sfx}`,                 // 21: SMA 10
    `EMA20${sfx}`,                 // 22: EMA 20
    `SMA20${sfx}`,                 // 23: SMA 20
    `EMA30${sfx}`,                 // 24: EMA 30
    `SMA30${sfx}`,                 // 25: SMA 30
    `EMA50${sfx}`,                 // 26: EMA 50
    `SMA50${sfx}`,                 // 27: SMA 50
    `EMA100${sfx}`,                // 28: EMA 100
    `SMA100${sfx}`,                // 29: SMA 100
    `EMA200${sfx}`,                // 30: EMA 200
    `SMA200${sfx}`,                // 31: SMA 200
    `Rec.Ichimoku${sfx}`,          // 32: Ichimoku recommendation
    `Ichimoku.BLine${sfx}`,        // 33: Ichimoku Base Line
    `Rec.VWMA${sfx}`,              // 34: VWMA recommendation
    `VWMA${sfx}`,                  // 35: Volume Weighted MA (20)
    `Rec.HullMA9${sfx}`,           // 36: Hull MA recommendation
    `HullMA9${sfx}`,               // 37: Hull MA (9)
    `Pivot.M.Classic.S3${sfx}`,    // 38
    `Pivot.M.Classic.S2${sfx}`,    // 39
    `Pivot.M.Classic.S1${sfx}`,    // 40
    `Pivot.M.Classic.Middle${sfx}`,// 41
    `Pivot.M.Classic.R1${sfx}`,    // 42
    `Pivot.M.Classic.R2${sfx}`,    // 43
    `Pivot.M.Classic.R3${sfx}`,    // 44
    `Pivot.M.Fibonacci.S3${sfx}`,  // 45
    `Pivot.M.Fibonacci.S2${sfx}`,  // 46
    `Pivot.M.Fibonacci.S1${sfx}`,  // 47
    `Pivot.M.Fibonacci.Middle${sfx}`,// 48
    `Pivot.M.Fibonacci.R1${sfx}`,  // 49
    `Pivot.M.Fibonacci.R2${sfx}`,  // 50
    `Pivot.M.Fibonacci.R3${sfx}`,  // 51
    `Pivot.M.Camarilla.S3${sfx}`,  // 52
    `Pivot.M.Camarilla.S2${sfx}`,  // 53
    `Pivot.M.Camarilla.S1${sfx}`,  // 54
    `Pivot.M.Camarilla.Middle${sfx}`,// 55
    `Pivot.M.Camarilla.R1${sfx}`,  // 56
    `Pivot.M.Camarilla.R2${sfx}`,  // 57
    `Pivot.M.Camarilla.R3${sfx}`,  // 58
    `Pivot.M.Woodie.S3${sfx}`,     // 59
    `Pivot.M.Woodie.S2${sfx}`,     // 60
    `Pivot.M.Woodie.S1${sfx}`,     // 61
    `Pivot.M.Woodie.Middle${sfx}`, // 62
    `Pivot.M.Woodie.R1${sfx}`,     // 63
    `Pivot.M.Woodie.R2${sfx}`,     // 64
    `Pivot.M.Woodie.R3${sfx}`,     // 65
    `Pivot.M.Demark.S1${sfx}`,     // 66
    `Pivot.M.Demark.Middle${sfx}`, // 67
    `Pivot.M.Demark.R1${sfx}`,     // 68
    `close${sfx}`,                 // 69
    `open${sfx}`,                  // 70
    `high${sfx}`,                  // 71
    `low${sfx}`,                   // 72
  ];
}

function ratingToVerdict(score: number): "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" {
  if (score >= 0.5) return "STRONG_BUY";
  if (score >= 0.1) return "BUY";
  if (score <= -0.5) return "STRONG_SELL";
  if (score <= -0.1) return "SELL";
  return "NEUTRAL";
}

function computeActionFromRec(rec: number | undefined): "Buy" | "Sell" | "Neutral" {
  if (rec === 1) return "Buy";
  if (rec === -1) return "Sell";
  return "Neutral";
}

export const Route = createFileRoute("/api/technicals")({
  server: {
    handlers: {
      async GET({ request }) {
        const url = new URL(request.url);
        const pairParam = url.searchParams.get("pair")?.toUpperCase().replace(/[^A-Z]/g, "") || "EURUSD";
        const intervalParam = url.searchParams.get("interval") || "1h";
        const ticker = SYMBOL_MAP[pairParam] || `FX:${pairParam}`;
        const sfx = INTERVAL_SUFFIX[intervalParam] ?? "|60";

        const columns = buildColumns(sfx);

        const payload = {
          symbols: {
            tickers: [ticker],
            query: { types: [] },
          },
          columns,
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
          const closePrice = d[69] ?? 0;

          // Compute individual MA actions vs current close
          const getMaAction = (maVal: number | null): "Buy" | "Sell" | "Neutral" => {
            if (maVal == null || closePrice === 0) return "Neutral";
            if (closePrice > maVal) return "Buy";
            if (closePrice < maVal) return "Sell";
            return "Neutral";
          };

          // Moving Averages array matching screenshot exactly
          const movingAverageRows = [
            { name: "Exponential Moving Average (10)", value: d[20], action: getMaAction(d[20]) },
            { name: "Simple Moving Average (10)", value: d[21], action: getMaAction(d[21]) },
            { name: "Exponential Moving Average (20)", value: d[22], action: getMaAction(d[22]) },
            { name: "Simple Moving Average (20)", value: d[23], action: getMaAction(d[23]) },
            { name: "Exponential Moving Average (30)", value: d[24], action: getMaAction(d[24]) },
            { name: "Simple Moving Average (30)", value: d[25], action: getMaAction(d[25]) },
            { name: "Exponential Moving Average (50)", value: d[26], action: getMaAction(d[26]) },
            { name: "Simple Moving Average (50)", value: d[27], action: getMaAction(d[27]) },
            { name: "Exponential Moving Average (100)", value: d[28], action: getMaAction(d[28]) },
            { name: "Simple Moving Average (100)", value: d[29], action: getMaAction(d[29]) },
            { name: "Exponential Moving Average (200)", value: d[30], action: getMaAction(d[30]) },
            { name: "Simple Moving Average (200)", value: d[31], action: getMaAction(d[31]) },
            { name: "Ichimoku Base Line (9, 26, 52, 26)", value: d[33], action: computeActionFromRec(d[32]) },
            { name: "Volume Weighted Moving Average (20)", value: d[35], action: computeActionFromRec(d[34]) || getMaAction(d[35]) },
            { name: "Hull Moving Average (9)", value: d[37], action: computeActionFromRec(d[36]) },
          ];

          // Compute Oscillator actions
          const getRsiAction = (rsi: number | null): "Buy" | "Sell" | "Neutral" => {
            if (rsi == null) return "Neutral";
            if (rsi < 30) return "Buy";
            if (rsi > 70) return "Sell";
            return "Neutral";
          };

          const getStochAction = (k: number | null): "Buy" | "Sell" | "Neutral" => {
            if (k == null) return "Neutral";
            if (k < 20) return "Buy";
            if (k > 80) return "Sell";
            return "Neutral";
          };

          const getCciAction = (cci: number | null): "Buy" | "Sell" | "Neutral" => {
            if (cci == null) return "Neutral";
            if (cci < -100) return "Buy";
            if (cci > 100) return "Sell";
            return "Neutral";
          };

          const getMacdAction = (macd: number | null, sig: number | null): "Buy" | "Sell" | "Neutral" => {
            if (macd == null || sig == null) return "Neutral";
            if (macd > sig) return "Buy";
            if (macd < sig) return "Sell";
            return "Neutral";
          };

          const getAoAction = (ao: number | null): "Buy" | "Sell" | "Neutral" => {
            if (ao == null) return "Neutral";
            if (ao > 0) return "Buy";
            if (ao < 0) return "Sell";
            return "Neutral";
          };

          const getMomAction = (mom: number | null): "Buy" | "Sell" | "Neutral" => {
            if (mom == null) return "Neutral";
            if (mom > 0) return "Buy";
            if (mom < 0) return "Sell";
            return "Neutral";
          };

          const oscillatorRows = [
            { name: "Relative Strength Index (14)", value: d[3], action: getRsiAction(d[3]) },
            { name: "Stochastic %K (14, 3, 3)", value: d[4], action: getStochAction(d[4]) },
            { name: "Commodity Channel Index (20)", value: d[6], action: getCciAction(d[6]) },
            { name: "Average Directional Index (14)", value: d[7], action: "Neutral" as const },
            { name: "Awesome Oscillator", value: d[8], action: getAoAction(d[8]) },
            { name: "Momentum (10)", value: d[9], action: getMomAction(d[9]) },
            { name: "MACD Level (12, 26)", value: d[10], action: getMacdAction(d[10], d[11]) },
            { name: "Stochastic RSI Fast (3, 3, 14, 14)", value: d[13], action: computeActionFromRec(d[12]) || getStochAction(d[13]) },
            { name: "Williams Percent Range (14)", value: d[15], action: computeActionFromRec(d[14]) },
            { name: "Bull Bear Power", value: d[17], action: computeActionFromRec(d[16]) || getAoAction(d[17]) },
            { name: "Ultimate Oscillator (7, 14, 28)", value: d[19], action: computeActionFromRec(d[18]) },
          ];

          // Count Buys, Neutrals, Sells
          const countActions = (arr: Array<{ action: "Buy" | "Sell" | "Neutral" }>) => {
            let buy = 0, neutral = 0, sell = 0;
            for (const item of arr) {
              if (item.action === "Buy") buy++;
              else if (item.action === "Sell") sell++;
              else neutral++;
            }
            return { buy, neutral, sell };
          };

          const oscCounts = countActions(oscillatorRows);
          const maCounts = countActions(movingAverageRows);
          const totalCounts = {
            buy: oscCounts.buy + maCounts.buy,
            neutral: oscCounts.neutral + maCounts.neutral,
            sell: oscCounts.sell + maCounts.sell,
          };

          const oscScore = d[0] ?? 0;
          const summaryScore = d[1] ?? 0;
          const maScore = d[2] ?? 0;

          const result = {
            pair: pairParam,
            ticker,
            interval: intervalParam,
            summary: {
              score: summaryScore,
              verdict: ratingToVerdict(summaryScore),
              counts: totalCounts,
            },
            oscillators: {
              score: oscScore,
              verdict: ratingToVerdict(oscScore),
              counts: oscCounts,
              rows: oscillatorRows.map(r => ({
                name: r.name,
                value: r.value != null ? +r.value.toFixed(5) : null,
                action: r.action,
              })),
            },
            moving_averages: {
              score: maScore,
              verdict: ratingToVerdict(maScore),
              counts: maCounts,
              rows: movingAverageRows.map(r => ({
                name: r.name,
                value: r.value != null ? +r.value.toFixed(5) : null,
                action: r.action,
              })),
            },
            pivots: {
              classic: {
                r3: d[44], r2: d[43], r1: d[42], p: d[41], s1: d[40], s2: d[39], s3: d[38],
              },
              fibonacci: {
                r3: d[51], r2: d[50], r1: d[49], p: d[48], s1: d[47], s2: d[46], s3: d[45],
              },
              camarilla: {
                r3: d[58], r2: d[57], r1: d[56], p: d[55], s1: d[54], s2: d[53], s3: d[52],
              },
              woodie: {
                r3: d[65], r2: d[64], r1: d[63], p: d[62], s1: d[61], s2: d[60], s3: d[59],
              },
              demark: {
                r1: d[68], p: d[67], s1: d[66],
              },
            },
            price: {
              close: d[69],
              open: d[70],
              high: d[71],
              low: d[72],
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
