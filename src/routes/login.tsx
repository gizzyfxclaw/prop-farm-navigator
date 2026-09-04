import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Loader2, Lock, LogIn } from "lucide-react";
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

  // Apply saved theme on mount (login page shares the same CSS vars)
  useEffect(() => {
    try {
      const t = localStorage.getItem("gz-theme");
      const valid = ["graphite", "blue", "amber", "emerald", "purple"];
      if (t && valid.includes(t)) {
        document.documentElement.dataset["theme"] = t;
      } else {
        delete document.documentElement.dataset["theme"];
      }
      const m = localStorage.getItem("gz-mode");
      if (m === "light") {
        document.documentElement.dataset["mode"] = "light";
      } else {
        delete document.documentElement.dataset["mode"];
      }
    } catch {}
  }, []);

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
        background: "oklch(var(--gz-bg))",
        padding: "1rem",
      }}
    >
      {/* Institutional backdrop — grid, mesh, vignette, grain */}
      <div className="backdrop" aria-hidden>
        <div className="backdrop-mesh fx-mesh" />
        <div className="backdrop-grid" />
        <div className="backdrop-grid-major" />
        <div className="backdrop-vignette" />
        <div className="backdrop-grain" />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 26 }}>
          <LogoMark size={38} />
          <LogoWordmark height={22} />
        </div>

        {/* Auth panel */}
        <div className="panel panel-accent fx-edge fx-rise" style={{ boxShadow: "var(--gz-e3)" }}>
          <div className="panel-head">
            <h1 className="panel-head-title">Terminal access</h1>
            <span className="badge badge-neutral">
              <Lock size={9} />
              Secured
            </span>
          </div>

          <div className="panel-body">
            <p className="mono-cap" style={{ color: "oklch(var(--gz-mut))", marginBottom: 18 }}>
              GizzyFx Institutional Terminal
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="ctl-label">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="ctl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="ctl-label">Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="ctl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              {error && (
                <div className={locked ? "alert alert-amber" : "alert alert-red fx-nudge"}>
                  <p className="alert-title">
                    <AlertTriangle size={12} />
                    {locked ? "Rate limited" : "Sign in failed"}
                  </p>
                  <p className="alert-body">
                    {locked ? `Too many failed attempts. Try again in ${countdown}s.` : error}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || locked}
                className="btn btn-primary btn-sweep"
                style={{ marginTop: 4, height: 42, fontSize: 12 }}
              >
                {busy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Authenticating…
                  </>
                ) : locked ? (
                  `Locked — ${countdown}s`
                ) : (
                  <>
                    <LogIn size={13} />
                    Sign in
                  </>
                )}
              </button>
            </form>
          </div>

          {busy && <span className="fx-loadbar" aria-hidden />}
        </div>

        <p
          className="mono-cap"
          style={{ marginTop: 16, textAlign: "center", color: "oklch(var(--gz-mut) / 0.65)" }}
        >
          Educational use · Trade at your own risk
        </p>
      </div>
    </div>
  );
}
