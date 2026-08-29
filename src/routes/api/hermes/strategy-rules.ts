import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Structured, machine-executable strategy definitions — the codified
 * counterpart to the free-text `knowledge_docs`. A deterministic backtest can
 * only run against one of these; a free-text doc with no rule here can still
 * be discussed by Hermes, but not backtested mechanically.
 */
const ruleInput = z.object({
  knowledge_doc_id: z.string().optional(),
  title: z.string().min(1),
  direction: z.enum(["long", "short", "both"]).default("both"),
  entry_type: z.enum(["sma_cross", "ema_cross", "rsi", "breakout"]),
  entry_params: z.record(z.string(), z.number()),
  sl_type: z.enum(["atr", "fixed_pips"]),
  sl_value: z.number().positive(),
  tp_type: z.enum(["rr_multiple", "fixed_pips"]),
  tp_value: z.number().positive(),
  default_timeframe: z.string().default("1h"),
  active: z.boolean().default(true),
});

export const Route = createFileRoute("/api/hermes/strategy-rules")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ rules: [] });

        const { results } = await env.DB.prepare(
          "SELECT * FROM strategy_rules ORDER BY created_at DESC",
        )
          .bind()
          .all();

        return Response.json({ rules: results });
      },

      POST: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = ruleInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          `INSERT INTO strategy_rules
           (id, knowledge_doc_id, title, direction, entry_type, entry_params, sl_type, sl_value, tp_type, tp_value, default_timeframe, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            body.knowledge_doc_id ?? null,
            body.title,
            body.direction,
            body.entry_type,
            JSON.stringify(body.entry_params),
            body.sl_type,
            body.sl_value,
            body.tp_type,
            body.tp_value,
            body.default_timeframe,
            body.active ? 1 : 0,
          )
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
