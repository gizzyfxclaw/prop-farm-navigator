import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * Migration endpoint — adds chat_messages column to hermes_smc_reviews table.
 * Call once after deploy: curl https://gizzyfxstrategy.dpdns.org/api/smc-migrate-chat
 * Idempotent — safe to call multiple times.
 */
export const Route = createFileRoute("/api/smc-migrate-chat")({
  server: {
    handlers: {
      GET: async () => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const applied: string[] = [];

        // Add chat_messages column if missing
        const info = await env.DB.prepare(
          "PRAGMA table_info(hermes_smc_reviews)"
        ).bind().all();

        const hasCol = info.results.some((r: any) => r.name === "chat_messages");
        if (!hasCol) {
          await env.DB.prepare(
            "ALTER TABLE hermes_smc_reviews ADD COLUMN chat_messages TEXT"
          ).bind().run();
          applied.push("hermes_smc_reviews.chat_messages");
        }

        return Response.json({ ok: true, applied });
      },
    },
  },
});
