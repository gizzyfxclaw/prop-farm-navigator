import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Whole-knowledge-base synthesis, written periodically (see the gizzyfx
 * cron job) rather than per-document. This is what actually answers "does
 * it understand everything" — a standing summary of the combined strategy
 * material, with contradictions between documents called out explicitly.
 */
const understandingInput = z.object({
  summary: z.string().min(1),
  contradictions: z.string().optional(),
  doc_count: z.number().int().nonnegative(),
});

export const Route = createFileRoute("/api/hermes/understanding")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ understanding: null });

        const row = await env.DB.prepare(
          "SELECT * FROM hermes_understanding ORDER BY created_at DESC LIMIT 1",
        )
          .bind()
          .first();

        return Response.json({ understanding: row ?? null });
      },

      POST: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = understandingInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          "INSERT INTO hermes_understanding (id, summary, contradictions, doc_count) VALUES (?, ?, ?, ?)",
        )
          .bind(id, body.summary, body.contradictions ?? null, body.doc_count)
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
