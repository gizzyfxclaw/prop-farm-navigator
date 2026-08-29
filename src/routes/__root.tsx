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
import { LogoMark, LogoWordmark, LogoWatermark } from "../components/brand/logo";

const NAV = [
  { to: "/", label: "Engine",         short: "Engine"  },
  { to: "/validator", label: "Validator",   short: "Valid."  },
  { to: "/accounts",  label: "Accounts",    short: "Accts"   },
  { to: "/journal",   label: "Journal",     short: "Journal" },
  { to: "/live",      label: "Live MT5",    short: "MT5"     },
  { to: "/hermes",    label: "Trading Agent", short: "Agent" },
  { to: "/settings",  label: "Settings",    short: "Config"  },
] as const;

/* ── Ambient glow orbs in background ──────────────────────────── */
function GlowOrbs() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{
        position: "absolute",
        top: "-10%", left: "-5%",
        width: "60vw", height: "60vw",
        borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.680 0.230 295 / 0.055) 0%, transparent 70%)",
      }} />
      <div style={{
        position: "absolute",
        bottom: "-15%", right: "-10%",
        width: "50vw", height: "50vw",
        borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.680 0.230 295 / 0.040) 0%, transparent 70%)",
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
      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground">{now}</span>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = router.state.location.pathname;

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        {/* Ambient layers — sit behind everything */}
        <GlowOrbs />
        <LogoWatermark />

        <div className="relative min-h-screen" style={{ zIndex: 1 }}>
          {/* ── Glass header ───────────────────────────────────── */}
          <header
            className="sticky top-0 z-30"
            style={{
              background: "oklch(0.085 0.020 292 / 0.82)",
              backdropFilter: "blur(24px) saturate(1.6)",
              WebkitBackdropFilter: "blur(24px) saturate(1.6)",
              borderBottom: "1px solid oklch(0.680 0.230 295 / 0.12)",
              boxShadow: "0 4px 32px oklch(0 0 0 / 0.40)",
            }}
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">

              {/* Brand lockup — mark + wordmark */}
              <Link
                to="/"
                className="glow-hover flex items-center gap-2.5 select-none"
                aria-label="GizzyFx home"
              >
                <LogoMark size={34} />
                <LogoWordmark height={21} />
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
                    className="press relative whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-white/[0.03]"
                    activeProps={{
                      className: "relative whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium tracking-wide text-primary",
                      style: {
                        background: "oklch(0.680 0.230 295 / 0.10)",
                        boxShadow: "0 0 12px oklch(0.680 0.230 295 / 0.15)",
                      }
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {/* ── Page content — re-animates on every route change ── */}
          <main key={pathname} className="stagger mx-auto max-w-6xl px-4 py-6">
            <Outlet />
          </main>

          {/* ── Footer ─────────────────────────────────────────── */}
          <footer
            className="mx-auto max-w-6xl px-4 py-8"
            style={{ borderTop: "1px solid oklch(0.680 0.230 295 / 0.08)" }}
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
              background: "oklch(0.148 0.026 292 / 0.95)",
              border: "1px solid oklch(0.680 0.230 295 / 0.25)",
              color: "oklch(0.945 0.020 292)",
              boxShadow: "0 0 20px oklch(0.680 0.230 295 / 0.15)",
              backdropFilter: "blur(16px)",
            },
          }}
        />
      </StoreProvider>
    </QueryClientProvider>
  );
}
