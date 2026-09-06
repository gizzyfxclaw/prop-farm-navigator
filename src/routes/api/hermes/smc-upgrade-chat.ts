import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

const DEFAULT_CONFIG = {
  atr_period: 14,
  swing_window: 3,
  ob_impulse_mult: 1.5,
  ob_max_age: 60,
  fvg_max_age: 60,
  sweep_max_age: 30,
  bos_min_bars: 0,
  retest_min_touches: 2,
  sl_pips: 30,
  tp1_rr: 1.5,
  tp2_rr: 2.0,
  confluence_weights: {
    ob_retest: 2.0,
    sweep: 2.0,
    choch: 1.5,
    bos: 1.0,
    bias: 1.0,
    fvg: 0.5,
    zone: 0.5,
  },
};

export const Route = createFileRoute("/api/hermes/smc-upgrade-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        try {
          const body = await request.json() as {
            current_config: typeof DEFAULT_CONFIG;
            suggested_config?: typeof DEFAULT_CONFIG | null;
            message: string;
            chat_history?: Array<{ role: string; content: string }>;
          };

          const { current_config, suggested_config, message, chat_history } = body;
          const result = await callHermesForUpgradeChat(
            current_config,
            suggested_config || null,
            message,
            chat_history || []
          );

          return Response.json({
            reply: result.reply,
            suggested_config: result.suggested_config,
            phase: result.phase,
          });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});

interface UpgradeChatResult {
  reply: string;
  suggested_config: typeof DEFAULT_CONFIG;
  phase: "initial" | "discussing" | "reviewing";
}

async function callHermesForUpgradeChat(
  currentConfig: typeof DEFAULT_CONFIG,
  suggestedConfig: typeof DEFAULT_CONFIG | null,
  message: string,
  chatHistory: Array<{ role: string; content: string }>
): Promise<UpgradeChatResult> {
  const NOUS_API = "https://inference-api.nousresearch.com/v1/chat/completions";
  const MODEL = "meituan/longcat-2.0:free";

  const isStart = message === "start";
  const msg = message.trim().toLowerCase();
  const isApply = msg === "apply" || 
    (message !== "start" && suggestedConfig && (
      msg.includes("apply") || msg.includes("yes") || msg.includes("approve") || 
      msg.includes("accept") || msg.includes("go ahead") || msg.includes("do it")
    ));

  const systemPrompt = `You are Hermes, the GizzyFx Trading Agent. You are having a conversation with the user about upgrading the SMC (Smart Money Concepts) strategy configuration. Your goal is to help them understand what changes you suggest and why, discuss the trade-offs, and only apply changes when they agree.

## Current Configuration
${JSON.stringify(currentConfig, null, 2)}

${suggestedConfig ? `## Currently Suggested Configuration
${JSON.stringify(suggestedConfig, null, 2)}

## Differences from Current
${JSON.stringify(computeDiff(currentConfig, suggestedConfig), null, 2)}` : ""}

## Your Role
- Explain your suggestions clearly and concisely
- Discuss trade-offs of each change
- Answer questions about why you recommend specific values
- Only apply when the user explicitly agrees (says "yes", "apply", "go ahead", etc.)
- Keep responses under 150 words
- Use plain text (no markdown)

## Rules for "apply" responses
When the user agrees to apply, confirm you will apply the changes and summarize what was changed.

Return your response in this EXACT JSON format:
{"reply": "your text response", "suggested_config": {...full config object...}, "phase": "initial"|"discussing"|"reviewing"}

The suggested_config must be a COMPLETE config object with ALL fields, not just the changed ones. Use the same structure as the current config.`;

  const userMessage = isStart 
    ? "I want to upgrade the SMC strategy. Please analyze the current market conditions (EURUSD, USDJPY, GBPUSD during London/NY overlap) and suggest improvements to the configuration. Explain why you suggest each change."
    : message;

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...chatHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ],
    max_tokens: 600,
    temperature: 0.7,
  };

  try {
    // Read API key from Cloudflare env (set via wrangler secret put NOUS_API_KEY)
    const env = getCFEnv();
    const apiKey = env?.NOUS_API_KEY || "";

    const response = await fetch(NOUS_API, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);

    const data = await response.json() as any;
    const content = data.choices?.[0]?.content || data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          reply: parsed.reply || content,
          suggested_config: parsed.suggested_config 
            ? { ...DEFAULT_CONFIG, ...parsed.suggested_config, confluence_weights: { ...DEFAULT_CONFIG.confluence_weights, ...(parsed.suggested_config.confluence_weights || {}) } }
            : (suggestedConfig || currentConfig),
          phase: parsed.phase || (isApply ? "reviewing" : "discussing"),
        };
      } catch {
        // JSON parse failed, fall through
      }
    }

    return {
      reply: content,
      suggested_config: suggestedConfig || currentConfig,
      phase: isApply ? "reviewing" : "discussing",
    };
  } catch (err) {
    console.error("Hermes upgrade chat call failed:", err);
    return {
      reply: "I apologize, I'm having trouble connecting to the AI service. Please try again in a moment.",
      suggested_config: suggestedConfig || currentConfig,
      phase: "discussing",
    };
  }
}

function computeDiff(current: typeof DEFAULT_CONFIG, suggested: typeof DEFAULT_CONFIG): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(current) as Array<keyof typeof DEFAULT_CONFIG>) {
    if (key === "confluence_weights") {
      const cw = current[key];
      const sw = suggested[key];
      for (const wkey of Object.keys(cw)) {
        if (cw[wkey as keyof typeof cw] !== sw[wkey as keyof typeof sw]) {
          diff[`confluence_weights.${wkey}`] = { from: cw[wkey as keyof typeof cw], to: sw[wkey as keyof typeof sw] };
        }
      }
    } else {
      if (current[key] !== suggested[key]) {
        diff[key] = { from: current[key], to: suggested[key] };
      }
    }
  }
  return diff;
}
