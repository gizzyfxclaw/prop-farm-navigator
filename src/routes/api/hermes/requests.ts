import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Analysis request queue. The human creates requests from the browser (see
 * hermes-db.functions.ts — no auth, same-origin); Hermes polls GET here with
 * the shared secret and marks them fulfilled via PATCH once it's posted its
 * conclusion. Nothing here triggers a trade — it's a to-do list for analysis.
 */
const patchInput = z.object({
  id: z.string(),
  status: z.enum(["pending", "fulfilled"]),
});

export const Route = createFileRoute("/api/hermes/requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ requests: [] });

        const url = new URL(request.url);
        const status = url.searchParams.get("status");

        const { results } = status
          ? await env.DB.prepare(
              "SELECT * FROM hermes_requests WHERE status = ? ORDER BY created_at ASC",
            )
              .bind(status)
              .all()
          : await env.DB.prepare("SELECT * FROM hermes_requests ORDER BY created_at DESC LIMIT 100")
              .bind()
              .all();

        return Response.json({ requests: results });
      },

      PATCH: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = patchInput.parse(await request.json());
        await env.DB.prepare(
          "UPDATE hermes_requests SET status = ?, fulfilled_at = CASE WHEN ? = 'fulfilled' THEN datetime('now') ELSE fulfilled_at END WHERE id = ?",
        )
          .bind(body.status, body.status, body.id)
          .run();

        return Response.json({ ok: true });
      },
    },
  },
});
