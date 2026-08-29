import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { LogoMark, LogoWordmark } from "../components/brand/logo";

// ── Server action: clear the session (logout) ───────────────────────────────
export async function logoutFn() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

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
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown tick
  useEffect(() => {
    if (countdown <= 0) return;
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          setError(null);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [countdown]);

  const locked = countdown > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next: next ?? "/" }),
      });
      const result = await res.json() as { ok: boolean; dest?: string; error?: string; retryAfter?: number };
      if (!result.ok) {
        if (result.retryAfter) {
          setCountdown(result.retryAfter);
          setError(`Too many failed attempts. Try again in ${result.retryAfter}s.`);
        } else {
          setError(result.error ?? "Invalid email or password.");
        }
        setBusy(false);
        return;
      }
      // Full page reload so the new cookie is sent with the request
      window.location.href = result.dest ?? "/";
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
                background: locked ? "oklch(0.450 0.150 50 / 0.12)" : "oklch(0.500 0.200 25 / 0.12)",
                border: locked ? "1px solid oklch(0.450 0.150 50 / 0.35)" : "1px solid oklch(0.500 0.200 25 / 0.30)",
                color: locked ? "oklch(0.750 0.150 50)" : "oklch(0.720 0.180 25)",
              }}>
                {locked ? `Too many failed attempts. Try again in ${countdown}s.` : error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || locked}
              style={{
                marginTop: 4, height: 44, borderRadius: 12, border: "none",
                cursor: busy || locked ? "default" : "pointer",
                background: locked
                  ? "oklch(0.350 0.080 50)"
                  : busy ? "oklch(0.400 0.100 295)" : "oklch(0.600 0.230 295)",
                color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em",
                boxShadow: busy || locked ? "none" : "0 0 18px oklch(0.680 0.230 295 / 0.35)",
                transition: "all 0.18s ease",
              }}
            >
              {busy ? "Signing in…" : locked ? `Locked — ${countdown}s` : "Sign in"}
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
