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
  { to: "/", label: "Engine" },
  { to: "/validator", label: "Validator" },
  { to: "/accounts", label: "Accounts" },
  { to: "/journal", label: "Journal" },
  { to: "/live", label: "Live MT5" },
  { to: "/hermes", label: "Trading Agent" },
  { to: "/settings", label: "Settings" },
] as const;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
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
      {
        name: "description",
        content:
          "Dual-account hedge calculator, prop firm validator and MetaApi Cloud execution terminal for prop farming.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
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
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Clock() {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false }) + " UTC",
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="font-mono text-xs text-muted-foreground">{now}</span>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <div className="min-h-screen bg-background">
          <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
            {/* Top row: logo + clock */}
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-3 pb-0">
              <Link to="/" className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
                  G
                </span>
                <span className="text-sm font-bold tracking-[0.16em] text-foreground">GIZZYFX</span>
              </Link>
              <Clock />
            </div>
            {/* Nav row: horizontally scrollable on mobile, no wrap */}
            <div className="mx-auto max-w-6xl overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <nav className="flex min-w-max items-center gap-0.5 py-1">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === "/" }}
                    className="whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    activeProps={{ className: "bg-secondary !text-foreground" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">
            <Outlet />
          </main>
          <footer className="mx-auto max-w-6xl px-4 py-8 text-[11.5px] text-muted-foreground">
            <b className="text-foreground">GIZZYFX</b> · Institutional terminal — dual-account hedge
            calculator, validator and MetaApi Cloud execution. Educational use; trade at your own risk.
          </footer>
        </div>
        <Toaster theme="dark" position="top-center" />
      </StoreProvider>
    </QueryClientProvider>
  );
}
