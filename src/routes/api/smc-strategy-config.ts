import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";

/**
 * SMC Strategy Configuration endpoint.
 * 
 * The SMC engine has tunable parameters (ATR period, swing window, OB thresholds, etc.)
 * that control how it detects structure, order blocks, FVGs, and sweeps.
 * 
 * GET returns the current config (or defaults if none stored).
 * PATCH updates the config — used by both manual edits and Hermes upgrades.
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

const PARAM_META: Record<string, { label: string; min: number; max: number; step: number; description: string }> = {
  atr_period: { label: "ATR Period", min: 5, max: 50, step: 1, description: "ATR lookback period. Higher = smoother, less sensitive to recent volatility." },
  swing_window: { label: "Swing Window", min: 2, max: 10, step: 1, description: "Fractal pivot detection window. Higher = fewer but more significant swing points." },
  ob_impulse_mult: { label: "OB Impulse Multiplier", min: 0.5, max: 4.0, step: 0.1, description: "Order block impulse threshold in ATR multiples. Higher = only the strongest order blocks." },
  ob_max_age: { label: "OB Max Age", min: 20, max: 200, step: 5, description: "Maximum bars to look back for order blocks. Higher = more historical levels." },
  fvg_max_age: { label: "FVG Max Age", min: 20, max: 200, step: 5, description: "Maximum bars to look back for fair value gaps." },
  sweep_max_age: { label: "Sweep Max Age", min: 10, max: 100, step: 5, description: "Maximum bars to look back for liquidity sweeps." },
  bos_min_bars: { label: "BOS Min Bars", min: 0, max: 10, step: 1, description: "Minimum bars before confirming a break of structure." },
  retest_min_touches: { label: "Retest Min Touches", min: 1, max: 5, step: 1, description: "Minimum touches of breakout boundary for a valid channel." },
  sl_pips: { label: "Stop Loss (pips)", min: 10, max: 100, step: 1, description: "Default stop loss distance in pips." },
  tp1_rr: { label: "TP1 R:R", min: 1.0, max: 5.0, step: 0.1, description: "Take profit 1 risk:reward multiple." },
  tp2_rr: { label: "TP2 R:R", min: 1.0, max: 5.0, step: 0.1, description: "Take profit 2 risk:reward multiple." },
};

export const Route = createFileRoute("/api/smc-strategy-config")({
  server: {
    handlers: {
      GET: async () => {
        const env = getCFEnv();
        if (!env) return Response.json({ config: DEFAULT_CONFIG, defaults: DEFAULT_CONFIG, param_meta: PARAM_META });

        try {
          // Ensure table exists
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS smc_strategy_config (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            )
          `).bind().run().catch(() => {});

          const { results } = await env.DB.prepare(
            "SELECT key, value FROM smc_strategy_config"
          ).bind().all();

          const stored: Record<string, unknown> = {};
          for (const row of results as any[]) {
            try {
              stored[row.key] = JSON.parse(row.value);
            } catch {
              stored[row.key] = row.value;
            }
          }

          // Merge with defaults (stored overrides default)
          const config = { ...DEFAULT_CONFIG, ...stored };
          // Deep merge confluence_weights
          if (stored["confluence_weights"]) {
            config["confluence_weights"] = { ...DEFAULT_CONFIG.confluence_weights, ...(stored["confluence_weights"] as Record<string, number>) };
          }

          return Response.json({ config, defaults: DEFAULT_CONFIG, param_meta: PARAM_META });
        } catch {
          return Response.json({ config: DEFAULT_CONFIG, defaults: DEFAULT_CONFIG, param_meta: PARAM_META });
        }
      },

      PATCH: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        try {
          const body = await request.json() as Record<string, unknown>;

          // Ensure table exists
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS smc_strategy_config (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            )
          `).bind().run().catch(() => {});

          // Store each key-value pair
          for (const [key, value] of Object.entries(body)) {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO smc_strategy_config (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))"
            ).bind(key, JSON.stringify(value)).run();
          }

          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },

      // Reset to defaults
      DELETE: async () => {
        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        try {
          await env.DB.prepare("DELETE FROM smc_strategy_config").bind().run();
          return Response.json({ ok: true, config: DEFAULT_CONFIG });
        } catch (e) {
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
