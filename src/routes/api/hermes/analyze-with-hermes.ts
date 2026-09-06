import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * "Analyze with Hermes" endpoint.
 * 
 * Flow:
 * 1. POST from browser: user submits SMC data + image + notes
 * 2. Stored in hermes_smc_reviews table
 * 3. Hermes polls GET, picks up the request
 * 4. Hermes analyzes using strategy knowledge + image + SMC data
 * 5. Hermes POSTs feedback back to the table
 * 6. Browser polls GET to display feedback
 * 7. User can chat with Hermes about the analysis (POST /api/hermes/smc-chat)
 */

const submitInput = z.object({
  pair: z.string(),
  smc_data: z.record(z.any()),
  user_notes: z.string().optional(),
  user_image: z.string().optional(), // base64 data URL
  timeframe: z.string().default("1h"),
});

const feedbackInput = z.object({
  request_id: z.string(),
  verdict: z.enum(["match", "diverge", "partial", "neutral"]),
  feedback: z.string(),
  strategy_notes: z.string().nullish(),
  entry: z.number().nullish(),
  stop_loss: z.number().nullish(),
  take_profit_1: z.number().nullish(),
  take_profit_2: z.number().nullish(),
  direction: z.enum(["long", "short"]).nullish(),
  accuracy_grade: z.enum(["HIGH", "STANDARD", "NONE"]).nullish(),
  chart_screenshots: z.array(z.string()).nullish(),
  analysis_steps: z.array(z.record(z.any())).nullish(),
});

const chatInput = z.object({
  review_id: z.string(),
  message: z.string().min(1).max(4000),
});

export const Route = createFileRoute("/api/hermes/analyze-with-hermes")({
  server: {
    handlers: {
      // Submit a new "Analyze with Hermes" request
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = submitInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          `INSERT INTO hermes_smc_reviews 
           (id, pair, timeframe, smc_data, user_notes, user_image, status, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, 'pending', strftime('%Y-%m-%dT%H:%M:%SZ','now'))`
        )
          .bind(
            id,
            body.pair,
            body.timeframe,
            JSON.stringify(body.smc_data),
            body.user_notes ?? null,
            body.user_image ?? null,
          )
          .run();

        return Response.json({ id, status: "pending" }, { status: 201 });
      },

      // Poll for pending requests (Hermes) or feedback (browser)
      GET: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return Response.json({ reviews: [] });

        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const id = url.searchParams.get("id");

        let query = "SELECT * FROM hermes_smc_reviews";
        const params: string[] = [];

        if (id) {
          query += " WHERE id = ?";
          params.push(id);
        } else if (status) {
          query += " WHERE status = ?";
          params.push(status);
        }

        query += " ORDER BY created_at DESC LIMIT 50";

        const { results } = await env.DB.prepare(query)
          .bind(...params)
          .all();

        return Response.json({ reviews: results });
      },

      // Delete one review (?id=xxx) or all (?all=true)
      DELETE: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const url = new URL(request.url);
        const id  = url.searchParams.get("id");
        const all = url.searchParams.get("all");

        if (all === "true") {
          await env.DB.prepare("DELETE FROM hermes_smc_reviews").bind().run();
          return Response.json({ ok: true, deleted: "all" });
        }

        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        await env.DB.prepare("DELETE FROM hermes_smc_reviews WHERE id = ?").bind(id).run();
        return Response.json({ ok: true, deleted: id });
      },

      // Hermes posts feedback
      PATCH: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = feedbackInput.parse(await request.json());

        await env.DB.prepare(
          `UPDATE hermes_smc_reviews SET 
             status = 'fulfilled',
             verdict = ?,
             feedback = ?,
             strategy_notes = ?,
             entry = ?,
             stop_loss = ?,
             take_profit_1 = ?,
             take_profit_2 = ?,
             direction = ?,
             accuracy_grade = ?,
             chart_screenshots = ?,
             analysis_steps = ?,
             fulfilled_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
           WHERE id = ?`
        )
          .bind(
            body.verdict,
            body.feedback,
            body.strategy_notes ?? null,
            body.entry ?? null,
            body.stop_loss ?? null,
            body.take_profit_1 ?? null,
            body.take_profit_2 ?? null,
            body.direction ?? null,
            body.accuracy_grade ?? null,
            body.chart_screenshots ? JSON.stringify(body.chart_screenshots) : null,
            body.analysis_steps ? JSON.stringify(body.analysis_steps) : null,
            body.request_id,
          )
          .run();

        return Response.json({ ok: true });
      },
    },
  },
});

/**
 * Chat with Hermes about a specific analysis review.
 * Each review has its own chat thread stored in the `chat_messages` column.
 * The Worker calls the Nous LLM directly with full review context.
 */
export const RouteChat = createFileRoute("/api/hermes/smc-chat")({
  server: {
    handlers: {
      // Send a message to Hermes and get a reply
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = chatInput.parse(await request.json());
        const { review_id, message } = body;

        // Fetch the review
        const { results } = await env.DB.prepare(
          "SELECT * FROM hermes_smc_reviews WHERE id = ?"
        ).bind(review_id).all();

        if (!results.length) {
          return Response.json({ error: "review not found" }, { status: 404 });
        }
        const review = results[0];

        // Parse existing chat messages
        let chatMessages: Array<{ role: string; content: string; timestamp?: string }> = [];
        try {
          chatMessages = JSON.parse(review.chat_messages as string || "[]");
        } catch {
          chatMessages = [];
        }

        // Add user message
        const userMsg = { role: "user", content: message, timestamp: new Date().toISOString() };
        chatMessages.push(userMsg);

        // Build system prompt with full review context
        const systemPrompt = buildSystemPrompt(review);

        // Call Nous LLM
        const assistantReply = await callHermesLLM(systemPrompt, chatMessages);

        // Add assistant reply
        const assistantMsg = { role: "assistant", content: assistantReply, timestamp: new Date().toISOString() };
        chatMessages.push(assistantMsg);

        // Store updated chat messages
        await env.DB.prepare(
          "UPDATE hermes_smc_reviews SET chat_messages = ? WHERE id = ?"
        ).bind(JSON.stringify(chatMessages), review_id).run();

        return Response.json({ reply: assistantReply, chat_messages: chatMessages });
      },

      // Get chat history for a review
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
          chatMessages = JSON.parse(results[0].chat_messages as string || "[]");
        } catch {
          chatMessages = [];
        }

        return Response.json({ chat_messages: chatMessages });
      },
    },
  },
});

function buildSystemPrompt(review: any): string {
  const pair = review.pair;
  const tf = review.timeframe;
  const feedback = review.feedback || "No analysis available yet.";
  const strategyNotes = review.strategy_notes || "";
  const verdict = review.verdict || "neutral";
  const grade = review.accuracy_grade || "NONE";
  const entry = review.entry ?? "N/A";
  const sl = review.stop_loss ?? "N/A";
  const tp1 = review.take_profit_1 ?? "N/A";
  const tp2 = review.take_profit_2 ?? "N/A";
  const direction = review.direction || "neutral";
  const userNotes = review.user_notes || "No user notes.";

  return `You are GizzyFx Co-Pilot, the GizzyFx Trading Agent. You have just completed an analysis for ${pair} ${tf}. Here is the analysis context:

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

  // Read API key from Cloudflare env (set via wrangler secret put NOUS_API_KEY)
  const env = getCFEnv();
  const apiKey = env?.NOUS_API_KEY || "";

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
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.content || data.choices?.[0]?.message?.content || "I apologize, I'm having trouble processing your request right now.";
  } catch (err) {
    console.error("LLM call failed:", err);
    return "I apologize, the analysis service is temporarily unavailable. Please try again shortly.";
  }
}
