import { getCFEnv } from "./cloudflare-env";

/**
 * Shared-secret auth for the /api/hermes/* routes.
 * The secret lives in the hermes_auth D1 table (not an env var) so it can be
 * rotated with a single UPDATE, no redeploy required.
 */
export async function requireHermesAuth(request: Request): Promise<Response | null> {
  const env = getCFEnv();
  if (!env) return new Response("Service unavailable", { status: 503 });

  const key = request.headers.get("x-hermes-key");
  if (!key) return new Response("Unauthorized", { status: 401 });

  const row = await env.DB.prepare("SELECT value FROM hermes_auth WHERE key = 'shared_secret'")
    .bind()
    .first<{ value: string }>();

  if (!row || row.value !== key) return new Response("Unauthorized", { status: 401 });
  return null;
}
