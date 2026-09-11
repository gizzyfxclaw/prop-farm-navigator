import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode, Component, type ErrorInfo } from "react";
import { createPortal } from "react-dom";
import { Toaster } from "sonner";
import { Palette, Check, LogOut, ExternalLink, Sun, Moon, AlertTriangle, RefreshCw, ClipboardList, ArrowRight, Menu, X, LayoutDashboard, Calendar, ShieldCheck, Wallet, BookOpen, Radio, Bot, BarChart3, Layers, PieChart, Terminal, HelpCircle, Settings, Wrench } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

/* ── Nav items ──────────────────────────────────────────────────── */

const NAV = [
  { to: "/",                label: "Engine",          icon: <LayoutDashboard size={16} /> },
  { to: "/briefing",        label: "Daily Briefing",  icon: <ClipboardList size={16} /> },
  { to: "/calendar",        label: "Calendar",        icon: <Calendar size={16} /> },
  { to: "/validator",       label: "Validator",       icon: <ShieldCheck size={16} /> },
  { to: "/accounts",        label: "Accounts",        icon: <Wallet size={16} /> },
  { to: "/journal",         label: "Journal",         icon: <BookOpen size={16} /> },
  { to: "/live",            label: "Live MT5",       icon: <Radio size={16} /> },
  { to: "/hermes",          label: "Trading Agent",  icon: <Bot size={16} /> },
  { to: "/backtest",        label: "Backtest",        icon: <BarChart3 size={16} /> },
  { to: "/smc",             label: "SMC Analysis",   icon: <Layers size={16} /> },
  { to: "/pnl",             label: "P&L Dashboard",  icon: <PieChart size={16} /> },
  { to: "/console",         label: "Console",        icon: <Terminal size={16} /> },
  { to: "/help",            label: "Help",           icon: <HelpCircle size={16} /> },
  { to: "/settings",        label: "Settings",       icon: <Settings size={16} /> },
] as const;

const primary = "cyan";

const THEMES = [
  { id: primary, label: "Cyan Terminal", color: "oklch(0.800 0.135 196)" },
  { id: "graphite", label: "Graphite", color: "oklch(0.860 0.010 250)" },
  { id: "blue", label: "Institutional Blue", color: "oklch(0.678 0.185 256)" },
  { id: "amber", label: "Amber", color: "oklch(0.815 0.150 75)" },
  { id: "emerald", label: "Emerald", color: "oklch(0.775 0.155 158)" },
  { id: "purple", label: "Purple", color: "oklch(0.735 0.170 296)" },
];

const THEME_IDS = THEMES.map((t) => t.id);

/* ── Theme helpers ───────────────────────────────────────────────── */

type ThemeId = (typeof THEME_IDS)[number];
type Mode = "dark" | "light";

function applyTheme(id: ThemeId) {
  try { document.documentElement.dataset.theme = id; } catch {}
}

function applyMode(mode: Mode) {
  try {
    document.documentElement.dataset.mode = mode === "light" ? "light" : "dark";
    const root = document.documentElement;
    if (mode === "light") root.style.colorScheme = "light";
    else root.style.colorScheme = "dark";
  } catch {}
}

/* ── Route ──────────────────────────────────────────────────────── */

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { title: "GizzyFx — Institutional Trading Terminal" },
      { name: "description", content: "Institutional-grade forex trading terminal" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
    scripts: [
      {
        children: `try{var t=localStorage.getItem("gz-theme");if(t&&["cyan","graphite","blue","amber","emerald","purple"].indexOf(t)>=0)document.documentElement.dataset.theme=t;var m=localStorage.getItem("gz-mode");if(m==="light")document.documentElement.dataset.mode="light";}catch(e){}`,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/* ── RootShell ──────────────────────────────────────────────────── */

function RootShell({ children }: { children: ReactNode }) {
  return children;
}

/* ── ModeToggle ─────────────────────────────────────────────────── */

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
        width: 28, height: 28,
        background: "oklch(var(--gz-s2) / 0.7)",
        border: "1px solid oklch(var(--gz-p) / 0.16)",
        borderRadius: 2, cursor: "pointer",
      }}
    >
      {isLight ? <Moon size={14} style={{ color: "oklch(var(--gz-p))" }} /> : <Sun size={14} style={{ color: "oklch(var(--gz-mut))" }} />}
    </button>
  );
}

/* ── ThemeSwitcher ──────────────────────────────────────────────── */

function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(primary);
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

  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0]!;

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

/* ── Backdrop ───────────────────────────────────────────────────── */

function Backdrop() {
  return (
    <div className="backdrop" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <div className="backdrop-grid" />
      <div className="backdrop-mesh" />
      <div className="backdrop-vignette" />
    </div>
  );
}

/* ── Clock ──────────────────────────────────────────────────────── */

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
      <span className="font-mono text-[11px] font-semibold" style={{ color: "oklch(var(--gz-txt) / 0.85)", letterSpacing: "0.04em" }}>
        {now}
      </span>
      <span className="font-mono text-[9px]" style={{ color: "oklch(var(--gz-mut))" }}>WAT</span>
    </div>
  );
}

/* ── NotificationBell ───────────────────────────────────────────── */

function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        title="Notifications"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, position: "relative",
          background: "oklch(var(--gz-s2) / 0.7)",
          border: "1px solid oklch(var(--gz-p) / 0.16)",
          borderRadius: 2, cursor: "pointer",
        }}
      >
        <AlertTriangle size={14} style={{ color: "oklch(var(--gz-mut))" }} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "oklch(var(--gz-neg))", color: "#fff",
            fontSize: 8, fontWeight: 700, borderRadius: "50%",
            width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}

/* ── MobileNav ──────────────────────────────────────────────────── */

function MobileNav() {
  const [mounted, setMounted] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!mounted || !isMobile) return null;

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  const toolsItems = [
    { to: "/backtest", label: "Backtest", icon: <BarChart3 size={20} /> },
    { to: "/pnl", label: "P&L Dashboard", icon: <PieChart size={20} /> },
    { to: "/console", label: "Console", icon: <Terminal size={20} /> },
    { to: "/journal", label: "Journal", icon: <BookOpen size={20} /> },
    { to: "/live", label: "Live MT5", icon: <Radio size={20} /> },
    { to: "/accounts", label: "Accounts", icon: <Wallet size={20} /> },
  ];

  const moreItems = [
    { to: "/calendar", label: "Calendar", icon: <Calendar size={20} /> },
    { to: "/validator", label: "Validator", icon: <ShieldCheck size={20} /> },
    { to: "/hermes", label: "Trading Agent", icon: <Bot size={20} /> },
    { to: "/help", label: "Help", icon: <HelpCircle size={20} /> },
    { to: "/settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  const primaryTabs = [
    { to: "/", label: "Home", icon: <LayoutDashboard size={22} />, action: "home" },
    { to: "/smc", label: "SMC", icon: <Layers size={22} />, action: "smc" },
    { to: "tools", label: "Tools", icon: <Wrench size={22} />, action: "tools" },
    { to: "/briefing", label: "Brief", icon: <ClipboardList size={22} />, action: "briefing" },
    { to: "more", label: "More", icon: <Menu size={22} />, action: "more" },
  ];

  return createPortal(
    <div>
      {/* Popover Panel */}
      {openPanel && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} onClick={() => setOpenPanel(null)} />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "oklch(var(--gz-s1))", borderTopLeftRadius: 20, borderTopRightRadius: 20,
            border: "1px solid oklch(var(--gz-p) / 0.2)", boxShadow: "0 -12px 48px rgba(0,0,0,0.5)", overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid oklch(var(--gz-p) / 0.15)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "oklch(var(--gz-p))" }}>
                {openPanel === "tools" ? "Trading Tools" : "More Options"}
              </span>
              <button onClick={() => setOpenPanel(null)} style={{ padding: 8, borderRadius: 8, border: "none", background: "oklch(var(--gz-s2))", color: "oklch(var(--gz-mut))", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "12px 0", maxHeight: "50vh", overflowY: "auto" }}>
              {(openPanel === "tools" ? toolsItems : moreItems).map((item) => (
                <button
                  key={item.to}
                  onClick={() => { setOpenPanel(null); window.location.href = item.to; }}
                  style={{
                    display: "flex", alignItems: "center", gap: 16, width: "100%", padding: "14px 20px",
                    border: "none", background: isActive(item.to) ? "oklch(var(--gz-p) / 0.12)" : "transparent",
                    color: isActive(item.to) ? "oklch(var(--gz-p))" : "oklch(var(--gz-txt))",
                    fontSize: 15, fontWeight: 600, textAlign: "left", cursor: "pointer",
                  }}
                >
                  <span style={{ color: isActive(item.to) ? "oklch(var(--gz-p))" : "oklch(var(--gz-mut))" }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              ))}
              <button
                onClick={() => { setOpenPanel(null); fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
                style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", padding: "14px 20px", border: "none", borderTop: "1px solid oklch(var(--gz-p) / 0.1)", background: "oklch(var(--gz-neg) / 0.05)", color: "oklch(var(--gz-neg))", fontSize: 15, fontWeight: 600, textAlign: "left", cursor: "pointer", marginTop: 8 }}
              >
                <LogOut size={20} />
                <span style={{ flex: 1 }}>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Toolbar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "oklch(var(--gz-s1))", borderTop: "1px solid oklch(var(--gz-p) / 0.15)", boxShadow: "0 -4px 20px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", padding: "8px 4px", paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          {primaryTabs.map((tab) => {
            const itemIsActive = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
            return (
              <button
                key={tab.action}
                onClick={() => {
                  if (tab.action === "tools" || tab.action === "more") {
                    setOpenPanel(openPanel === tab.action ? null : tab.action);
                  } else {
                    window.location.href = tab.to;
                  }
                }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 12px", border: "none", borderRadius: 12, background: openPanel === tab.action ? "oklch(var(--gz-p) / 0.1)" : "transparent", cursor: "pointer", minWidth: 60 }}
              >
                <span style={{ color: itemIsActive || openPanel === tab.action ? "oklch(var(--gz-p))" : "oklch(var(--gz-mut))" }}>{tab.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: itemIsActive || openPanel === tab.action ? "oklch(var(--gz-p))" : "oklch(var(--gz-mut))" }}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── handleLogout ──────────────────────────────────────────────── */

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
  window.location.href = "/login";
}

/* ── RootComponent ──────────────────────────────────────────────── */

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Daily Briefing reminder (once per 24hr)
  const [showDailyReminder, setShowDailyReminder] = useState(false);
  useEffect(() => {
    if (pathname === "/login") return;
    try {
      const lastShown = localStorage.getItem("gizzyfx.dailyReminder.lastShown");
      const now = Date.now();
      if (!lastShown || now - Number(lastShown) > 86400000) {
        const timer = setTimeout(() => setShowDailyReminder(true), 1500);
        return () => clearTimeout(timer);
      }
    } catch {}
    return undefined;
  }, [pathname]);

  const dismissDailyReminder = () => {
    try { localStorage.setItem("gizzyfx.dailyReminder.lastShown", String(Date.now())); } catch {}
    setShowDailyReminder(false);
    router.navigate({ to: "/briefing" });
  };

  // Measure header height
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.getBoundingClientRect().height));
    ro.observe(el);
    setHeaderH(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (pathname === "/login") {
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster theme="system" position="top-center" />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <Backdrop />

        <div className="relative min-h-screen w-full" style={{ zIndex: 1 }}>
          {/* Command bar */}
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
              <div className="flex items-center justify-between gap-2 sm:gap-4 py-2">
                <div className="flex items-center gap-2 sm:gap-5 min-w-0 overflow-hidden">
                  <Link to="/" className="flex items-center select-none flex-shrink-0" aria-label="GizzyFx home">
                    <img src="/gizzyfx-nav2.png" alt="GizzyFX" className="h-8 sm:h-11 w-auto" style={{ objectFit: "contain", display: "block", filter: "drop-shadow(0 0 8px rgba(0,200,100,0.35))" }} />
                  </Link>

                  <nav className="hidden lg:flex items-center gap-0.5 overflow-x-auto scrollbar-institutional" style={{ maxWidth: "62vw" }}>
                    {NAV.map((item) => (
                      <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} className="navtab" activeProps={{ className: "navtab navtab-active" }}>
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                  <a href="https://hermes.gizzyfxstrategy.dpdns.org" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sweep hidden xl:inline-flex flex-shrink-0" title="Open the Trading Agent console in a new tab">
                    <ExternalLink size={12} />
                    Agent Console
                  </a>
                </div>

                <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Clock />
                    <NotificationBell />
                  </div>
                  <ModeToggle />
                  <ThemeSwitcher />
                  <button onClick={handleLogout} className="btn btn-danger fx-press flex-shrink-0 !px-1.5 sm:!px-3" title="Sign out" style={{ height: 28, minWidth: 28, padding: "0 6px" }}>
                    <LogOut size={14} />
                    <span className="hidden sm:inline ml-1.5">Sign Out</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Row 3 — live quote tape */}
            <MarketTape />
          </header>

          {/* Mobile navigation bar */}
          <MobileNav />

          {/* Page content */}
          <main
            key={pathname}
            className="fx-stagger w-full flex-1 px-4 sm:px-6 lg:px-10 xl:px-16"
            style={{
              minWidth: 0,
              paddingTop: headerH > 0 ? `calc(${headerH}px + 12px)` : "calc(var(--cmdbar-h) + 12px)",
              paddingBottom: isMobile ? "120px" : "16px",
            }}
          >
            <PageErrorBoundary>
              <Outlet />
            </PageErrorBoundary>
          </main>

          {/* Global Risk Sentinel */}
          <GlobalRiskSentinel />

          {/* Daily Briefing Reminder (once per 24hr) */}
          {showDailyReminder && pathname !== "/briefing" && (
            <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "oklch(0 0 0 / 0.65)", backdropFilter: "blur(12px)" }} onClick={(e) => { if (e.target === e.currentTarget) dismissDailyReminder(); }}>
              <div style={{ maxWidth: 520, width: "92%", background: "oklch(var(--gz-s1) / 0.99)", border: "1px solid oklch(var(--gz-warn) / 0.35)", borderRadius: 12, boxShadow: "0 24px 64px oklch(0 0 0 / 0.5)", overflow: "hidden" }}>
                <div style={{ height: 3, background: "linear-gradient(90deg, oklch(var(--gz-warn)) 0%, oklch(var(--gz-p)) 50%, oklch(var(--gz-warn)) 100%)" }} />
                <div style={{ padding: "28px 32px 24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 80, height: 80, borderRadius: "50%", background: "oklch(var(--gz-warn) / 0.1)", border: "1.5px solid oklch(var(--gz-warn) / 0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                    <ClipboardList size={36} style={{ color: "oklch(var(--gz-warn))" }} />
                  </div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: "oklch(var(--gz-txt))", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4, textAlign: "center" }}>
                    Daily Briefing Reminder
                  </h2>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "oklch(var(--gz-mut))", marginBottom: 18, textAlign: "center" }}>
                    Mandatory pre-trade protocol
                  </p>
                  <div style={{ width: "100%", height: 1, background: "oklch(var(--gz-p) / 0.1)", marginBottom: 18 }} />
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginBottom: 22, textAlign: "left" }}>
                    {[
                      "Check Economic Calendar for HIGH/MED news",
                      "Verify London/NY session window is active",
                      "Confirm Exness MT5 live balance",
                      "Review Phase checklist items",
                      "Verify Daily Cap Lock status",
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 3, border: "1px solid oklch(var(--gz-warn) / 0.4)", background: "oklch(var(--gz-warn) / 0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(var(--gz-warn))" }} />
                        </div>
                        <span style={{ fontSize: 12, color: "oklch(var(--gz-txt) / 0.85)", fontWeight: 500 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ width: "100%", padding: "10px 14px", borderRadius: 6, background: "oklch(var(--gz-warn) / 0.06)", border: "1px solid oklch(var(--gz-warn) / 0.15)", marginBottom: 20 }}>
                    <p style={{ fontSize: 10, color: "oklch(var(--gz-warn) / 0.9)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center" }}>
                      This reminder appears once every 24 hours
                    </p>
                  </div>
                  <button onClick={dismissDailyReminder} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 24px", borderRadius: 6, border: "1px solid oklch(var(--gz-p) / 0.4)", background: "linear-gradient(180deg, oklch(var(--gz-p) / 0.2) 0%, oklch(var(--gz-p) / 0.1) 100%)", color: "oklch(var(--gz-p))", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s ease" }}>
                    <ArrowRight size={14} />
                    Proceed to Daily Briefing
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
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

        <Toaster theme="system" position="top-center" />
      </StoreProvider>
    </QueryClientProvider>
  );
}

/* ── NotFoundComponent / ErrorComponent / PageErrorBoundary ──────── */

function NotFoundComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4" style={{ color: "oklch(var(--gz-p))" }}>404</h1>
        <p className="text-muted-foreground">Page not found.</p>
      </div>
    </div>
  );
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportLovableError(error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4" style={{ color: "oklch(var(--gz-neg))" }}>
              Page Error
            </h1>
            <p className="text-muted-foreground mb-4">{this.state.error.message}</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary">
              <RefreshCw size={12} />
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
