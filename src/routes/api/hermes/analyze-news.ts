import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

const NOUS_API = "https://inference-api.nousresearch.com/v1/chat/completions";
const MODEL = "meituan/longcat-2.0:free";

export const Route = createFileRoute("/api/hermes/analyze-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = await request.json() as {
          event_id: string;
          event_name: string;
          currency: string;
          impact: string;
          forecast: string;
          previous: string;
        };

        const cacheCheck = await env.DB.prepare(
          "SELECT * FROM hermes_news_analysis WHERE event_id = ?"
        ).bind(body.event_id).first();

        if (cacheCheck) {
          return Response.json({
            analysis: cacheCheck.analysis,
            direction: cacheCheck.direction,
            confidence: cacheCheck.confidence,
            affected_pairs: JSON.parse(cacheCheck.affected_pairs as string),
            cached: true,
          });
        }

        const apiKey = env?.NOUS_API_KEY || "";
        if (!apiKey) {
          return Response.json({
            analysis: "AI service not configured. Please contact support.",
            direction: "unknown",
            confidence: 0,
            affected_pairs: [],
          });
        }

        const pairsMap: Record<string, string[]> = {
          USD: ["EURUSD", "USDJPY", "GBPUSD"],
          EUR: ["EURUSD"],
          GBP: ["GBPUSD"],
          JPY: ["USDJPY"],
          CAD: ["USDCAD"],
          AUD: ["AUDUSD"],
          NZD: ["NZDUSD"],
          CHF: ["USDCHF"],
        };

        const affectedPairs = pairsMap[body.currency] || ["EURUSD", "USDJPY", "GBPUSD"];

        const systemPrompt = `You are Hermes, an expert forex trading AI analyst. Your job is to analyze economic news events and predict their real-time impact on currency pairs.

## Event to Analyze
**Event:** ${body.event_name}
**Currency:** ${body.currency}
**Impact Level:** ${body.impact}
**Forecast:** ${body.forecast}
**Previous:** ${body.previous}
**Affected Pairs:** ${affectedPairs.join(", ")}

## Your Task
Provide a concise analysis (3-5 sentences max) covering:
1. What this news event is and why it matters
2. What will happen in real-time when this news prints (market reaction)
3. Expected direction (BUY or SELL) for ${affectedPairs[0]} with a confidence percentage
4. How the market will likely move (spike, drift, reverse)

Format your response as a JSON object with these fields:
{
  "analysis": "your concise analysis here",
  "direction": "BUY" or "SELL" or "NEUTRAL",
  "confidence": 75,
  "affected_pairs": ["${affectedPairs.join('","')}"]
}

Return ONLY the JSON object, no other text.`;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(NOUS_API, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: MODEL,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Analyze this news event and predict market impact.` },
              ],
              max_tokens: 400,
              temperature: 0.7,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) {
            throw new Error(`LLM API error: ${response.status}`);
          }

          const data = await response.json() as any;
          const content = data.choices?.[0]?.message?.content || "";

          let result;
          try {
            result = JSON.parse(content);
          } catch {
            const direction = content.includes("BUY") ? "BUY" : content.includes("SELL") ? "SELL" : "NEUTRAL";
            const confMatch = content.match(/(\d+)%/);
            result = {
              analysis: content.slice(0, 500),
              direction,
              confidence: confMatch ? parseInt(confMatch[1]) : 60,
              affected_pairs: affectedPairs,
            };
          }

          await env.DB.prepare(
            `INSERT OR REPLACE INTO hermes_news_analysis 
             (id, event_id, event_name, currency, impact, analysis, direction, confidence, affected_pairs, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`
          ).bind(
            crypto.randomUUID(),
            body.event_id,
            body.event_name,
            body.currency,
            body.impact,
            result.analysis,
            result.direction,
            result.confidence,
            JSON.stringify(result.affected_pairs),
          ).run();

          return Response.json(result);
        } catch {
          return Response.json({
            analysis: "Analysis temporarily unavailable. High-impact news typically causes spread widening and slippage.",
            direction: "UNKNOWN",
            confidence: 50,
            affected_pairs: affectedPairs,
          });
        }
      },
    },
  },
});
