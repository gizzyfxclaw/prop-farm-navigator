import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Approximate, LLM-narrated strategy walkthroughs — NOT a statistically
 * rigorous backtest. Strategies here are free text (taught via PDF/notes),
 * not executable rules, so Hermes reasons through a bounded recent window
 * of candles rather than running a deterministic simulation over years of
 * history. The `narrative` field must own that limitation explicitly; the
 * UI surfaces it too so the win rate is never read as more than it is.
 */
const backtestInput = z.object({
  request_id: z.string().optional(),
  pair: z.string().min(1),
  period_description: z.string().min(1),
  trades_analyzed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  narrative: z.string().min(1),
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
           (id, request_id, pair, period_description, trades_analyzed, wins, losses, win_rate, narrative)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          )
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
