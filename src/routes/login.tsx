import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { useState } from "react";
import { getCFEnv } from "../lib/cloudflare-env";
import { signSession } from "../lib/auth";
import { LogoMark, LogoWordmark } from "../components/brand/logo";

// ── Server action: validate credentials and issue a session cookie ──────────
const loginFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { email: string; password: string; next: string })
  .handler(async ({ data }) => {
    const env = getCFEnv();
    const expectedEmail = (env?.AUTH_EMAIL ?? "").toLowerCase();
    const expectedPassword = env?.AUTH_PASSWORD ?? "";
    const secret = env?.AUTH_SECRET ?? "";

    if (
      !secret ||
      data.email.toLowerCase() !== expectedEmail ||
      data.password !== expectedPassword
    ) {
      return { ok: false as const, error: "Invalid email or password." };
    }

    const token = await signSession(data.email, secret);
    setCookie("gfx_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    const dest = data.next && data.next.startsWith("/") ? data.next : "/";
    return { ok: true as const, dest };
  });

// ── Server action: clear the session (logout) ───────────────────────────────
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  setCookie("gfx_session", "", { httpOnly: true, secure: true, sameSite: "strict", maxAge: 0, path: "/" });
  throw redirect({ href: "/login" as string });
});

// ── Route ───────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in — GizzyFx" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch() as Record<string, string | undefined>;
  const next = search["next"];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await loginFn({ data: { email, password, next: next ?? "/" } });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      // Full page reload so the new cookie is sent with the request
      window.location.href = result.dest;
    } catch {
      setError("Sign in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(0.062 0.018 292)",
        padding: "1rem",
      }}
    >
      {/* Ambient glow */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "-10%", left: "-5%",
          width: "60vw", height: "60vw", borderRadius: "50%",
          background: "radial-gradient(circle, oklch(0.680 0.230 295 / 0.06) 0%, transparent 70%)",
        }} />
        <div style={{
          position: "absolute", bottom: "-15%", right: "-10%",
          width: "50vw", height: "50vw", borderRadius: "50%",
          background: "radial-gradient(circle, oklch(0.680 0.230 295 / 0.04) 0%, transparent 70%)",
        }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 380 }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 32 }}>
          <LogoMark size={40} />
          <LogoWordmark height={24} />
        </div>

        {/* Card */}
        <div style={{
          background: "oklch(0.100 0.022 292 / 0.90)",
          border: "1px solid oklch(0.680 0.230 295 / 0.18)",
          borderRadius: 20,
          padding: "2rem",
          backdropFilter: "blur(20px) saturate(1.5)",
          boxShadow: "0 8px 40px oklch(0 0 0 / 0.50), 0 0 0 1px oklch(0.680 0.230 295 / 0.06) inset",
        }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "oklch(0.945 0.020 292)", letterSpacing: "-0.01em" }}>
            Sign in
          </h1>
          <p style={{ margin: "6px 0 24px", fontSize: 13, color: "oklch(0.600 0.025 292)" }}>
            GizzyFx Institutional Terminal
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.680 0.025 292)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  height: 44, borderRadius: 12, border: "1px solid oklch(0.680 0.230 295 / 0.22)",
                  background: "oklch(0.076 0.015 292)", color: "oklch(0.945 0.020 292)",
                  padding: "0 14px", fontSize: 14, fontFamily: "'Geist', system-ui, sans-serif",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "oklch(0.680 0.230 295 / 0.60)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "oklch(0.680 0.230 295 / 0.22)"; }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.680 0.025 292)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  height: 44, borderRadius: 12, border: "1px solid oklch(0.680 0.230 295 / 0.22)",
                  background: "oklch(0.076 0.015 292)", color: "oklch(0.945 0.020 292)",
                  padding: "0 14px", fontSize: 14, fontFamily: "'Geist', system-ui, sans-serif",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "oklch(0.680 0.230 295 / 0.60)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "oklch(0.680 0.230 295 / 0.22)"; }}
              />
            </div>

            {error && (
              <p style={{
                margin: 0, padding: "10px 14px", borderRadius: 10, fontSize: 13,
                background: "oklch(0.500 0.200 25 / 0.12)", border: "1px solid oklch(0.500 0.200 25 / 0.30)",
                color: "oklch(0.720 0.180 25)",
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                marginTop: 4, height: 44, borderRadius: 12, border: "none", cursor: busy ? "default" : "pointer",
                background: busy ? "oklch(0.400 0.100 295)" : "oklch(0.600 0.230 295)",
                color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em",
                boxShadow: busy ? "none" : "0 0 18px oklch(0.680 0.230 295 / 0.35)",
                transition: "all 0.18s ease",
              }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: "oklch(0.420 0.015 292)" }}>
          GizzyFx — Institutional Prop Farming Terminal
        </p>
      </div>
    </div>
  );
}
