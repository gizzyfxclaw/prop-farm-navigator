import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/terminal/ui";

const HERMES_CONSOLE_URL = "https://hermes.gizzyfxstrategy.dpdns.org";

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "Agent Console — GizzyFx" },
      {
        name: "description",
        content: "The GizzyFx Co-pilot console, embedded in the terminal.",
      },
    ],
  }),
  component: ConsolePage,
});

function ConsolePage() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setBlocked(false);
    const id = window.setTimeout(() => {
      setLoaded((isLoaded) => {
        if (!isLoaded) setBlocked(true);
        return isLoaded;
      });
    }, 8000);
    return () => window.clearTimeout(id);
  }, [reloadKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agent Console</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The GizzyFx Co-pilot console, running inside the terminal.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
            Reload
          </Button>
          <a href={HERMES_CONSOLE_URL} target="_blank" rel="noreferrer">
            <Button variant="ghost">Open in new tab ↗</Button>
          </a>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          border: "1px solid oklch(0.680 0.230 295 / 0.13)",
          boxShadow: "0 0 12px oklch(0.680 0.230 295 / 0.08)",
          height: "calc(100svh - 160px)",
          minHeight: 500,
        }}
      >
        {!loaded && !blocked && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="animate-pulse text-[13px] text-muted-foreground">
              Loading console…
            </span>
          </div>
        )}
        {blocked && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-lg font-semibold text-foreground mb-2">Console not loading</div>
              <p className="text-[13px] text-muted-foreground mb-4">
                The console may be blocked by browser security policies.
                Try opening it in a new tab.
              </p>
              <a href={HERMES_CONSOLE_URL} target="_blank" rel="noreferrer">
                <Button>Open Console in New Tab ↗</Button>
              </a>
            </div>
          </div>
        )}
        <iframe
          key={reloadKey}
          ref={frameRef}
          src={HERMES_CONSOLE_URL}
          title="GizzyFx Co-pilot console"
          onLoad={() => setLoaded(true)}
          onError={() => setBlocked(true)}
          className="h-full w-full"
          style={{ border: 0, background: "oklch(0.085 0.020 292)" }}
          allow="clipboard-write; microphone"
        />
      </div>
    </div>
  );
}
