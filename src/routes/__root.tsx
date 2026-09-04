import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Palette, Check, LogOut, ExternalLink, Sun, Moon } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider } from "../lib/store";
import { NotificationProvider } from "../lib/notifications";
import { NotificationBell } from "../components/terminal/NotificationBell";
import { MarketStatus } from "../components/terminal/MarketStatus";
import { ConnectionIndicator } from "../components/terminal/ConnectionIndicator";
import { AccountBalance } from "../components/terminal/AccountBalance";
import { LivePrice } from "../components/terminal/LivePrice";
import { MarketTape } from "../components/terminal/MarketTape";
import { LogoMark, LogoWordmark, LogoWatermark } from "../components/brand/logo";

const NAV = [
  { to: "/", label: "Engine",         short: "Engine"  },
  { to: "/calendar", label: "Calendar",     short: "News"    },
  { to: "/validator", label: "Validator",   short: "Valid."  },
  { to: "/accounts",  label: "Accounts",    short: "Accts"   },
  { to: "/journal",   label: "Journal",     short: "Journal" },
  { to: "/live",      label: "Live MT5",    short: "MT5"     },
  { to: "/hermes",    label: "Trading Agent", short: "Agent" },
  { to: "/backtest",  label: "Backtest",      short: "BT"     },
  { to: "/smc",       label: "SMC Analysis",  short: "SMC"    },
  { to: "/pnl",       label: "P&L Dashboard", short: "P&L"     },
  { to: "/console",   label: "Console",       short: "Console" },
  { to: "/settings",  label: "Settings",    short: "Config"  },
] as const;

/* ── Theme switcher ─────────────────────────────────────────────── */
const THEMES = [
  { id: "cyan",     label: "Terminal",  color: "oklch(0.800 0.135 196)" },
  { id: "graphite", label: "Graphite",  color: "oklch(0.860 0.010 250)" },
  { id: "blue",     label: "Desk Blue", color: "oklch(0.678 0.185 256)" },
  { id: "amber",    label: "Amber",     color: "oklch(0.815 0.150 75)"  },
  { id: "emerald",  label: "Emerald",   color: "oklch(0.775 0.155 158)" },
  { id: "purple",   label: "Violet",    color: "oklch(0.735 0.170 296)" },
] as const;

type ThemeId = typeof THEMES[number]["id"];
const THEME_IDS: ThemeId[] = ["cyan", "graphite", "blue", "amber", "emerald", "purple"];

function applyTheme(id: ThemeId) {
  if (id === "cyan") {
    delete document.documentElement.dataset["theme"];
  } else {
    document.documentElement.dataset["theme"] = id;
  }
}

/* ── Light / Dark mode toggle ──────────────────────────────────── */

type Mode = "dark" | "light";

function applyMode(mode: Mode) {
  if (mode === "light") {
    document.documentElement.dataset["mode"] = "light";
  } else {
    delete document.documentElement.dataset["mode"];
  }
  // Sync to Hermes WebUI localStorage key so the skin matches when navigating there
  try {
    localStorage.setItem("hermes-theme", mode === "light" ? "light" : "dark");
  } catch {}
}

function ModeToggle() {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gz-mode") as Mode | null;
      if (saved === "light") {
        setMode("light");
        applyMode("light");
      }
    } catch {}
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    try { localStorage.setItem("gz-mode", next); } catch {}
    applyMode(next);
  }

  const isLight = mode === "light";

  return (
    <button
      onClick={toggle}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="fx-press"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 26,
        background: isLight ? "oklch(var(--gz-p) / 0.12)" : "oklch(var(--gz-s2) / 0.7)",
        border: `1px solid ${isLight ? "oklch(var(--gz-p) / 0.35)" : "oklch(var(--gz-p) / 0.16)"}`,
        borderRadius: 2, cursor: "pointer", minHeight: 26,
        transition: "all 0.18s ease",
      }}
    >
      {isLight ? (
        <Moon size={13} style={{ color: "oklch(var(--gz-p))" }} />
      ) : (
        <Sun size={13} style={{ color: "oklch(var(--gz-mut))" }} />
      )}
    </button>
  );
}

/* ── Colour palette / theme switcher ─────────────────────────────── */

function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>("cyan");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gz-theme") as ThemeId | null;
      if (saved && THEME_IDS.includes(saved)) {
        setTheme(saved);
        applyTheme(saved);
      }
    } catch {}
  }, []);

  function switchTheme(id: ThemeId) {
    setTheme(id);
    try { localStorage.setItem("gz-theme", id); } catch {}
    applyTheme(id);
    setOpen(false);
  }

  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Theme — ${active.label}`}
        aria-label="Switch colour theme"
        className="fx-press"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 26, padding: "0 8px",
          background: "oklch(var(--gz-s2) / 0.7)",
          border: "1px solid oklch(var(--gz-p) / 0.16)",
          borderRadius: 2, cursor: "pointer", minHeight: 26,
        }}
      >
        <span style={{
          width: 10, height: 10, borderRadius: 2,
          background: active.color, flexShrink: 0,
          boxShadow: `0 0 6px ${active.color}`,
        }} />
        <Palette size={12} style={{ color: "oklch(var(--gz-mut))" }} />
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div
            className="panel fx-zoom"
            style={{
              position: "absolute", right: 0, top: "calc(100% + 6px)",
              zIndex: 61, minWidth: 168, padding: 4,
              boxShadow: "var(--gz-e3)",
            }}
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTheme(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "6px 8px", minHeight: 30,
                  background: theme === t.id ? "oklch(var(--gz-p) / 0.12)" : "transparent",
                  border: "none", borderRadius: 2, cursor: "pointer",
                  fontFamily: "var(--font-mono)", fontSize: 10.5,
                  fontWeight: 700, letterSpacing: "0.05em",
                  textTransform: "uppercase", textAlign: "left",
                  color: theme === t.id ? "oklch(var(--gz-p))" : "oklch(var(--gz-mut))",
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: 2,
                  background: t.color, flexShrink: 0,
                }} />
                {t.label}
                {theme === t.id && <Check size={11} style={{ marginLeft: "auto" }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Institutional backdrop — grid, mesh, vignette, grain ───────── */
function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop-mesh fx-mesh" />
      <div className="backdrop-grid" />
      <div className="backdrop-grid-major" />
      <div className="backdrop-sweep fx-h-sweep" />
      <div className="backdrop-vignette" />
      <div className="backdrop-grain" />
    </div>
  );
}

/* ── (removed) glow orbs & particle field ────────────────────────
   Both were startup-aesthetic decoration and cost real frames on the
   user's phone. The institutional Backdrop above replaces them with
   a chart grid, a low-chroma mesh, a vignette and film grain — all
   composited, no per-particle DOM nodes.
   ───────────────────────────────────────────────────────────────── */

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ position: "relative", zIndex: 1 }}>
      <div className="panel fx-rise" style={{ maxWidth: 420, width: "100%" }}>
        <div className="panel-head"><h2 className="panel-head-title">Route not found</h2></div>
        <div className="panel-body text-center">
          <p className="font-mono font-bold" style={{ fontSize: 56, lineHeight: 1, color: "oklch(var(--gz-p))" }}>404</p>
          <p className="mt-3 text-[12px]" style={{ color: "oklch(var(--gz-mut))" }}>
            No workspace is mapped to this path.
          </p>
          <Link to="/" className="btn btn-primary btn-sweep mt-5 inline-flex">Return to Engine</Link>
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
      <div className="panel panel-neg fx-rise" style={{ maxWidth: 480, width: "100%" }}>
        <div className="panel-head"><h2 className="panel-head-title">Render fault</h2></div>
        <div className="panel-body">
          <div className="alert alert-red">
            <p className="alert-title">This page didn't load</p>
            <p className="alert-body">{error.message || "An unexpected error occurred while rendering."}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => { router.invalidate(); reset(); }} className="btn btn-primary btn-sweep">
              Retry
            </button>
            <a href="/" className="btn btn-ghost">Return to Engine</a>
          </div>
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
      { name: "theme-color", content: "#0a0c12" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "GizzyFx" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "application-name", content: "GizzyFx" },
      { name: "msapplication-TileColor", content: "#0a0c12" },
      { name: "msapplication-TileImage", content: "/favicon-192.png" },
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
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap",
      },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "16x16",  href: "/favicon-16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32",  href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "48x48",  href: "/favicon-48.png" },
      { rel: "icon", type: "image/png", sizes: "64x64",  href: "/favicon-64.png" },
      { rel: "icon", type: "image/png", sizes: "128x128", href: "/favicon-128.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/favicon-192.png" },
      { rel: "icon", type: "image/png", sizes: "256x256", href: "/favicon-256.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/favicon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    scripts: [
      {
        /* Apply saved theme before first paint to prevent a flash of the
           default palette. Whitelist matches THEMES above. */
        children: `try{var t=localStorage.getItem("gz-theme");if(t&&["graphite","blue","amber","emerald","purple"].indexOf(t)>=0)document.documentElement.dataset.theme=t;var m=localStorage.getItem("gz-mode");if(m==="light")document.documentElement.dataset.mode="light";}catch(e){}`,
      },
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
    const tick = () => {
      const wat = new Date().toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour12: false });
      setNow(wat);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-1.5" title="Local time — West Africa Time (UTC+1)">
      <span className="fx-live-dot" style={{ color: "oklch(var(--gz-h))", width: 5, height: 5 }} />
      <span
        className="font-mono text-[11px] font-semibold"
        style={{ color: "oklch(var(--gz-txt) / 0.85)", letterSpacing: "0.04em" }}
      >
        {now}
      </span>
      <span className="font-mono text-[9px]" style={{ color: "oklch(var(--gz-mut))" }}>WAT</span>
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
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(0);

  // Measure the fixed header and keep padding-top pixel-perfect.
  // ResizeObserver fires whenever the bar height changes (font scale,
  // tape loading, market-status toggling) so the content is never hidden.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHeaderH(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    setHeaderH(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

  if (pathname === "/login") {
    return (
      <QueryClientProvider client={queryClient}>
        <StoreProvider>
          <Outlet />
          <Toaster
            theme="system"
            position="top-center"
            toastOptions={{
              style: {
                background: "oklch(var(--gz-s2) / 0.96)",
                border: "1px solid oklch(var(--gz-p) / 0.28)",
                color: "oklch(var(--gz-txt))",
                boxShadow: "0 0 24px oklch(var(--gz-p) / 0.18)",
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
      <NotificationProvider>
        <StoreProvider>
          <Backdrop />
          <LogoWatermark />

          <div className="relative min-h-screen w-full" style={{ zIndex: 1 }}>
            {/* ── Command bar ──────────────────────────────────────── */}
            <header ref={headerRef} className="cmdbar">
              {/* Row 1 — instrument status strip */}
              <div className="cmdbar-status hidden sm:block">
                <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
                  <div className="flex items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-3 min-w-0">
                      <MarketStatus />
                      <span className="vdivider" style={{ height: 12 }} />
                      <ConnectionIndicator />
                      <span className="vdivider" style={{ height: 12 }} />
                      <LivePrice />
                    </div>
                    <AccountBalance />
                  </div>
                </div>
              </div>

              {/* Row 2 — identity, navigation, controls */}
              <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
                <div className="flex items-center justify-between gap-4 py-2">
                  <div className="flex items-center gap-5 min-w-0">
                    <Link
                      to="/"
                      className="flex items-center select-none flex-shrink-0"
                      aria-label="GizzyFx home"
                    >
                      {/* Full clean GizzyFX brand logo — single image, no duplication */}
                      <img
                        src="/gizzyfx-nav2.png"
                        alt="GizzyFX"
                        style={{
                          height: 44,
                          width: "auto",
                          objectFit: "contain",
                          display: "block",
                          filter: "drop-shadow(0 0 8px rgba(0,200,100,0.35))",
                        }}
                      />
                    </Link>

                    <nav
                      className="flex items-center gap-0.5 overflow-x-auto scrollbar-institutional"
                      style={{ maxWidth: "62vw" }}
                    >
                      {NAV.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          activeOptions={{ exact: item.to === "/" }}
                          className="navtab"
                          activeProps={{ className: "navtab navtab-active" }}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </nav>

                    <a
                      href="https://hermes.gizzyfxstrategy.dpdns.org"
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sweep hidden lg:inline-flex flex-shrink-0"
                      title="Open the Trading Agent console in a new tab"
                    >
                      <ExternalLink size={12} />
                      Agent Console
                    </a>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Clock />
                    <span className="vdivider hidden sm:block" style={{ height: 16 }} />
                    <NotificationBell />
                    <ModeToggle />
                    <ThemeSwitcher />
                    <button
                      onClick={handleLogout}
                      className="btn btn-danger fx-press"
                      title="Sign out"
                    >
                      <LogOut size={12} />
                      <span className="hidden sm:inline">Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 3 — live quote tape */}
              <MarketTape />
            </header>

            {/* ── Page content ─────────────────────────────────── */}
            <main
              key={pathname}
              className="fx-stagger w-full flex-1 px-4 pb-8 sm:px-6 lg:px-10 xl:px-16"
              style={{
                minWidth: 0,
                paddingTop: headerH > 0 ? `calc(${headerH}px + 12px)` : "calc(var(--cmdbar-h) + 12px)",
              }}
            >
              <Outlet />
            </main>

            {/* ── Footer ──────────────────────────────────────── */}
            <footer className="appfooter w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-10 xl:px-16">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px]" style={{ color: "oklch(var(--gz-mut) / 0.85)" }}>
                  <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>GIZZYFX</span>
                  {" · Institutional terminal — hedge engine, validator & MetaApi execution."}
                </p>
                <p className="text-[11px]" style={{ color: "oklch(var(--gz-mut) / 0.85)" }}>
                  Educational use · Trade at your own risk.
                </p>
              </div>
            </footer>
          </div>

          <Toaster
            theme="system"
            position="top-center"
            toastOptions={{
              style: {
                background: "oklch(var(--gz-s2) / 0.97)",
                border: "1px solid oklch(var(--gz-p) / 0.24)",
                color: "oklch(var(--gz-txt))",
                borderRadius: 3,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                boxShadow: "var(--gz-e3)",
                backdropFilter: "blur(16px)",
              },
            }}
          />
        </StoreProvider>
      </NotificationProvider>
    </QueryClientProvider>
  );
}
