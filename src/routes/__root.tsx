import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider } from "../lib/store";

const NAV = [
  { to: "/", label: "Engine",         short: "Engine"  },
  { to: "/validator", label: "Validator",   short: "Valid."  },
  { to: "/accounts",  label: "Accounts",    short: "Accts"   },
  { to: "/journal",   label: "Journal",     short: "Journal" },
  { to: "/live",      label: "Live MT5",    short: "MT5"     },
  { to: "/hermes",    label: "Trading Agent", short: "Agent" },
  { to: "/settings",  label: "Settings",    short: "Config"  },
] as const;

/* ── Brand watermark SVG — approximates GizzyFx candlestick+arrow mark ── */
function BrandWatermark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 520 420"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.038,
        pointerEvents: "none",
        zIndex: 0,
        objectFit: "cover",
      }}
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Swoosh wave */}
      <path
        d="M20 320 Q130 200 260 240 Q390 280 500 120"
        stroke="#1bff7a"
        strokeWidth="18"
        fill="none"
        strokeLinecap="round"
      />
      {/* Candlestick bars */}
      <g fill="#1bff7a">
        <rect x="80"  y="170" width="28" height="90"  rx="3" />
        <line x1="94"  y1="140" x2="94"  y2="280" stroke="#1bff7a" strokeWidth="4" />
        <rect x="130" y="140" width="28" height="70"  rx="3" />
        <line x1="144" y1="110" x2="144" y2="230" stroke="#1bff7a" strokeWidth="4" />
        <rect x="180" y="160" width="28" height="100" rx="3" />
        <line x1="194" y1="130" x2="194" y2="290" stroke="#1bff7a" strokeWidth="4" />
      </g>
      <g fill="#ff4444">
        <rect x="230" y="190" width="28" height="80"  rx="3" />
        <line x1="244" y1="160" x2="244" y2="300" stroke="#ff4444" strokeWidth="4" />
        <rect x="280" y="200" width="28" height="110" rx="3" />
        <line x1="294" y1="170" x2="294" y2="340" stroke="#ff4444" strokeWidth="4" />
      </g>
      <g fill="#1bff7a">
        <rect x="330" y="150" width="28" height="80"  rx="3" />
        <line x1="344" y1="120" x2="344" y2="260" stroke="#1bff7a" strokeWidth="4" />
        <rect x="380" y="110" width="28" height="90"  rx="3" />
        <line x1="394" y1="80"  x2="394" y2="240" stroke="#1bff7a" strokeWidth="4" />
      </g>
      {/* Diagonal bar motif (from logo) */}
      <g stroke="#1bff7a" strokeWidth="22" strokeLinecap="round" opacity="0.7">
        <line x1="310" y1="60"  x2="370" y2="180" />
        <line x1="355" y1="60"  x2="415" y2="180" />
      </g>
      {/* Upward arrow */}
      <polyline
        points="420,280 460,180 500,200"
        stroke="#1bff7a"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="455,155 475,195 435,195" fill="#1bff7a" />
      {/* GIZZYFX wordmark */}
      <text
        x="50" y="390"
        fontFamily="'Rajdhani', sans-serif"
        fontWeight="700"
        fontSize="72"
        fill="#1bff7a"
        letterSpacing="6"
      >
        GIZZYFX
      </text>
    </svg>
  );
}

/* ── Ambient glow orbs in background ──────────────────────────── */
function GlowOrbs() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{
        position: "absolute",
        top: "-10%", left: "-5%",
        width: "60vw", height: "60vw",
        borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.780 0.220 145 / 0.055) 0%, transparent 70%)",
      }} />
      <div style={{
        position: "absolute",
        bottom: "-15%", right: "-10%",
        width: "50vw", height: "50vw",
        borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.780 0.220 145 / 0.040) 0%, transparent 70%)",
      }} />
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ position: "relative", zIndex: 1 }}>
      <div className="text-center">
        <p className="font-display text-8xl font-bold text-neon">404</p>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
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
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try refreshing or head home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
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
      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground">{now}</span>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        {/* Ambient layers — sit behind everything */}
        <GlowOrbs />
        <BrandWatermark />

        <div className="relative min-h-screen" style={{ zIndex: 1 }}>
          {/* ── Glass header ───────────────────────────────────── */}
          <header
            className="sticky top-0 z-30"
            style={{
              background: "oklch(0.075 0.010 145 / 0.82)",
              backdropFilter: "blur(24px) saturate(1.6)",
              WebkitBackdropFilter: "blur(24px) saturate(1.6)",
              borderBottom: "1px solid oklch(0.780 0.220 145 / 0.12)",
              boxShadow: "0 4px 32px oklch(0 0 0 / 0.40)",
            }}
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">

              {/* Logo mark */}
              <Link to="/" className="flex items-center gap-2.5 select-none">
                {/* Icon — stylised G with neon border */}
                <div style={{
                  width: 34, height: 34,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, oklch(0.15 0.020 145), oklch(0.10 0.012 145))",
                  border: "1.5px solid oklch(0.780 0.220 145 / 0.55)",
                  boxShadow: "0 0 14px oklch(0.780 0.220 145 / 0.30)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {/* Mini candlestick SVG as logo icon */}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="2" y="8" width="4" height="9" rx="0.8" fill="#22c55e" />
                    <line x1="4" y1="4" x2="4" y2="19" stroke="#22c55e" strokeWidth="1.5" />
                    <rect x="8" y="5" width="4" height="7" rx="0.8" fill="#ef4444" />
                    <line x1="10" y1="2" x2="10" y2="14" stroke="#ef4444" strokeWidth="1.5" />
                    <rect x="14" y="3" width="4" height="10" rx="0.8" fill="#22c55e" />
                    <line x1="16" y1="1" x2="16" y2="15" stroke="#22c55e" strokeWidth="1.5" />
                    {/* Arrow */}
                    <polyline points="2,18 10,10 18,4" stroke="#1bff7a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                  </svg>
                </div>

                {/* Wordmark — Rajdhani display */}
                <div className="leading-none">
                  <span
                    className="font-display font-bold tracking-[0.18em] text-foreground"
                    style={{ fontSize: 17, letterSpacing: "0.18em" }}
                  >
                    GIZZY
                  </span>
                  <span
                    className="font-display font-bold text-neon"
                    style={{ fontSize: 17, letterSpacing: "0.10em" }}
                  >
                    FX
                  </span>
                </div>
              </Link>

              <Clock />
            </div>

            {/* Navigation row */}
            <div className="mx-auto max-w-6xl overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <nav className="flex min-w-max items-center gap-0.5">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === "/" }}
                    className="relative whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                    activeProps={{
                      className: "relative whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium tracking-wide text-primary",
                      style: {
                        background: "oklch(0.780 0.220 145 / 0.10)",
                        boxShadow: "0 0 12px oklch(0.780 0.220 145 / 0.15)",
                      }
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {/* ── Page content ───────────────────────────────────── */}
          <main className="mx-auto max-w-6xl px-4 py-6">
            <Outlet />
          </main>

          {/* ── Footer ─────────────────────────────────────────── */}
          <footer
            className="mx-auto max-w-6xl px-4 py-8"
            style={{ borderTop: "1px solid oklch(0.780 0.220 145 / 0.08)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-display font-semibold text-foreground tracking-widest">GIZZYFX</span>
                {" "}· Institutional terminal — hedge calculator, validator & MetaApi execution.
              </p>
              <p className="text-[11px] text-muted-foreground">Educational use · Trade at your own risk.</p>
            </div>
          </footer>
        </div>

        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: {
              background: "oklch(0.130 0.015 145 / 0.95)",
              border: "1px solid oklch(0.780 0.220 145 / 0.25)",
              color: "oklch(0.940 0.018 145)",
              boxShadow: "0 0 20px oklch(0.780 0.220 145 / 0.15)",
              backdropFilter: "blur(16px)",
            },
          }}
        />
      </StoreProvider>
    </QueryClientProvider>
  );
}
