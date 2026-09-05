import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Durable win-rate tracking. scripts/self_learn.py evaluates each fulfilled
 * SMC review against real price movement and upserts one row here per
 * review (keyed on review_id, so a still-PENDING setup gets updated in
 * place rather than duplicated once it resolves). The frontend reads GET
 * for a rolling win-rate stat instead of the ephemeral 2-hour text summary
 * self_learn.py used to write straight to the knowledge base and discard.
 */

const outcomeInput = z.object({
  review_id: z.string(),
  pair: z.string(),
  timeframe: z.string().optional(),
  direction: z.enum(["long", "short"]).nullish(),
  entry: z.number().nullish(),
  stop_loss: z.number().nullish(),
  take_profit: z.number().nullish(),
  accuracy_grade: z.string().nullish(),
  outcome: z.enum(["WIN", "LOSS", "PENDING"]),
  pips_moved: z.number().nullish(),
  sl_pips: z.number().nullish(),
});

export const Route = createFileRoute("/api/hermes/outcomes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return Response.json({ outcomes: [], stats: null });

        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 500);
        const pair = url.searchParams.get("pair");

        const query = pair
          ? "SELECT * FROM hermes_outcomes WHERE pair = ? ORDER BY evaluated_at DESC LIMIT ?"
          : "SELECT * FROM hermes_outcomes ORDER BY evaluated_at DESC LIMIT ?";
        const { results } = pair
          ? await env.DB.prepare(query).bind(pair, limit).all()
          : await env.DB.prepare(query).bind(limit).all();

        const wins = results.filter((r: any) => r.outcome === "WIN").length;
        const losses = results.filter((r: any) => r.outcome === "LOSS").length;
        const pending = results.filter((r: any) => r.outcome === "PENDING").length;
        const decided = wins + losses;

        const highGrade = results.filter((r: any) => r.accuracy_grade === "HIGH");
        const highGradeWins = highGrade.filter((r: any) => r.outcome === "WIN").length;
        const highGradeDecided = highGrade.filter((r: any) => r.outcome !== "PENDING").length;

        return Response.json({
          outcomes: results,
          stats: {
            total: results.length,
            wins, losses, pending,
            winRate: decided > 0 ? (wins / decided) * 100 : null,
            highGradeTotal: highGrade.length,
            highGradeWinRate: highGradeDecided > 0 ? (highGradeWins / highGradeDecided) * 100 : null,
          },
        });
      },

      POST: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = outcomeInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          `INSERT INTO hermes_outcomes
             (id, review_id, pair, timeframe, direction, entry, stop_loss, take_profit, accuracy_grade, outcome, pips_moved, sl_pips)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(review_id) DO UPDATE SET
             outcome = excluded.outcome,
             pips_moved = excluded.pips_moved,
             accuracy_grade = excluded.accuracy_grade,
             evaluated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
        )
          .bind(
            id,
            body.review_id,
            body.pair,
            body.timeframe ?? null,
            body.direction ?? null,
            body.entry ?? null,
            body.stop_loss ?? null,
            body.take_profit ?? null,
            body.accuracy_grade ?? null,
            body.outcome,
            body.pips_moved ?? null,
            body.sl_pips ?? null,
          )
          .run();

        return Response.json({ ok: true }, { status: 201 });
      },
    },
  },
});
