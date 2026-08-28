import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Strategy knowledge base. The webapp (or the user directly) posts book
 * excerpts / strategy write-ups here as plain text; Hermes polls GET to pull
 * anything new into its own memory. Keeps "what Hermes was taught" visible
 * and editable from the site instead of buried in agent config.
 */
const docInput = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  source: z.string().optional(),
});

export const Route = createFileRoute("/api/hermes/knowledge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ docs: [] });

        const url = new URL(request.url);
        const since = url.searchParams.get("since");

        const { results } = since
          ? await env.DB.prepare(
              "SELECT * FROM knowledge_docs WHERE created_at > ? ORDER BY created_at ASC",
            )
              .bind(since)
              .all()
          : await env.DB.prepare("SELECT * FROM knowledge_docs ORDER BY created_at ASC").bind().all();

        return Response.json({ docs: results });
      },

      POST: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = docInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          "INSERT INTO knowledge_docs (id, title, content, source) VALUES (?, ?, ?, ?)",
        )
          .bind(id, body.title, body.content, body.source ?? null)
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
