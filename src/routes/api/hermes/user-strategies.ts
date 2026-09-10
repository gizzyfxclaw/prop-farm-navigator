import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";

const strategyInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  family: z.string().default("custom"),
  entry_conditions: z.string().default("[]"),
  sl_type: z.string().default("fixed_pips"),
  sl_value: z.number().default(20),
  tp_type: z.string().default("rr_multiple"),
  tp_value: z.number().default(2.5),
  session_filter: z.string().default("all"),
  trend_filter: z.number().default(0),
  trend_ema_length: z.number().default(200),
  default_timeframe: z.string().default("1h"),
});

const deleteInput = z.object({
  id: z.string(),
});

export const Route = createFileRoute("/api/hermes/user-strategies")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const env = getCFEnv();
          if (!env) return Response.json({ strategies: [] });
          const { results } = await env.DB.prepare(
            "SELECT * FROM user_strategies WHERE is_active = 1 ORDER BY created_at DESC"
          ).all();
          return Response.json({ strategies: results });
        } catch (e) {
          return Response.json({ strategies: [], error: String(e) });
        }
      },

      POST: async ({ request }) => {
        try {
          const env = getCFEnv();
          if (!env) return Response.json({ error: "No env" }, { status: 503 });
          const body = strategyInput.parse(await request.json());
          const id = body.id || crypto.randomUUID();

          if (body.id) {
            await env.DB.prepare(
              `UPDATE user_strategies SET name = ?, description = ?, entry_conditions = ?,
                sl_type = ?, sl_value = ?, tp_type = ?, tp_value = ?,
                session_filter = ?, trend_filter = ?, trend_ema_length = ?,
                default_timeframe = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
               WHERE id = ?`
            ).bind(
              body.name, body.description || "", body.entry_conditions,
              body.sl_type, body.sl_value, body.tp_type, body.tp_value,
              body.session_filter, body.trend_filter, body.trend_ema_length,
              body.default_timeframe, id
            ).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO user_strategies
               (id, user_email, name, description, family, entry_conditions,
                sl_type, sl_value, tp_type, tp_value, session_filter,
                trend_filter, trend_ema_length, default_timeframe)
               VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              id, body.name, body.description || "", body.family, body.entry_conditions,
              body.sl_type, body.sl_value, body.tp_type, body.tp_value,
              body.session_filter, body.trend_filter, body.trend_ema_length,
              body.default_timeframe
            ).run();
          }

          return Response.json({ id, ok: true });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 400 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const env = getCFEnv();
          if (!env) return Response.json({ error: "No env" }, { status: 503 });
          const body = deleteInput.parse(await request.json());
          await env.DB.prepare(
            "UPDATE user_strategies SET is_active = 0 WHERE id = ?"
          ).bind(body.id).run();
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 400 });
        }
      },
    },
  },
});
