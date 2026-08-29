import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider } from "../lib/store";
import { LogoMark, LogoWordmark, LogoWatermark } from "../components/brand/logo";

const NAV = [
  { to: "/", label: "Engine",         short: "Engine"  },
  { to: "/validator", label: "Validator",   short: "Valid."  },
  { to: "/accounts",  label: "Accounts",    short: "Accts"   },
  { to: "/journal",   label: "Journal",     short: "Journal" },
  { to: "/live",      label: "Live MT5",    short: "MT5"     },
  { to: "/hermes",    label: "Trading Agent", short: "Agent" },
  { to: "/console",   label: "Console",     short: "Console" },
  { to: "/settings",  label: "Settings",    short: "Config"  },
] as const;

/* ── Ambient glow orbs ─────────────────────────────────────────── */
function GlowOrbs() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Main top-left orb */}
      <div className="orb-1" style={{
        position: "absolute",
        top: "-15%", left: "-8%",
        width: "65vw", height: "65vw",
        borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.775 0.148 198 / 0.07) 0%, oklch(0.775 0.148 198 / 0.03) 40%, transparent 70%)",
      }} />
      {/* Bottom-right orb */}
      <div className="orb-2" style={{
        position: "absolute",
        bottom: "-18%", right: "-12%",
        width: "55vw", height: "55vw",
        borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.820 0.155 180 / 0.055) 0%, transparent 65%)",
      }} />
      {/* Centre subtle orb */}
      <div className="orb-3" style={{
        position: "absolute",
        top: "40%", left: "45%",
        width: "40vw", height: "40vw",
        borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.775 0.148 198 / 0.035) 0%, transparent 70%)",
      }} />
    </div>
  );
}

/* ── Floating particles ────────────────────────────────────────── */
type Particle = { id: number; x: number; size: number; dur: number; delay: number; opacity: number };

function ParticleField() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const list: Particle[] = Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      size: Math.random() * 2 + 1,
      dur: Math.random() * 18 + 12,
      delay: Math.random() * -20,
      opacity: Math.random() * 0.4 + 0.1,
    }));
    setParticles(list);
  }, []);

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            bottom: "-4px",
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: "50%",
            background: `oklch(0.775 0.148 198 / ${p.opacity})`,
            boxShadow: `0 0 ${p.size * 3}px oklch(0.775 0.148 198 / ${p.opacity * 0.8})`,
            animation: `gz-float-up ${p.dur}s ${p.delay}s linear infinite`,
          }}
        />
      ))}
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ position: "relative", zIndex: 1 }}>
      <div className="text-center animate-in">
        <p className="font-display text-8xl font-bold text-neon">404</p>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <div className="mt-6">
          <Link to="/" className="btn-sweep btn-glow inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ position: "relative", zIndex: 1 }}>
      <div className="text-center max-w-md animate-in">
        <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try refreshing or head home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="btn-sweep btn-glow inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=1280, initial-scale=1" },
      { title: "GizzyFx — Institutional Prop Farming Terminal" },
      { name: "description", content: "Dual-account hedge calculator, prop firm validator and MetaApi Cloud execution terminal for prop farming." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Rajdhani:wght@600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function Clock() {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const tick = () => setNow(
      new Date().toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false }) + " UTC"
    );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2">
      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "oklch(0.820 0.155 180)" }} />
      <span className="font-mono text-[11px] tracking-wider" style={{ color: "oklch(0.580 0.055 200)" }}>{now}</span>
    </div>
  );
}

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
  window.location.href = "/login";
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = router.state.location.pathname;

  if (pathname === "/login") {
    return (
      <QueryClientProvider client={queryClient}>
        <StoreProvider>
          <Outlet />
          <Toaster
            theme="dark"
            position="top-center"
            toastOptions={{
              style: {
                background: "oklch(0.108 0.030 212 / 0.96)",
                border: "1px solid oklch(0.775 0.148 198 / 0.28)",
                color: "oklch(0.950 0.012 200)",
                boxShadow: "0 0 24px oklch(0.775 0.148 198 / 0.18)",
                backdropFilter: "blur(16px)",
              },
            }}
          />
        </StoreProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        {/* Ambient layers — behind everything */}
        <GlowOrbs />
        <ParticleField />
        <LogoWatermark />

        <div className="relative min-h-screen" style={{ zIndex: 1 }}>
          {/* ── Glass header ───────────────────────────────────── */}
          <header
            className="sticky top-0 z-30"
            style={{
              background: "oklch(0.075 0.028 212 / 0.88)",
              backdropFilter: "blur(28px) saturate(1.8)",
              WebkitBackdropFilter: "blur(28px) saturate(1.8)",
              borderBottom: "1px solid oklch(0.775 0.148 198 / 0.14)",
              boxShadow: "0 1px 0 oklch(0.775 0.148 198 / 0.08), 0 4px 40px oklch(0 0 0 / 0.45)",
            }}
          >
            {/* Top cyan accent bar */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "2px",
              background: "linear-gradient(90deg, transparent 0%, oklch(0.775 0.148 198 / 0.8) 20%, oklch(0.820 0.155 180) 50%, oklch(0.775 0.148 198 / 0.8) 80%, transparent 100%)",
            }} />

            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
              <Link
                to="/"
                className="glow-hover flex items-center gap-2.5 select-none"
                aria-label="GizzyFx home"
              >
                <LogoMark size={34} />
                <LogoWordmark height={21} />
              </Link>

              <div className="flex items-center gap-3">
                <Clock />
                <button
                  onClick={handleLogout}
                  style={{
                    height: 28, padding: "0 10px", borderRadius: 8,
                    border: "1px solid oklch(0.775 0.148 198 / 0.22)",
                    background: "oklch(0.775 0.148 198 / 0.08)",
                    color: "oklch(0.580 0.055 200)",
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                    cursor: "pointer", textTransform: "uppercase",
                    transition: "all 0.18s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "oklch(0.500 0.200 25 / 0.15)";
                    e.currentTarget.style.borderColor = "oklch(0.500 0.200 25 / 0.35)";
                    e.currentTarget.style.color = "oklch(0.720 0.180 25)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "oklch(0.775 0.148 198 / 0.08)";
                    e.currentTarget.style.borderColor = "oklch(0.775 0.148 198 / 0.22)";
                    e.currentTarget.style.color = "oklch(0.580 0.055 200)";
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>

            {/* Navigation row */}
            <div className="mx-auto max-w-6xl overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <nav className="flex min-w-max items-center gap-0.5">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === "/" }}
                    className="press relative whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium tracking-wide transition-all duration-200"
                    style={{ color: "oklch(0.580 0.055 200)" }}
                    activeProps={{
                      style: {
                        color: "oklch(0.775 0.148 198)",
                        background: "oklch(0.775 0.148 198 / 0.10)",
                        boxShadow: "0 0 16px oklch(0.775 0.148 198 / 0.18)",
                        textShadow: "0 0 12px oklch(0.775 0.148 198 / 0.50)",
                      }
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "oklch(0.950 0.012 200)";
                      (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "oklch(0.580 0.055 200)";
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {/* ── Page content ─────────────────────────────────── */}
          <main key={pathname} className="stagger mx-auto max-w-6xl px-4 py-6">
            <Outlet />
          </main>

          {/* ── Footer ──────────────────────────────────────── */}
          <footer
            className="mx-auto max-w-6xl px-4 py-8"
            style={{ borderTop: "1px solid oklch(0.775 0.148 198 / 0.09)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[11px]" style={{ color: "oklch(0.480 0.040 200)" }}>
                <span className="font-display font-semibold tracking-widest" style={{ color: "oklch(0.700 0.060 200)" }}>GIZZYFX</span>
                {" "}· Institutional terminal — hedge calculator, validator & MetaApi execution.
              </p>
              <p className="text-[11px]" style={{ color: "oklch(0.480 0.040 200)" }}>Educational use · Trade at your own risk.</p>
            </div>
          </footer>
        </div>

        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: {
              background: "oklch(0.108 0.030 212 / 0.96)",
              border: "1px solid oklch(0.775 0.148 198 / 0.28)",
              color: "oklch(0.950 0.012 200)",
              boxShadow: "0 0 24px oklch(0.775 0.148 198 / 0.18)",
              backdropFilter: "blur(16px)",
            },
          }}
        />
      </StoreProvider>
    </QueryClientProvider>
  );
}
