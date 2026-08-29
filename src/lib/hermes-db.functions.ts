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

export interface HermesRequest {
  id: string;
  pair: string;
  note: string | null;
  status: "pending" | "fulfilled";
  created_at: string;
  fulfilled_at: string | null;
}

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
});

export const addHermesRequest = createServerFn({ method: "POST" })
  .validator(requestInput)
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare("INSERT INTO hermes_requests (id, pair, note) VALUES (?, ?, ?)")
      .bind(crypto.randomUUID(), data.pair, data.note ?? null)
      .run();
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
