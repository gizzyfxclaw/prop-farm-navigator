import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { fetchBarsWithRetry } from "@/lib/tvremix";

const pineScriptInput = z.object({
  pine_script: z.string().min(10),
  pair: z.string().default("EURUSD"),
  interval: z.string().default("1h"),
});

export const Route = createFileRoute("/api/hermes/pine-script-analysis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = pineScriptInput.parse(await request.json());

        const nousKey = env?.NOUS_API_KEY;
        if (!nousKey) {
          return Response.json({ error: "NOUS_API_KEY not configured" }, { status: 503 });
        }

        const tvremixKey = env?.TVREMIX_API_KEY;
        if (!tvremixKey) {
          return Response.json({ error: "TVREMIX_API_KEY not configured" }, { status: 503 });
        }

        // Fetch current market data
        const bars = await fetchBarsWithRetry(tvremixKey, body.pair, body.interval, 200);
        if (!bars || bars.length === 0) {
          return Response.json({ error: "No market data available" }, { status: 502 });
        }

        const lastBar = bars[bars.length - 1]!;
        const recentBars = bars.slice(-20);

        const prompt = `You are GizzyFx Co-Pilot, a professional trading analyst and Pine Script expert. A user has pasted their Pine Script strategy code. Your job is:

1. EXPLAIN the strategy in plain English (what it does, what signals it generates)
2. IDENTIFY entry conditions (exact rules for long/short entries)
3. IDENTIFY stop loss logic (how SL is calculated)
4. IDENTIFY take profit logic (how TP is calculated)
5. READ the current market data and determine: is there a LONG, SHORT, or NEUTRAL signal right now?
6. ASSESS confidence (0-100%) based on how well the current setup matches the strategy's ideal conditions
7. EXPLAIN the rationale for the current signal
8. IDENTIFY what would invalidate this setup (risk)

Strategy Pine Script:
\`\`\`pine
${body.pine_script}
\`\`\`

Current Market Data (${body.pair} ${body.interval}):
Last price: ${lastBar.close.toFixed(5)}
Last 20 bars:
${recentBars.map((b, i) => `Bar ${i + 1}: O:${b.open.toFixed(5)} H:${b.high.toFixed(5)} L:${b.low.toFixed(5)} C:${b.close.toFixed(5)}`).join("\n")}

Respond in JSON format only:
{"summary":"Brief strategy description","entry_conditions":["condition 1","condition 2"],"stop_loss":"SL logic or price level","take_profit":["TP1 logic","TP2 logic"],"direction":"LONG|SHORT|NEUTRAL","confidence":75,"rationale":"Why this signal exists now","risk":"What invalidates this setup"}`;

        try {
          const llmRes = await fetch("https://api.nousresearch.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${nousKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "meituan/longcat-2.0:free",
              messages: [
                { role: "system", content: "You are GizzyFx Co-Pilot, a Pine Script expert and trading analyst. You provide structured, honest analysis. Always respond in valid JSON format." },
                { role: "user", content: prompt },
              ],
              temperature: 0.3,
              max_tokens: 800,
            }),
          });

          if (!llmRes.ok) {
            throw new Error(`LLM error: ${llmRes.status}`);
          }

          const llmData = await llmRes.json();
          const content = llmData.choices?.[0]?.message?.content || "";

          let analysis: any;
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
            } else {
              analysis = { raw_analysis: content };
            }
          } catch {
            analysis = { raw_analysis: content };
          }

          return Response.json(analysis);
        } catch (e) {
          return Response.json({ error: `Analysis failed: ${String(e)}` }, { status: 500 });
        }
      },
    },
  },
});
