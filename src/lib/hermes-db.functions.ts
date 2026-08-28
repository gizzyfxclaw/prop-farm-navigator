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
