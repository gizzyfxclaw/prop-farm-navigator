import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Hermes's analysis log — market observations, setups it's watching,
 * reasoning notes. This is NOT a trade ticket and never triggers execution;
 * it's a record a human reads before deciding anything.
 */
const noteInput = z.object({
  pair: z.string().optional(),
  summary: z.string().min(1),
  details: z.unknown().optional(),
  /** Links this note back to the request it's answering, when applicable. */
  request_id: z.string().optional(),
  /** Verdict on the human's own submitted analysis, when the request included one. */
  verdict: z.enum(["match", "diverge", "partial"]).optional(),
});

export const Route = createFileRoute("/api/hermes/notes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ notes: [] });

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

        const { results } = await env.DB.prepare(
          "SELECT * FROM hermes_notes ORDER BY created_at DESC LIMIT ?",
        )
          .bind(limit)
          .all();

        return Response.json({ notes: results });
      },

      POST: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = noteInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          "INSERT INTO hermes_notes (id, pair, summary, details, request_id, verdict) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(
            id,
            body.pair ?? null,
            body.summary,
            body.details != null ? JSON.stringify(body.details) : null,
            body.request_id ?? null,
            body.verdict ?? null,
          )
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
