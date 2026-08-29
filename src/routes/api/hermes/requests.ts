import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Queue of analysis requests submitted from the web UI.
 * The Trading Agent polls this endpoint for pending requests, processes them,
 * then marks each one fulfilled via PATCH (or by posting a note).
 */
export const Route = createFileRoute("/api/hermes/requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ requests: [] });

        const url = new URL(request.url);
        const status = url.searchParams.get("status") ?? "pending";
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

        const { results } = await env.DB.prepare(
          "SELECT * FROM hermes_requests WHERE status = ? ORDER BY created_at ASC LIMIT ?",
        )
          .bind(status, limit)
          .all();

        return Response.json({ requests: results });
      },

      PATCH: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = z
          .object({ id: z.string(), status: z.enum(["fulfilled", "cancelled"]) })
          .parse(await request.json());

        await env.DB.prepare(
          "UPDATE hermes_requests SET status = ?, fulfilled_at = datetime('now') WHERE id = ?",
        )
          .bind(body.status, body.id)
          .run();

        return Response.json({ ok: true });
      },
    },
  },
});
