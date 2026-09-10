import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { strategies, getStrategy } from "@/lib/strategies/registry";
import { fetchBarsWithRetry, type Bar } from "@/lib/tvremix";

const analyzeInput = z.object({
  action: z.enum(["analyze", "interpret_backtest"]),
  strategy_id: z.string(),
  pair: z.string().default("EURUSD"),
  interval: z.string().default("1h"),
  limit: z.number().int().positive().max(5000).default(500),
  params: z.record(z.any()).default({}),
  use_pending_order: z.boolean().default(true),
  entry_gap_pips: z.number().default(5),
  backtest_result: z.record(z.any()).optional(),
});

export const Route = createFileRoute("/api/hermes/strategy-analysis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = analyzeInput.parse(await request.json());

        const nousKey = env?.NOUS_API_KEY;
        if (!nousKey) {
          return Response.json({ error: "NOUS_API_KEY not configured" }, { status: 503 });
        }

        const tvremixKey = env?.TVREMIX_API_KEY;
        if (!tvremixKey) {
          return Response.json({ error: "TVREMIX_API_KEY not configured" }, { status: 503 });
        }

        // Fetch bars
        const bars = await fetchBarsWithRetry(tvremixKey, body.pair, body.interval, body.limit);
        if (!bars || bars.length === 0) {
          return Response.json({ error: "No data from upstream" }, { status: 502 });
        }

        const strategy = getStrategy(body.strategy_id);
        if (!strategy) {
          return Response.json({ error: "Strategy not found" }, { status: 404 });
        }

        // Run the strategy backtest
        const result = strategy.backtest(bars, body.params);
        const lastBar = bars[bars.length - 1] as any;

        // Find active signal
        const recentTrades = result.trades.slice(-5);
        const activeTrade = result.trades.length > 0 && result.trades[result.trades.length - 1].exitIdx >= bars.length - 5
          ? result.trades[result.trades.length - 1]
          : null;

        // Build prompt
        const prompt = `You are GizzyFx Co-Pilot, a professional trading analyst. A strategy has been run against current market data. Provide:

1. SIGNAL — LONG, SHORT, or NEUTRAL based on current conditions
2. ENTRY — Exact price level for entry (5 decimal places)
3. STOP_LOSS — Exact price level for stop loss (5 decimal places)
4. TAKE_PROFIT_1 — First target price (5 decimal places)
5. TAKE_PROFIT_2 — Second target price (5 decimal places)
6. CONFIDENCE — 0-100% based on setup quality
7. RATIONALE — One sentence explaining why this setup exists
8. RISK — One sentence on what invalidates this setup

Strategy: ${strategy.name}
Pair: ${body.pair}
Timeframe: ${body.interval}
Last price: ${lastBar.close.toFixed(5)}
Strategy stats: ${result.stats.total} trades, ${result.stats.winRate.toFixed(1)}% WR, ${result.stats.totalPips.toFixed(1)} pips total
Recent signals: ${recentTrades.length > 0 ? recentTrades.map(t => `${t.direction} @ ${t.entry.toFixed(5)}`).join(", ") : "none"}

Current market context (last 10 bars):
${bars.slice(-10).map((b: any) => `O:${b.open.toFixed(5)} H:${b.high.toFixed(5)} L:${b.low.toFixed(5)} C:${b.close.toFixed(5)}`).join("\n")}

${body.use_pending_order ? `IMPORTANT: This strategy uses PENDING ORDERS. The user wants to enter with a ${body.entry_gap_pips} pip gap from the signal price.
- For LONG signals: Pending entry should be placed ${body.entry_gap_pips} pips BELOW the signal entry price
- For SHORT signals: Pending entry should be placed ${body.entry_gap_pips} pips ABOVE the signal entry price
- Calculate the exact pending entry price and return it as "entry" in the JSON response` : ""}

Respond in JSON format only:
{"signal":"LONG|SHORT|NEUTRAL","entry":1.12345,"stopLoss":1.12000,"takeProfit1":1.13000,"takeProfit2":1.13500,"confidence":75,"rationale":"...","risk":"..."}`;

        // Call LLM directly
        try {
          const llmRes = await fetch("https://api.nousresearch.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${nousKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "meituan/longcat-2.0:free",
              messages: [
                { role: "system", content: "You are GizzyFx Co-Pilot, an expert forex trading analyst. You provide structured, honest analysis. Do not give false confidence." },
                { role: "user", content: prompt },
              ],
              temperature: 0.3,
              max_tokens: 500,
            }),
          });

          if (!llmRes.ok) {
            throw new Error(`LLM error: ${llmRes.status}`);
          }

          const llmData = await llmRes.json();
          const content = llmData.choices?.[0]?.message?.content || "";

          let analysis: any;
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
            } else {
              analysis = { raw: content };
            }
          } catch {
            analysis = { raw: content };
          }

          return Response.json({
            strategy_id: body.strategy_id,
            strategy_name: strategy.name,
            pair: body.pair,
            interval: body.interval,
            last_price: lastBar.close,
            bars_used: bars.length,
            strategy_stats: result.stats,
            analysis,
            raw_llm_response: content.substring(0, 1000),
          });
        } catch (e) {
          return Response.json({ error: `LLM call failed: ${String(e)}` }, { status: 500 });
        }
      },
    },
  },
});
