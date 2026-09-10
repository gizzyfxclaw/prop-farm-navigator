import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

const ruleInput = z
  .object({
    knowledge_doc_id: z.string().optional(),
    title: z.string().min(1),
    direction: z.enum(["long", "short", "both"]).default("both"),
    entry_type: z.enum(["sma_cross", "ema_cross", "rsi", "breakout", "custom"]),
    entry_params: z.record(z.string(), z.number()).default({}),
    custom_rules: z.string().optional(),
    sl_type: z.enum(["atr", "fixed_pips"]),
    sl_value: z.number().positive(),
    tp_type: z.enum(["rr_multiple", "fixed_pips"]),
    tp_value: z.number().positive(),
    default_timeframe: z.string().default("1h"),
    active: z.boolean().default(true),
  })
  .refine(
    (v) => (v.entry_type === "custom" ? !!v.custom_rules?.trim() : Object.keys(v.entry_params).length > 0),
    { message: "custom_rules is required for entry_type=custom; entry_params is required otherwise" },
  );

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
           (id, knowledge_doc_id, title, direction, entry_type, entry_params, custom_rules, sl_type, sl_value, tp_type, tp_value, default_timeframe, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            body.knowledge_doc_id ?? null,
            body.title,
            body.direction,
            body.entry_type,
            JSON.stringify(body.entry_params),
            body.custom_rules ?? null,
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

      PATCH: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = await request.json() as { id?: string; active?: boolean; title?: string; custom_rules?: string };
        if (!body.id || body.active === undefined) {
          return Response.json({ error: "id and active required" }, { status: 400 });
        }

        await env.DB.prepare(
          "UPDATE strategy_rules SET active = ?, title = ?, custom_rules = ? WHERE id = ?",
        )
          .bind(body.active ? 1 : 0, body.title ?? null, body.custom_rules ?? null, body.id)
          .run();

        return Response.json({ ok: true });
      },
    },
  },
});
