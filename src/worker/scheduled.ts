/// <reference types="@cloudflare/workers-types" />
import type { ScheduledEvent } from "@cloudflare/workers-types";

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

const HIGH_IMPACT_KEYWORDS = [
  "non-farm", "nfp", "payroll", "employment", "unemployment", "jobs report",
  "interest rate", "rate decision", "rate hike", "rate cut", "fed", "fomc",
  "ecb", "boe", "boj", "rba", "rbnz", "boc", "snb",
  "gdp", "gross domestic product",
  "cpi", "inflation", "consumer price", "producer price", "ppi",
  "retail sales", "industrial production", "manufacturing pmi", "services pmi",
  "trade balance", "current account",
  "consumer confidence", "business confidence", "zing", "ism",
  "housing starts", "building permits", "existing home sales", "new home sales",
  "durable goods", "factory orders",
  "central bank", "monetary policy", "quantitative easing", "qe",
];

function detectImpact(headline: string): "low" | "medium" | "high" {
  const lower = headline.toLowerCase();
  for (const keyword of HIGH_IMPACT_KEYWORDS) {
    if (lower.includes(keyword)) return "high";
  }
  return "medium";
}

function detectCurrency(headline: string): string {
  const lower = headline.toLowerCase();
  if (lower.includes("euro") || lower.includes("eur") || lower.includes("ecb")) return "EU";
  if (lower.includes("pound") || lower.includes("sterling") || lower.includes("gbp") || lower.includes("boe")) return "GB";
  if (lower.includes("yen") || lower.includes("jpy") || lower.includes("boj")) return "JP";
  if (lower.includes("aussie") || lower.includes("aud") || lower.includes("rba")) return "AU";
  if (lower.includes("kiwi") || lower.includes("nzd") || lower.includes("rbnz")) return "NZ";
  if (lower.includes("loonie") || lower.includes("cad") || lower.includes("boc")) return "CA";
  if (lower.includes("franc") || lower.includes("chf") || lower.includes("snb")) return "CH";
  return "US";
}

// Check if news is relevant to our traded pairs
const FOREX_KEYWORDS = [
  "forex", "fx", "currency", "currencies", "exchange rate",
  "dollar", "euro", "pound", "sterling", "yen", "franc",
  "fed", "federal reserve", "ecb", "boe", "boj", "rba", "rbnz", "boc", "snb",
  "interest rate", "rate decision", "rate hike", "rate cut",
  "gdp", "inflation", "cpi", "ppi", "payroll", "employment",
  "retail sales", "trade balance", "pmi", "consumer confidence",
  "oil", "crude", "gold", "commodities",
  "war", "geopolitical", "sanctions", "tariff",
];

function isForexRelevant(headline: string): boolean {
  const lower = headline.toLowerCase();
  return FOREX_KEYWORDS.some(k => lower.includes(k));
}

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

// Fetch news from Finnhub (free tier)
async function fetchNews(apiKey: string): Promise<any[]> {
  const [forexNews, generalNews] = await Promise.all([
    fetch(`https://finnhub.io/api/v1/news?category=forex&token=${apiKey}`).then(r => r.ok ? r.json() : []),
    fetch(`https://finnhub.io/api/v1/news?category=general&token=${apiKey}`).then(r => r.ok ? r.json() : []),
  ]);
  
  return [...(forexNews || []), ...(generalNews || [])];
}

export async function storeEvents(db: D1Database, events: any[]): Promise<number> {
  let inserted = 0;
  for (const event of events) {
    const headline = event.headline || event.eventName || "";
    if (!headline) continue;
    
    // Only store forex-relevant news
    if (!isForexRelevant(headline)) continue;
    
    const currency = detectCurrency(headline);
    const pairs = getAffectedPairs(currency);
    const impact = detectImpact(headline);
    const eventTime = new Date((event.datetime || Date.now() / 1000) * 1000).toISOString().slice(0, 19).replace("T", " ");
    
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO economic_events 
        (event_name, country, currency, event_time, impact, actual, estimate, previous, source, pairs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'finnhub', ?)
      `).bind(
        headline,
        currency,
        currency,
        eventTime,
        impact,
        event.actual?.toString() ?? null,
        event.estimate?.toString() ?? null,
        event.previous?.toString() ?? null,
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
  events: any[],
): Promise<void> {
  if (!botToken || !chatId || events.length === 0) return;

  const lines = events.map((e) => {
    const headline = e.headline || e.eventName || "Unknown";
    const currency = detectCurrency(headline);
    const impact = detectImpact(headline);
    const pairs = getAffectedPairs(currency);
    const time = e.event_time ? new Date(e.event_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : "Now";
    return `${impactEmoji(impact)} ${getFlag(currency)} ${headline}\n   ${currency} · ${time} UTC · ${impact.toUpperCase()}\n   Pairs: ${pairs.join(", ")}`;
  });

  const message = `⚠️ *Forex News Alert — ${events.length} event${events.length > 1 ? "s" : ""}\n\n${lines.join("\n\n")}\n\n🔴 High impact — avoid pending orders\n🟡 Medium — be cautious\n🟢 Low — safe to trade`;

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
  const tableReady = await ensureTable(env.DB);
  if (!tableReady) {
    console.error("Failed to ensure economic_events table exists");
    return;
  }

  // Fetch news from Finnhub
  try {
    const news = await fetchNews(env.FINNHUB_API_KEY);
    const inserted = await storeEvents(env.DB, news);
    console.log(`Stored ${inserted}/${news.length} forex-relevant news events`);
  } catch (err) {
    console.error("Failed to fetch/store events:", err);
  }

  // Check for high-impact events and send Telegram alerts
  try {
    const highImpact = await env.DB.prepare(`
      SELECT * FROM economic_events 
      WHERE event_time > datetime('now', '-1 hour')
      AND impact = 'high'
      ORDER BY event_time DESC
      LIMIT 5
    `).all();

    if (highImpact.results && highImpact.results.length > 0) {
      await sendTelegramAlert(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, highImpact.results);
    }
  } catch (err) {
    console.error("Failed to send Telegram alerts:", err);
  }
}
