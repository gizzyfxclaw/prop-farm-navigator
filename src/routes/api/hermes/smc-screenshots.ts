import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * Screenshot storage for SMC analysis.
 * Screenshots are stored separately from the review row to avoid D1 row size limits.
 * 
 * POST: { review_id, step, label, data (base64 image) }
 * GET ?review_id=xxx: returns array of screenshots for that review
 */
export const Route = createFileRoute("/api/hermes/smc-screenshots")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return Response.json({ screenshots: [] });

        const url = new URL(request.url);
        const reviewId = url.searchParams.get("review_id");
        if (!reviewId) return Response.json({ screenshots: [] });

        const { results } = await env.DB.prepare(
          "SELECT id, step, label, data FROM hermes_smc_screenshots WHERE review_id = ? ORDER BY step ASC"
        ).bind(reviewId).all();

        return Response.json({ screenshots: results });
      },

      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = await request.json() as {
          review_id: string;
          step: number;
          label?: string;
          data: string;
        };

        if (!body.review_id || !body.data) {
          return Response.json({ error: "review_id and data required" }, { status: 400 });
        }

        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO hermes_smc_screenshots (id, review_id, step, label, data) VALUES (?, ?, ?, ?, ?)"
        ).bind(id, body.review_id, body.step ?? 0, body.label ?? null, body.data).run();

        return Response.json({ id, ok: true }, { status: 201 });
      },

      DELETE: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const url = new URL(request.url);
        const reviewId = url.searchParams.get("review_id");
        if (!reviewId) return Response.json({ error: "review_id required" }, { status: 400 });

        await env.DB.prepare(
          "DELETE FROM hermes_smc_screenshots WHERE review_id = ?"
        ).bind(reviewId).run();

        return Response.json({ ok: true });
      },
    },
  },
});
