import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Trade setup cards Hermes posts after analysis — entry/SL/TP levels for a
 * human to review and, if they choose, place manually. Nothing here touches
 * a broker or MetaApi; this is a suggestion card, not an order.
 */
const setupInput = z.object({
  request_id: z.string().optional(),
  pair: z.string().min(1),
  direction: z.enum(["long", "short"]),
  entry: z.number(),
  sl: z.number(),
  tp1: z.number(),
  tp2: z.number().optional(),
  tp3: z.number().optional(),
  rr: z.number().optional(),
  rationale: z.string().optional(),
  /** Pending vs instant execution — see calc.ts's pendingOrderType for the same logic. */
  order_type: z.enum(["MARKET", "BUY_LIMIT", "BUY_STOP", "SELL_LIMIT", "SELL_STOP"]).optional(),
});

export const Route = createFileRoute("/api/hermes/setups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ setups: [] });

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

        const { results } = await env.DB.prepare(
          "SELECT * FROM hermes_setups ORDER BY created_at DESC LIMIT ?",
        )
          .bind(limit)
          .all();

        return Response.json({ setups: results });
      },

      POST: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = setupInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          `INSERT INTO hermes_setups (id, request_id, pair, direction, entry, sl, tp1, tp2, tp3, rr, rationale, order_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            body.request_id ?? null,
            body.pair,
            body.direction,
            body.entry,
            body.sl,
            body.tp1,
            body.tp2 ?? null,
            body.tp3 ?? null,
            body.rr ?? null,
            body.rationale ?? null,
            body.order_type ?? null,
          )
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
