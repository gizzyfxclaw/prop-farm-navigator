import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * "Analyze with Hermes" endpoint.
 * 
 * Flow:
 * 1. POST from browser: user submits SMC data + image + notes
 * 2. Stored in hermes_smc_reviews table
 * 3. Hermes polls GET, picks up the request
 * 4. Hermes analyzes using strategy knowledge + image + SMC data
 * 5. Hermes POSTs feedback back to the table
 * 6. Browser polls GET to display feedback
 */

const submitInput = z.object({
  pair: z.string(),
  smc_data: z.record(z.any()),
  user_notes: z.string().optional(),
  user_image: z.string().optional(), // base64 data URL
  timeframe: z.string().default("1h"),
});

const feedbackInput = z.object({
  request_id: z.string(),
  verdict: z.enum(["match", "diverge", "partial", "neutral"]),
  feedback: z.string(),
  strategy_notes: z.string().optional(),
  entry: z.number().optional(),
  stop_loss: z.number().optional(),
  take_profit_1: z.number().optional(),
  take_profit_2: z.number().optional(),
  direction: z.enum(["long", "short"]).optional(),
  accuracy_grade: z.enum(["HIGH", "STANDARD", "NONE"]).optional(),
});

export const Route = createFileRoute("/api/hermes/analyze-with-hermes")({
  server: {
    handlers: {
      // Submit a new "Analyze with Hermes" request
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = submitInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          `INSERT INTO hermes_smc_reviews 
           (id, pair, timeframe, smc_data, user_notes, user_image, status, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`
        )
          .bind(
            id,
            body.pair,
            body.timeframe,
            JSON.stringify(body.smc_data),
            body.user_notes ?? null,
            body.user_image ?? null,
          )
          .run();

        return Response.json({ id, status: "pending" }, { status: 201 });
      },

      // Poll for pending requests (Hermes) or feedback (browser)
      GET: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return Response.json({ reviews: [] });

        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const id = url.searchParams.get("id");

        let query = "SELECT * FROM hermes_smc_reviews";
        const params: string[] = [];

        if (id) {
          query += " WHERE id = ?";
          params.push(id);
        } else if (status) {
          query += " WHERE status = ?";
          params.push(status);
        }

        query += " ORDER BY created_at DESC LIMIT 50";

        const { results } = await env.DB.prepare(query)
          .bind(...params)
          .all();

        return Response.json({ reviews: results });
      },

      // Hermes posts feedback
      PATCH: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = feedbackInput.parse(await request.json());

        await env.DB.prepare(
          `UPDATE hermes_smc_reviews SET 
             status = 'fulfilled',
             verdict = ?,
             feedback = ?,
             strategy_notes = ?,
             entry = ?,
             stop_loss = ?,
             take_profit_1 = ?,
             take_profit_2 = ?,
             direction = ?,
             accuracy_grade = ?,
             fulfilled_at = datetime('now')
           WHERE id = ?`
        )
          .bind(
            body.verdict,
            body.feedback,
            body.strategy_notes ?? null,
            body.entry ?? null,
            body.stop_loss ?? null,
            body.take_profit_1 ?? null,
            body.take_profit_2 ?? null,
            body.direction ?? null,
            body.accuracy_grade ?? null,
            body.request_id,
          )
          .run();

        return Response.json({ ok: true });
      },
    },
  },
});
