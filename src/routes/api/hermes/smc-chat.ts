import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";

const chatInput = z.object({
  review_id: z.string(),
  message: z.string().min(1).max(4000),
});

export const Route = createFileRoute("/api/hermes/smc-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = chatInput.parse(await request.json());
        const { review_id, message } = body;

        const { results } = await env.DB.prepare(
          "SELECT * FROM hermes_smc_reviews WHERE id = ?"
        ).bind(review_id).all();

        if (!results.length) {
          return Response.json({ error: "review not found" }, { status: 404 });
        }
        const review = results[0] as Record<string, unknown>;

        let chatMessages: Array<{ role: string; content: string; timestamp?: string }> = [];
        try {
          chatMessages = JSON.parse(review["chat_messages"] as string || "[]");
        } catch {
          chatMessages = [];
        }

        const userMsg = { role: "user", content: message, timestamp: new Date().toISOString() };
        chatMessages.push(userMsg);

        const systemPrompt = buildSystemPrompt(review);
        const assistantReply = await callHermesLLM(systemPrompt, chatMessages);

        const assistantMsg = { role: "assistant", content: assistantReply, timestamp: new Date().toISOString() };
        chatMessages.push(assistantMsg);

        await env.DB.prepare(
          "UPDATE hermes_smc_reviews SET chat_messages = ? WHERE id = ?"
        ).bind(JSON.stringify(chatMessages), review_id).run();

        return Response.json({ reply: assistantReply, chat_messages: chatMessages });
      },

      GET: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return Response.json({ chat_messages: [] });

        const url = new URL(request.url);
        const reviewId = url.searchParams.get("review_id");
        if (!reviewId) return Response.json({ error: "review_id required" }, { status: 400 });

        const { results } = await env.DB.prepare(
          "SELECT chat_messages FROM hermes_smc_reviews WHERE id = ?"
        ).bind(reviewId).all();

        if (!results.length) return Response.json({ chat_messages: [] });

        let chatMessages: Array<{ role: string; content: string; timestamp?: string }> = [];
        try {
          chatMessages = JSON.parse((results[0] as Record<string, unknown>)["chat_messages"] as string || "[]");
        } catch {
          chatMessages = [];
        }

        return Response.json({ chat_messages: chatMessages });
      },
    },
  },
});

function buildSystemPrompt(review: Record<string, unknown>): string {
  const pair = review["pair"] as string;
  const tf = review["timeframe"] as string;
  const feedback = (review["feedback"] as string) || "No analysis available yet.";
  const strategyNotes = (review["strategy_notes"] as string) || "";
  const verdict = (review["verdict"] as string) || "neutral";
  const grade = (review["accuracy_grade"] as string) || "NONE";
  const entry = review["entry"] ?? "N/A";
  const sl = review["stop_loss"] ?? "N/A";
  const tp1 = review["take_profit_1"] ?? "N/A";
  const tp2 = review["take_profit_2"] ?? "N/A";
  const direction = (review["direction"] as string) || "neutral";
  const userNotes = (review["user_notes"] as string) || "No user notes.";

  return `You are Hermes, the GizzyFx Trading Agent. You have just completed an analysis for ${pair} ${tf}. Here is the analysis context:

## Your Analysis
**Verdict:** ${verdict}
**Grade:** ${grade}
**Direction:** ${direction}
**Entry:** ${entry}
**Stop Loss:** ${sl}
**Take Profit 1:** ${tp1}
**Take Profit 2:** ${tp2}

**Feedback:** ${feedback}

**Strategy Notes:** ${strategyNotes}

## User's Original Notes
${userNotes}

## Your Role
The user will ask follow-up questions about this specific analysis. Respond concisely and precisely. Reference the analysis levels (entry, SL, TP) when relevant. If the user questions your reasoning, explain or defend it using the GizzyFx Parallel Channel Breakout Strategy rules. Keep responses under 200 words. Use plain text (no markdown).`;
}

async function callHermesLLM(systemPrompt: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  const NOUS_API = "https://inference-api.nousresearch.com/v1/chat/completions";
  const MODEL = "meituan/longcat-2.0:free";

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
    ],
    max_tokens: 500,
    temperature: 0.7,
  };

  try {
    const response = await fetch(NOUS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);

    const data = await response.json() as any;
    return data.choices?.[0]?.content || data.choices?.[0]?.message?.content || "I apologize, I'm having trouble processing your request right now.";
  } catch (err) {
    console.error("LLM call failed:", err);
    return "I apologize, the analysis service is temporarily unavailable. Please try again shortly.";
  }
}
