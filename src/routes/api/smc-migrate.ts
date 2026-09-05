import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * One-time database migration endpoint.
 * GET /api/smc-migrate — runs pending migrations, idempotent.
 * Returns { ok: true, applied: string[] }
 */
export const Route = createFileRoute("/api/smc-migrate")({
  server: {
    handlers: {
      GET: async () => {
        const env = getCFEnv();
        if (!env) return Response.json({ ok: false, error: "no env" });

        const applied: string[] = [];

        // Helper: add column if missing
        async function addColumnIfMissing(table: string, col: string, type: string) {
          try {
            const info = await env.DB.prepare(`PRAGMA table_info(${table})`).bind().all();
            const exists = info.results.some((r: any) => r.name === col);
            if (!exists) {
              await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).bind().run();
              applied.push(`${table}.${col}`);
            }
          } catch (e) {
            // Column may already exist — ignore
          }
        }

        // Migration 005: add chart_screenshots and analysis_steps to hermes_smc_reviews
        await addColumnIfMissing("hermes_smc_reviews", "chart_screenshots", "TEXT");
        await addColumnIfMissing("hermes_smc_reviews", "analysis_steps", "TEXT");
        await addColumnIfMissing("hermes_smc_reviews", "started_at", "TEXT");

        // Migration 006: create hermes_smc_screenshots table
        try {
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS hermes_smc_screenshots (
              id TEXT PRIMARY KEY,
              review_id TEXT NOT NULL,
              step INTEGER NOT NULL,
              label TEXT,
              data TEXT NOT NULL,
              created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            )
          `).bind().run();
          
          await env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_smc_screenshots_review ON hermes_smc_screenshots(review_id)
          `).bind().run();
          
          applied.push("hermes_smc_screenshots table");
        } catch (e) {
          // Already exists — fine
        }

        // Migration 007: create hermes_outcomes table (durable win-rate tracking)
        try {
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS hermes_outcomes (
              id TEXT PRIMARY KEY,
              review_id TEXT NOT NULL UNIQUE,
              pair TEXT NOT NULL,
              timeframe TEXT,
              direction TEXT CHECK(direction IN ('long', 'short')),
              entry REAL,
              stop_loss REAL,
              take_profit REAL,
              accuracy_grade TEXT,
              outcome TEXT NOT NULL CHECK(outcome IN ('WIN', 'LOSS', 'PENDING')),
              pips_moved REAL,
              sl_pips REAL,
              evaluated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
              created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            )
          `).bind().run();

          await env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_hermes_outcomes_outcome ON hermes_outcomes(outcome)
          `).bind().run();
          await env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_hermes_outcomes_pair ON hermes_outcomes(pair)
          `).bind().run();

          applied.push("hermes_outcomes table");
        } catch (e) {
          // Already exists — fine
        }

        return Response.json({ ok: true, applied, message: applied.length > 0 ? "Migrations applied" : "Already up to date" });
      },
    },
  },
});
