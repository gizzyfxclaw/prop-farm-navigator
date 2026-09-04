import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, RotateCcw, ShieldAlert } from "lucide-react";
import { Badge, Button, CockpitHeader } from "@/components/terminal/ui";

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
    <div className="engine-cockpit">
      <CockpitHeader
        title="Agent Console"
        badges={
          <Badge
            tone={blocked ? "red" : loaded ? "green" : "amber"}
            live={loaded && !blocked}
          >
            {blocked ? "Blocked" : loaded ? "Connected" : "Connecting"}
          </Badge>
        }
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
              <RotateCcw size={12} />
              Reload
            </Button>
            <a href={HERMES_CONSOLE_URL} target="_blank" rel="noreferrer">
              <Button variant="ghost">
                <ExternalLink size={12} />
                New tab
              </Button>
            </a>
          </div>
        }
      />

      <div
        className="panel relative overflow-hidden"
        style={{ height: "calc(100svh - 210px)", minHeight: 460, padding: 0 }}
      >
        {!loaded && !blocked && <span className="fx-loadbar" aria-hidden />}

        {!loaded && !blocked && (
          <div className="absolute inset-0 grid place-items-center fx-scan" style={{ zIndex: 2 }}>
            <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>
              Connecting to co-pilot…
            </span>
          </div>
        )}

        {blocked && (
          <div className="absolute inset-0 grid place-items-center px-4" style={{ zIndex: 2 }}>
            <div className="alert alert-amber fx-zoom" style={{ maxWidth: 420 }}>
              <p className="alert-title">
                <ShieldAlert size={13} />
                Console not loading
              </p>
              <p className="alert-body">
                The embed may be blocked by frame-ancestors policy or the mobile browser.
                Open it directly instead.
              </p>
              <a
                href={HERMES_CONSOLE_URL}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sweep mt-3 inline-flex"
              >
                <ExternalLink size={12} />
                Open console
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
          style={{ border: 0, background: "oklch(var(--gz-bg))" }}
          allow="clipboard-write; microphone"
        />
      </div>
    </div>
  );
}
