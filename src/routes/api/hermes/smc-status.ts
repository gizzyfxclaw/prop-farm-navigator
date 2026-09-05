import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * Live Hermes processor status — stored in D1 so the Worker can read it.
 * The processor (smc-processor.sh) writes to D1 via PATCH.
 * The UI polls GET every 10s.
 */
export const Route = createFileRoute("/api/hermes/smc-status")({
  server: {
    handlers: {
      GET: async () => {
        const env = getCFEnv();
        if (!env) return Response.json({ isProcessing: false, currentPair: "", lastRun: "", nextRun: "" });

        try {
          // Create table if it doesn't exist
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS hermes_processor_status (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            )
          `).bind().run().catch(() => {});

          const rows = await env.DB.prepare(
            "SELECT key, value, updated_at FROM hermes_processor_status"
          ).bind().all();

          const status: Record<string, string> = {};
          for (const row of rows.results as any[]) {
            status[row.key] = row.value;
          }

          return Response.json({
            isProcessing: status["is_processing"] === "true",
            currentPair:  status["current_pair"]  ?? "",
            lastRun:      status["last_run"]       ?? "",
            nextRun:      status["next_run_at"]    ?? "",
            lastVerdict:  status["last_verdict"]   ?? "",
            lastGrade:    status["last_grade"]      ?? "",
          });
        } catch {
          return Response.json({ isProcessing: false, currentPair: "", lastRun: "" });
        }
      },

      PATCH: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("unavailable", { status: 503 });

        const body = await request.json() as Record<string, string>;

        try {
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS hermes_processor_status (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            )
          `).bind().run().catch(() => {});

          for (const [key, value] of Object.entries(body)) {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO hermes_processor_status (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))"
            ).bind(key, String(value)).run();
          }

          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
