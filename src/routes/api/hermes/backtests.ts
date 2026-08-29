import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Two kinds of result land here:
 *  - Deterministic: posted by the no-agent backtest script against a
 *    `strategy_rules` row — a real candle-by-candle simulation over real
 *    TradingView history. `deterministic=1`, `rule_id`/`timeframe` set.
 *  - Approximate: LLM-narrated walkthroughs for strategies with no
 *    structured rule yet (free text isn't executable) — a bounded recent
 *    window, not a statistically rigorous backtest. `narrative` must own
 *    that limitation explicitly; the UI surfaces it too.
 */
const backtestInput = z.object({
  request_id: z.string().optional(),
  pair: z.string().min(1),
  period_description: z.string().min(1),
  trades_analyzed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  narrative: z.string().min(1),
  deterministic: z.boolean().default(false),
  rule_id: z.string().optional(),
  timeframe: z.string().optional(),
  max_drawdown_pct: z.number().optional(),
  avg_rr: z.number().optional(),
  bars_used: z.number().int().optional(),
});

export const Route = createFileRoute("/api/hermes/backtests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ backtests: [] });

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

        const { results } = await env.DB.prepare(
          "SELECT * FROM hermes_backtests ORDER BY created_at DESC LIMIT ?",
        )
          .bind(limit)
          .all();

        return Response.json({ backtests: results });
      },

      POST: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = backtestInput.parse(await request.json());
        const id = crypto.randomUUID();
        const winRate = body.trades_analyzed > 0 ? body.wins / body.trades_analyzed : 0;

        await env.DB.prepare(
          `INSERT INTO hermes_backtests
           (id, request_id, pair, period_description, trades_analyzed, wins, losses, win_rate, narrative,
            deterministic, rule_id, timeframe, max_drawdown_pct, avg_rr, bars_used)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            body.request_id ?? null,
            body.pair,
            body.period_description,
            body.trades_analyzed,
            body.wins,
            body.losses,
            winRate,
            body.narrative,
            body.deterministic ? 1 : 0,
            body.rule_id ?? null,
            body.timeframe ?? null,
            body.max_drawdown_pct ?? null,
            body.avg_rr ?? null,
            body.bars_used ?? null,
          )
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
