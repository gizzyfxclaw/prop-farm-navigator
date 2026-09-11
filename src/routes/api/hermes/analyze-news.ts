import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

export const Route = createFileRoute("/api/hermes/analyze-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const env = getCFEnv();
          if (!env) {
            return Response.json({
              analysis: "Service temporarily unavailable.",
              direction: "UNKNOWN",
              confidence: 0,
              affected_pairs: [],
            }, { status: 200 });
          }

          const body = await request.json() as {
            event_id?: string;
            event_name?: string;
            currency?: string;
            impact?: string;
            forecast?: string;
            previous?: string;
          };

          const eventName = body.event_name || "Unknown Event";
          const currency = body.currency || "USD";
          const impact = body.impact || "medium";
          const forecast = body.forecast || "—";
          const previous = body.previous || "—";

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

          const affectedPairs = pairsMap[currency] || ["EURUSD", "USDJPY", "GBPUSD"];

          const apiKey = env?.NOUS_API_KEY || "";
          if (!apiKey) {
            return Response.json({
              analysis: `High-impact ${currency} event: ${eventName}. Historically causes 50-100 pip spikes in ${affectedPairs.join(", ")}. Avoid trading 30min before/after release.`,
              direction: "UNKNOWN",
              confidence: 50,
              affected_pairs: affectedPairs,
            });
          }

          const systemPrompt = `You are Hermes, an expert forex trading AI. Analyze this economic event and predict real-time market impact.

Event: ${eventName}
Currency: ${currency}
Impact: ${impact}
Forecast: ${forecast}
Previous: ${previous}
Affected Pairs: ${affectedPairs.join(", ")}

Provide your analysis as a JSON object with these exact fields:
{"analysis": "3-5 sentences explaining what will happen in real-time and market direction", "direction": "BUY or SELL or NEUTRAL", "confidence": 75}

Return ONLY the JSON object.`;

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);

            const response = await fetch("https://inference-api.nousresearch.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: "meituan/longcat-2.0:free",
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: "Analyze this news event." },
                ],
                max_tokens: 300,
                temperature: 0.7,
              }),
              signal: controller.signal,
            });

            clearTimeout(timeout);

            if (response.ok) {
              const data = await response.json() as any;
              const content = data.choices?.[0]?.message?.content || "";
              
              try {
                const parsed = JSON.parse(content);
                return Response.json({
                  analysis: parsed.analysis,
                  direction: parsed.direction,
                  confidence: parsed.confidence,
                  affected_pairs: affectedPairs,
                });
              } catch {
                const dir = content.includes("BUY") ? "BUY" : content.includes("SELL") ? "SELL" : "NEUTRAL";
                return Response.json({
                  analysis: content.slice(0, 400),
                  direction: dir,
                  confidence: 60,
                  affected_pairs: affectedPairs,
                });
              }
            }
          } catch (llmErr) {
            console.error("LLM error:", llmErr);
          }

          return Response.json({
            analysis: `High-impact ${currency} event: ${eventName}. Typically causes spread widening and 30-80 pip spikes in ${affectedPairs.join(", ")}. Exercise caution.`,
            direction: "UNKNOWN",
            confidence: 50,
            affected_pairs: affectedPairs,
          });
        } catch (err: any) {
          return Response.json({
            analysis: `Analysis unavailable. High-impact news typically causes volatility.`,
            direction: "UNKNOWN",
            confidence: 0,
            affected_pairs: [],
          });
        }
      },
    },
  },
});
