import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Read-only journal feed for Hermes. Trades are only ever written by the
 * webapp itself (the human confirming a fill) — Hermes never writes here.
 */
export const Route = createFileRoute("/api/hermes/journal")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ trades: [] });

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

        const { results } = await env.DB.prepare(
          "SELECT * FROM journal_trades ORDER BY created_at DESC LIMIT ?",
        )
          .bind(limit)
          .all();

        return Response.json({ trades: results });
      },
    },
  },
});
