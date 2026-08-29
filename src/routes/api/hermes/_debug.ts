import { createFileRoute } from "@tanstack/react-router";
import { getCFEnv, envStorage } from "@/lib/cloudflare-env";

export const Route = createFileRoute("/api/hermes/_debug")({
  server: {
    handlers: {
      GET: async () => {
        const env = getCFEnv();
        return Response.json({
          hasEnv: !!env,
          hasDB: !!env?.DB,
          hasKV: !!env?.KV,
          storeDirectly: !!envStorage.getStore(),
        });
      },
    },
  },
});
