import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

interface NewsItem {
  headline: string;
  source: string;
  datetime: number;
  url: string;
  impact: "low" | "medium" | "high";
  currency: string;
  pairs: string[];
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

// More inclusive forex relevance check
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

function getFlag(country: string): string {
  const flags: Record<string, string> = {
    US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", JP: "🇯🇵", DE: "🇩🇪",
    FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", CA: "🇨🇦", AU: "🇦🇺",
    NZ: "🇳🇿", CH: "🇨🇭", CN: "🇨🇳", BR: "🇧🇷", IN: "🇮🇳",
    RU: "🇷🇺", ZA: "🇿🇦", MX: "🇲🇽", TR: "🇹🇷", KR: "🇰🇷",
  };
  return flags[country] ?? "🌍";
}

export const Route = createFileRoute("/api/economic-events")({
  server: {
    handlers: {
      async GET() {
        const env = getCFEnv();
        const apiKey = env?.FINNHUB_API_KEY;
        if (!apiKey) {
          return Response.json({ events: [], error: "No API key" });
        }

        try {
          const [forexNews, generalNews] = await Promise.all([
            fetch(`https://finnhub.io/api/v1/news?category=forex&token=${apiKey}`).then(r => r.ok ? r.json() : []),
            fetch(`https://finnhub.io/api/v1/news?category=general&token=${apiKey}`).then(r => r.ok ? r.json() : []),
          ]);

          const allNews = [...(forexNews || []), ...(generalNews || [])];
          
          const events: NewsItem[] = allNews
            .filter((item: any) => item.headline && isForexRelevant(item.headline))
            .map((item: any) => {
              const headline = item.headline;
              const currency = detectCurrency(headline);
              return {
                headline,
                source: item.source || "Unknown",
                datetime: item.datetime,
                url: item.url || "",
                impact: detectImpact(headline),
                currency,
                pairs: getAffectedPairs(currency),
              };
            })
            .sort((a, b) => b.datetime - a.datetime);

          return Response.json({ events, count: events.length });
        } catch (err) {
          return Response.json({ events: [], error: "Fetch failed" });
        }
      },
    },
  },
});
