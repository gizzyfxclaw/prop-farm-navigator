import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * Hermes SMC Strategy Upgrade endpoint.
 * 
 * POST /api/hermes/smc-upgrade-config
 * Body: { current_config: SmcConfig }
 * 
 * Hermes analyzes the current market conditions and suggests improved parameters.
 * The user can review and apply these changes manually.
 */

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

export const Route = createFileRoute("/api/hermes/smc-upgrade-config")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        try {
          const body = await request.json() as { current_config?: typeof DEFAULT_CONFIG };
          const current = body.current_config || DEFAULT_CONFIG;

          // Call Hermes LLM to suggest improvements
          const suggested = await callHermesForUpgrade(current);

          return Response.json({ config: suggested, current });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});

async function callHermesForUpgrade(currentConfig: typeof DEFAULT_CONFIG): Promise<typeof DEFAULT_CONFIG> {
  const NOUS_API = "https://inference-api.nousresearch.com/v1/chat/completions";
  const MODEL = "meituan/longcat-2.0:free";

  const systemPrompt = `You are Hermes, the GizzyFx Trading Agent. Your job is to analyze the current SMC strategy configuration and suggest improvements based on how Smart Money Concepts work in volatile vs ranging markets.

Current SMC Strategy Configuration:
${JSON.stringify(currentConfig, null, 2)}

Parameters explained:
- atr_period: ATR lookback (14 = default). Higher = smoother, less sensitive.
- swing_window: Fractal pivot window (3 = default). Higher = fewer, more significant swings.
- ob_impulse_mult: OB impulse threshold in ATR multiples (1.5 = default). Higher = only strongest OB.
- ob_max_age: Max bars for OB lookback (60 = default). Higher = more historical OB.
- fvg_max_age: Max bars for FVG lookback (60 = default).
- sweep_max_age: Max bars for sweep lookback (30 = default).
- bos_min_bars: Min bars before BOS confirmation (0 = default).
- retest_min_touches: Min touches for valid channel (2 = default).
- sl_pips: Stop loss in pips (30 = default).
- tp1_rr: TP1 risk:reward (1.5 = default).
- tp2_rr: TP2 risk:reward (2.0 = default).
- confluence_weights: Scoring weights for each SMC factor.

Rules:
1. For volatile markets (like during news): increase atr_period, swing_window, ob_impulse_mult
2. For ranging markets: decrease swing_window, decrease ob_impulse_mult to catch more OB
3. For trending markets: increase retest_min_touches, increase sweep_max_age
4. Weights should sum to approximately 8-10 for balanced scoring
5. Only suggest changes that make sense — don't change everything

Return ONLY a JSON object with the suggested config. Use this exact format:
{"atr_period": N, "swing_window": N, "ob_impulse_mult": N, "ob_max_age": N, "fvg_max_age": N, "sweep_max_age": N, "bos_min_bars": N, "retest_min_touches": N, "sl_pips": N, "tp1_rr": N, "tp2_rr": N, "confluence_weights": {"ob_retest": N, "sweep": N, "choch": N, "bos": N, "bias": N, "fvg": N, "zone": N}}`;

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Analyze the current market conditions and suggest improved SMC strategy parameters. Consider that we trade EURUSD, USDJPY, and GBPUSD during London/NY overlap. Return ONLY the JSON config object." },
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
    const content = data.choices?.[0]?.content || data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Merge with defaults to ensure all fields present
      return { ...DEFAULT_CONFIG, ...parsed, confluence_weights: { ...DEFAULT_CONFIG.confluence_weights, ...(parsed.confluence_weights || {}) } };
    }
  } catch (err) {
    console.error("Hermes upgrade call failed:", err);
  }

  // Fallback: return current config unchanged
  return currentConfig;
}
