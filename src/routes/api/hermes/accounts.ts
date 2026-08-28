import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";
import type { PropAccount } from "@/lib/engine/calc";
import type { EngineSettings, MetaApiSettings } from "@/lib/store";

/**
 * Read-only account/engine settings for Hermes. The MetaApi token is a live
 * trading credential and is intentionally stripped before this ever leaves
 * the Worker.
 */
export const Route = createFileRoute("/api/hermes/accounts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return Response.json({ accounts: null, engine: null, meta: null });

        const [a, e, m] = await Promise.all([
          env.KV.get("gizzyfx.accounts"),
          env.KV.get("gizzyfx.engine"),
          env.KV.get("gizzyfx.meta"),
        ]);

        const accounts = a ? (JSON.parse(a) as PropAccount[]) : null;
        const engine = e ? (JSON.parse(e) as Partial<EngineSettings>) : null;
        const metaRaw = m ? (JSON.parse(m) as Partial<MetaApiSettings>) : null;
        const { token: _token, ...metaSafe } = metaRaw ?? {};

        return Response.json({ accounts, engine, meta: metaRaw ? metaSafe : null });
      },
    },
  },
});
