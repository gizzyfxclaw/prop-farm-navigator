import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { strategies, getStrategy } from "@/lib/strategies/registry";
import { fetchBarsWithRetry, type Bar } from "@/lib/tvremix";

const runInput = z.object({
  strategy_id: z.string(),
  pair: z.string().default("EURUSD"),
  interval: z.string().default("1h"),
  limit: z.number().int().positive().max(5000).default(2000),
  params: z.record(z.any()).default({}),
});

const analyzeInput = z.object({
  strategy_id: z.string(),
  pair: z.string().default("EURUSD"),
  interval: z.string().default("1h"),
  limit: z.number().int().positive().max(5000).default(500),
  params: z.record(z.any()).default({}),
});

export const Route = createFileRoute("/api/strategies")({
  server: {
    handlers: {
      // List all available strategies
      GET: async () => {
        const publicStrategies = strategies.map(s => ({
          id: s.id,
          name: s.name,
          family: s.family,
          description: s.description,
          params: s.params,
        }));
        return Response.json({ strategies: publicStrategies });
      },

      // Run a strategy backtest or analysis
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = await request.json();
        const isAnalyze = body.action === "analyze";
        const input = isAnalyze ? analyzeInput.parse(body) : runInput.parse(body);
        
        const strategy = getStrategy(input.strategy_id);
        if (!strategy) {
          return Response.json({ error: "Strategy not found" }, { status: 404 });
        }

        // Fetch bars from tvremix (with Yahoo fallback via shared module)
        const apiKey = env?.TVREMIX_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "TVREMIX_API_KEY not configured" }, { status: 503 });
        }

        const bars = await fetchBarsWithRetry(apiKey, input.pair, input.interval, input.limit);

        if (!bars || bars.length === 0) {
          return Response.json({ error: "No data from upstream" }, { status: 502 });
        }

        if (isAnalyze) {
          // Live analysis: run strategy and return current signals
          const result = strategy.backtest(bars, input.params);
          const lastBar = bars[bars.length - 1]!;
          
          // Find active trade (if any)
          const activeTrade = result.trades.length > 0 && result.trades[result.trades.length - 1].exitIdx >= bars.length - 5
            ? result.trades[result.trades.length - 1]
            : null;
          
          // Look for pending setup (conditions met but no entry yet)
          const pendingSetup = activeTrade ? null : {
            direction: result.trades.length > 0 ? "watching" : "neutral",
            lastPrice: lastBar.close,
            lastTime: lastBar.time,
          };
          
          return Response.json({
            action: "analyze",
            strategy_id: input.strategy_id,
            strategy_name: strategy.name,
            pair: input.pair,
            interval: input.interval,
            bars_used: bars.length,
            last_price: lastBar.close,
            last_time: lastBar.time,
            active_trade: activeTrade,
            pending_setup: pendingSetup,
            recent_trades: result.trades.slice(-5),
            stats: result.stats,
          });
        } else {
          // Full backtest
          const result = strategy.backtest(bars, input.params);
          return Response.json({
            action: "backtest",
            strategy_id: input.strategy_id,
            strategy_name: strategy.name,
            pair: input.pair,
            interval: input.interval,
            bars_used: bars.length,
            ...result,
          });
        }
      },
    },
  },
});
