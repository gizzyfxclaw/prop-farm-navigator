import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { envStorage, type CFEnv } from "./lib/cloudflare-env";
import { parseSessionToken, verifySession, signSession, buildSessionCookie, clearSessionCookie } from "./lib/auth";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

interface RequestWithCloudflareRuntime {
  runtime?: { cloudflare?: { env?: CFEnv } };
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const cfEnv = (request as unknown as RequestWithCloudflareRuntime).runtime?.cloudflare?.env ?? (env as CFEnv);

    // ── Raw auth endpoints (bypass TanStack Start entirely) ───────────────
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      try {
        const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "unknown";
        const kvKey = `login_fail:${ip}`;
        const kv = cfEnv?.KV;

        type FailData = { count: number; lockedUntil: number };
        let failData: FailData = { count: 0, lockedUntil: 0 };
        if (kv) {
          const stored = await kv.get<FailData>(kvKey, "json");
          if (stored) failData = stored;
        }

        const now = Date.now();
        if (failData.lockedUntil > now) {
          const retryAfter = Math.ceil((failData.lockedUntil - now) / 1000);
          return new Response(
            JSON.stringify({ ok: false, error: `Too many attempts. Wait ${retryAfter}s before trying again.`, retryAfter }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          );
        }

        const { email, password, next } = await request.json() as { email: string; password: string; next: string };
        const expectedEmail = (cfEnv?.AUTH_EMAIL ?? "").toLowerCase();
        const expectedPassword = cfEnv?.AUTH_PASSWORD ?? "";
        const secret = cfEnv?.AUTH_SECRET ?? "";

        if (!secret || email.toLowerCase() !== expectedEmail || password !== expectedPassword) {
          failData.count += 1;
          // Escalating lockout: 3 fails → 15s, 5 fails → 60s, 8 fails → 300s, 10+ → 900s
          let lockSeconds = 0;
          if (failData.count >= 10) lockSeconds = 900;
          else if (failData.count >= 8) lockSeconds = 300;
          else if (failData.count >= 5) lockSeconds = 60;
          else if (failData.count >= 3) lockSeconds = 15;

          if (lockSeconds > 0) failData.lockedUntil = now + lockSeconds * 1000;
          if (kv) await kv.put(kvKey, JSON.stringify(failData), { expirationTtl: 3600 });

          const retryAfter = lockSeconds > 0 ? lockSeconds : undefined;
          const errorMsg = lockSeconds > 0
            ? `Too many attempts. Wait ${lockSeconds}s before trying again.`
            : "Invalid email or password.";
          return new Response(
            JSON.stringify({ ok: false, error: errorMsg, retryAfter }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        // Credentials correct — clear the fail counter
        if (kv) await kv.delete(kvKey);

        const token = await signSession(email, secret);
        const dest = next && next.startsWith("/") ? next : "/";
        return new Response(JSON.stringify({ ok: true, dest, token }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildSessionCookie(token),
          },
        });
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Sign in failed." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: { "Location": `${url.origin}/login`, "Set-Cookie": clearSessionCookie() },
      });
    }

    // ── Auth gate ─────────────────────────────────────────────────────────
    // Only enforced when AUTH_SECRET is configured; skips /login and static
    // assets so the login page itself is always reachable.
    const authSecret = cfEnv?.AUTH_SECRET;
    if (authSecret) {
      const url = new URL(request.url);
      const isPublic =
        url.pathname === "/login" ||
        url.pathname.startsWith("/_build/") ||
        url.pathname.startsWith("/assets/") ||
        url.pathname === "/favicon.svg" ||
        url.pathname === "/favicon.ico" ||
        // Machine endpoints authenticate themselves (x-hermes-key shared
        // secret, or fully public by design) — the human session cookie
        // gate must not shadow them, or the Hermes agent gets redirected
        // to /login on every call instead of ever reaching its own auth.
        url.pathname.startsWith("/api/hermes/") ||
        url.pathname === "/api/ohlcv" ||
        url.pathname.startsWith("/api/economic-events") ||
        url.pathname === "/calendar";

      if (!isPublic) {
        const token = parseSessionToken(request.headers.get("cookie"));
        const email = token ? await verifySession(token, authSecret) : null;
        if (!email) {
          const dest = encodeURIComponent(url.pathname + url.search);
          return Response.redirect(`${url.origin}/login?next=${dest}`, 302);
        }
      }
    }
    // ── End auth gate ─────────────────────────────────────────────────────

    const runRequest = async () => {
      try {
        const handler = await getServerEntry();
        const response = await handler.fetch(request, env, ctx);
        return await normalizeCatastrophicSsrResponse(response);
      } catch (error) {
        console.error(error);
        return new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    };
    // Wrap each request so createServerFn handlers can access D1/KV via getCFEnv().
    return cfEnv?.DB ? envStorage.run(cfEnv, runRequest) : runRequest();
  },
};
