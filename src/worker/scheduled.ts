/// <reference types="@cloudflare/workers-types" />
import type { ScheduledEvent } from "@cloudflare/workers-types";

interface FinnhubEvent {
  eventName: string;
  country: string;
  currency: string;
  eventTime: string;
  impact: "low" | "medium" | "high";
  actual?: string;
  estimate?: string;
  previous?: string;
}

interface Env {
  DB: D1Database;
  FINNHUB_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", JP: "🇯🇵", DE: "🇩🇪",
  FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", CA: "🇨🇦", AU: "🇦🇺",
  NZ: "🇳🇿", CH: "🇨🇭", CN: "🇨🇳", BR: "🇧🇷", IN: "🇮🇳",
  RU: "🇷🇺", ZA: "🇿🇦", MX: "🇲🇽", TR: "🇹🇷", KR: "🇰🇷",
};

function getFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? "🌍";
}

function impactEmoji(impact: string): string {
  if (impact === "high") return "🔴";
  if (impact === "medium") return "🟡";
  return "🟢";
}

// Map currency codes to forex pairs
const CURRENCY_TO_PAIRS: Record<string, string[]> = {
  US: ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF"],
  EU: ["EURUSD", "EURJPY", "EURGBP", "EURAUD", "EURNZD", "EURCAD", "EURCHF"],
  GB: ["GBPUSD", "GBPJPY", "EURGBP", "GBPAUD", "GBPNZD", "GBPCAD", "GBPCHF"],
  JP: ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY"],
  AU: ["AUDUSD", "AUDJPY", "EURAUD", "GBPAUD", "AUDNZD", "AUDCAD", "AUDCHF"],
  NZ: ["NZDUSD", "NZDJPY", "EURNZD", "GBPNZD", "AUDNZD", "NZDCAD", "NZDCHF"],
  CA: ["USDCAD", "CADJPY", "EURCAD", "GBPCAD", "AUDCAD", "NZDCAD", "CADCHF"],
  CH: ["USDCHF", "EURCHF", "GBPCHF", "AUDCHF", "NZDCHF", "CADCHF", "CHFJPY"],
};

function getAffectedPairs(currency: string): string[] {
  return CURRENCY_TO_PAIRS[currency] ?? [];
}

// Create table if it doesn't exist
async function ensureTable(db: D1Database): Promise<boolean> {
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

export async function fetchFinnhubEvents(apiKey: string): Promise<FinnhubEvent[]> {
  const url = `https://finnhub.io/api/v1/calendar/economic?token=${apiKey}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Finnhub API ${res.status}`);
  const data = (await res.json()) as { economicCalendar?: FinnhubEvent[] };
  return data.economicCalendar ?? [];
}

export async function storeEvents(db: D1Database, events: FinnhubEvent[]): Promise<number> {
  let inserted = 0;
  for (const event of events) {
    if (!event.eventName || !event.eventTime) continue;
    
    const pairs = getAffectedPairs(event.currency);
    
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO economic_events 
        (event_name, country, currency, event_time, impact, actual, estimate, previous, source, pairs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'finnhub_poll', ?)
      `).bind(
        event.eventName,
        event.country ?? "",
        event.currency ?? "",
        event.eventTime,
        event.impact ?? "low",
        event.actual ?? null,
        event.estimate ?? null,
        event.previous ?? null,
        JSON.stringify(pairs),
      ).run();
      inserted++;
    } catch (err) {
      console.error("Failed to insert event:", err);
    }
  }
  return inserted;
}

export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  events: FinnhubEvent[],
): Promise<void> {
  if (!botToken || !chatId || events.length === 0) return;

  const lines = events.map((e) => {
    const time = new Date(e.eventTime).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    const pairs = getAffectedPairs(e.currency);
    return `${impactEmoji(e.impact)} ${getFlag(e.country)} ${e.eventName}\n   ${e.currency} · ${time} UTC · ${e.impact.toUpperCase()}\n   Pairs: ${pairs.join(", ")}`;
  });

  const message = `⚠️ *News Alert — ${events.length} upcoming event${events.length > 1 ? "s" : ""}\n\n${lines.join("\n\n")}\n\n🔴 Avoid pending orders ±30min\n🟡 Be cautious ±15min\n🟢 Low impact — safe to trade`;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
}

export async function scheduled(event: ScheduledEvent, env: Env, ctx: Promise<void>) {
  // Ensure table exists first
  const tableReady = await ensureTable(env.DB);
  if (!tableReady) {
    console.error("Failed to ensure economic_events table exists");
    return;
  }

  // Fetch and store events
  try {
    const events = await fetchFinnhubEvents(env.FINNHUB_API_KEY);
    const inserted = await storeEvents(env.DB, events);
    console.log(`Stored ${inserted}/${events.length} economic events`);
  } catch (err) {
    console.error("Failed to fetch/store events:", err);
  }

  // Check for upcoming high-impact events within 15 minutes
  try {
    const upcoming = await env.DB.prepare(`
      SELECT * FROM economic_events 
      WHERE event_time > datetime('now') 
      AND impact = 'high'
      AND event_time < datetime('now', '+15 minutes')
    `).all<FinnhubEvent>();

    if (upcoming.results && upcoming.results.length > 0) {
      await sendTelegramAlert(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, upcoming.results);
    }
  } catch (err) {
    console.error("Failed to send Telegram alerts:", err);
  }
}
