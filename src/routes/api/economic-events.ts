import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

interface EconomicEvent {
  id: number;
  event_name: string;
  country: string;
  currency: string;
  event_time: string;
  impact: "low" | "medium" | "high";
  actual: string | null;
  estimate: string | null;
  previous: string | null;
  pairs: string | null;
}

async function ensureTable(db: any): Promise<boolean> {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS economic_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        country TEXT,
        currency TEXT,
        event_time TEXT,
        impact TEXT CHECK(impact IN ('low', 'medium', 'high')),
        actual TEXT,
        estimate TEXT,
        previous TEXT,
        pairs TEXT,
        source TEXT DEFAULT 'finnhub',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(event_name, event_time, country)
      )
    `).run();
    return true;
  } catch (err) {
    console.error("Failed to create table:", err);
    return false;
  }
}

export const Route = createFileRoute("/api/economic-events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const impact = url.searchParams.get("impact") ?? "all";
        const hours = parseInt(url.searchParams.get("hours") ?? "168");
        const pair = url.searchParams.get("pair") ?? "all";

        const env = getCFEnv();
        const db = env?.DB;
        if (!db) {
          return Response.json({ error: "DB not configured", events: [] }, { status: 500 });
        }

        // Ensure table exists
        const tableReady = await ensureTable(db);
        if (!tableReady) {
          return Response.json({ error: "Table not ready", events: [] }, { status: 500 });
        }

        let sql = `SELECT * FROM economic_events WHERE event_time > datetime('now')`;
        const params: string[] = [];

        if (impact !== "all") {
          sql += ` AND impact = ?`;
          params.push(impact);
        }

        if (pair !== "all") {
          sql += ` AND (pairs LIKE ? OR currency = ?)`;
          params.push(`%${pair}%`);
          params.push(pair.substring(0, 3));
        }

        sql += ` AND event_time < datetime('now', '+${hours} hours')`;
        sql += ` ORDER BY event_time ASC`;

        try {
          const result = await db.prepare(sql).bind(...params).all<EconomicEvent>();
          return Response.json({
            events: result.results ?? [],
            count: result.results?.length ?? 0,
          });
        } catch (err) {
          return Response.json({ error: "DB query failed", events: [] }, { status: 500 });
        }
      },
    },
  },
});
