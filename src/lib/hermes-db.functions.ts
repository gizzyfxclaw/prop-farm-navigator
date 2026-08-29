/**
 * Browser-facing D1 access for the Hermes integration panel.
 * No auth here, matching the rest of this single-user app's server functions
 * (see db.functions.ts) — separate from the /api/hermes/* REST routes, which
 * are for the Hermes agent process itself and require the shared secret.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCFEnv } from "./cloudflare-env";

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  source: string | null;
  created_at: string;
}

export interface HermesNote {
  id: string;
  pair: string | null;
  summary: string;
  details: string | null;
  request_id: string | null;
  verdict: "match" | "diverge" | "partial" | null;
  created_at: string;
}

export const loadKnowledgeDocs = createServerFn({ method: "GET" }).handler(
  async (): Promise<KnowledgeDoc[]> => {
    const env = getCFEnv();
    if (!env) return [];
    const { results } = await env.DB.prepare(
      "SELECT * FROM knowledge_docs ORDER BY created_at DESC",
    )
      .bind()
      .all<KnowledgeDoc>();
    return results;
  },
);

const knowledgeInput = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

export const addKnowledgeDoc = createServerFn({ method: "POST" })
  .validator(knowledgeInput)
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare(
      "INSERT INTO knowledge_docs (id, title, content, source) VALUES (?, ?, ?, 'webapp')",
    )
      .bind(crypto.randomUUID(), data.title, data.content)
      .run();
  });

export const deleteKnowledgeDoc = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare("DELETE FROM knowledge_docs WHERE id = ?").bind(data.id).run();
  });

export const loadHermesNotes = createServerFn({ method: "GET" }).handler(
  async (): Promise<HermesNote[]> => {
    const env = getCFEnv();
    if (!env) return [];
    const { results } = await env.DB.prepare(
      "SELECT * FROM hermes_notes ORDER BY created_at DESC LIMIT 100",
    )
      .bind()
      .all<HermesNote>();
    return results;
  },
);

export interface HermesUnderstanding {
  id: string;
  summary: string;
  contradictions: string | null;
  doc_count: number;
  created_at: string;
}

export const loadHermesUnderstanding = createServerFn({ method: "GET" }).handler(
  async (): Promise<HermesUnderstanding | null> => {
    const env = getCFEnv();
    if (!env) return null;
    const row = await env.DB.prepare(
      "SELECT * FROM hermes_understanding ORDER BY created_at DESC LIMIT 1",
    )
      .bind()
      .first<HermesUnderstanding>();
    return row ?? null;
  },
);

export interface HermesRequest {
  id: string;
  pair: string;
  note: string | null;
  /** The human's own read on the market, for the agent to check against the taught strategy. */
  user_analysis: string | null;
  /** Data URL (base64) of an attached chart screenshot, resized/compressed client-side. */
  chart_image: string | null;
  request_type: "analysis" | "backtest";
  status: "pending" | "fulfilled";
  created_at: string;
  fulfilled_at: string | null;
  /** Set on a backtest request to run the deterministic engine against this strategy_rules row. */
  rule_id: string | null;
  /** Candle interval for a backtest request, e.g. "1h", "4h", "1D". */
  timeframe: string | null;
}

export interface HermesBacktest {
  id: string;
  request_id: string | null;
  pair: string;
  period_description: string;
  trades_analyzed: number;
  wins: number;
  losses: number;
  win_rate: number;
  narrative: string;
  created_at: string;
  deterministic: number;
  rule_id: string | null;
  timeframe: string | null;
  max_drawdown_pct: number | null;
  avg_rr: number | null;
  bars_used: number | null;
}

export const loadHermesBacktests = createServerFn({ method: "GET" }).handler(
  async (): Promise<HermesBacktest[]> => {
    const env = getCFEnv();
    if (!env) return [];
    const { results } = await env.DB.prepare(
      "SELECT * FROM hermes_backtests ORDER BY created_at DESC LIMIT 50",
    )
      .bind()
      .all<HermesBacktest>();
    return results;
  },
);

export interface StrategyRule {
  id: string;
  knowledge_doc_id: string | null;
  title: string;
  direction: "long" | "short" | "both";
  entry_type: "sma_cross" | "ema_cross" | "rsi" | "breakout" | "custom";
  entry_params: string;
  custom_rules: string | null;
  sl_type: "atr" | "fixed_pips";
  sl_value: number;
  tp_type: "rr_multiple" | "fixed_pips";
  tp_value: number;
  default_timeframe: string;
  active: number;
  created_at: string;
}

export const loadStrategyRules = createServerFn({ method: "GET" }).handler(
  async (): Promise<StrategyRule[]> => {
    const env = getCFEnv();
    if (!env) return [];
    const { results } = await env.DB.prepare(
      "SELECT * FROM strategy_rules ORDER BY created_at DESC",
    )
      .bind()
      .all<StrategyRule>();
    return results;
  },
);

const strategyRuleInput = z
  .object({
    knowledge_doc_id: z.string().optional(),
    title: z.string().min(1),
    direction: z.enum(["long", "short", "both"]).default("both"),
    entry_type: z.enum(["sma_cross", "ema_cross", "rsi", "breakout", "custom"]),
    entry_params: z.record(z.string(), z.number()).default({}),
    custom_rules: z.string().optional(),
    sl_type: z.enum(["atr", "fixed_pips"]),
    sl_value: z.number().positive(),
    tp_type: z.enum(["rr_multiple", "fixed_pips"]),
    tp_value: z.number().positive(),
    default_timeframe: z.string().default("1h"),
  })
  .refine(
    (v) => (v.entry_type === "custom" ? !!v.custom_rules?.trim() : Object.keys(v.entry_params).length > 0),
    { message: "custom_rules is required for entry_type=custom; entry_params is required otherwise" },
  );

export const addStrategyRule = createServerFn({ method: "POST" })
  .validator(strategyRuleInput)
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare(
      `INSERT INTO strategy_rules
       (id, knowledge_doc_id, title, direction, entry_type, entry_params, custom_rules, sl_type, sl_value, tp_type, tp_value, default_timeframe)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        data.knowledge_doc_id ?? null,
        data.title,
        data.direction,
        data.entry_type,
        JSON.stringify(data.entry_params),
        data.custom_rules ?? null,
        data.sl_type,
        data.sl_value,
        data.tp_type,
        data.tp_value,
        data.default_timeframe,
      )
      .run();
  });

export const deleteStrategyRule = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare("DELETE FROM strategy_rules WHERE id = ?").bind(data.id).run();
  });

export const setStrategyRuleActive = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare("UPDATE strategy_rules SET active = ? WHERE id = ?")
      .bind(data.active ? 1 : 0, data.id)
      .run();
  });

export interface HermesSetup {
  id: string;
  request_id: string | null;
  pair: string;
  direction: "long" | "short";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
  rr: number | null;
  rationale: string | null;
  order_type: string | null;
  created_at: string;
}

export const loadHermesRequests = createServerFn({ method: "GET" }).handler(
  async (): Promise<HermesRequest[]> => {
    const env = getCFEnv();
    if (!env) return [];
    const { results } = await env.DB.prepare(
      "SELECT * FROM hermes_requests ORDER BY created_at DESC LIMIT 50",
    )
      .bind()
      .all<HermesRequest>();
    return results;
  },
);

const requestInput = z.object({
  pair: z.string().min(1),
  note: z.string().optional(),
  user_analysis: z.string().optional(),
  // Capped well under D1's row-size limit — the client resizes/compresses before sending.
  chart_image: z.string().max(1_500_000).optional(),
  request_type: z.enum(["analysis", "backtest"]).default("analysis"),
  rule_id: z.string().optional(),
  timeframe: z.string().optional(),
});

export const addHermesRequest = createServerFn({ method: "POST" })
  .validator(requestInput)
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare(
      "INSERT INTO hermes_requests (id, pair, note, user_analysis, chart_image, request_type, rule_id, timeframe) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        data.pair,
        data.note ?? null,
        data.user_analysis ?? null,
        data.chart_image ?? null,
        data.request_type,
        data.rule_id ?? null,
        data.timeframe ?? null,
      )
      .run();
  });

export const deleteHermesRequest = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare("DELETE FROM hermes_notes WHERE request_id = ?").bind(data.id).run();
    await env.DB.prepare("UPDATE hermes_setups SET request_id = NULL WHERE request_id = ?")
      .bind(data.id)
      .run();
    await env.DB.prepare("DELETE FROM hermes_requests WHERE id = ?").bind(data.id).run();
  });

export const deleteHermesNote = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare("DELETE FROM hermes_notes WHERE id = ?").bind(data.id).run();
  });

export const deleteHermesSetup = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare("DELETE FROM hermes_setups WHERE id = ?").bind(data.id).run();
  });

export const loadHermesSetups = createServerFn({ method: "GET" }).handler(
  async (): Promise<HermesSetup[]> => {
    const env = getCFEnv();
    if (!env) return [];
    const { results } = await env.DB.prepare(
      "SELECT * FROM hermes_setups ORDER BY created_at DESC LIMIT 50",
    )
      .bind()
      .all<HermesSetup>();
    return results;
  },
);
