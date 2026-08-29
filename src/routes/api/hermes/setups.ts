import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Structured trade setups posted by the Hermes agent after analysis.
 * Each setup has an entry, stop loss, and up to three take-profit levels.
 * The frontend displays these as a trade card AND auto-draws the levels on the chart.
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
});

export const Route = createFileRoute("/api/hermes/setups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return Response.json({ setups: [] });

        const url = new URL(request.url);
        const pair = url.searchParams.get("pair");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);

        const { results } = pair
          ? await env.DB.prepare(
              "SELECT * FROM hermes_setups WHERE pair = ? ORDER BY created_at DESC LIMIT ?",
            )
              .bind(pair, limit)
              .all()
          : await env.DB.prepare(
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
        const rr =
          body.rr ??
          Math.abs(body.tp1 - body.entry) / Math.abs(body.entry - body.sl);

        await env.DB.prepare(
          `INSERT INTO hermes_setups
           (id, request_id, pair, direction, entry, sl, tp1, tp2, tp3, rr, rationale)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            rr,
            body.rationale ?? null,
          )
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
