import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, Button } from "@/components/terminal/ui";

const HERMES_CONSOLE_URL = "https://hermes.gizzyfxstrategy.dpdns.org";

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "Agent Console — GizzyFx" },
      {
        name: "description",
        content: "The Hermes agent console, embedded in the GizzyFx terminal.",
      },
    ],
  }),
  component: ConsolePage,
});

function ConsolePage() {
  const [open, setOpen] = useState(false);

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
        {!open ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]">
            <Button onClick={() => setOpen(true)} className="h-12 px-8 text-base">
              Open Console
            </Button>
          </div>
        ) : (
          <iframe
            src={HERMES_CONSOLE_URL}
            title="GizzyFx Co-pilot console"
            className="h-full w-full"
            style={{ border: 0, background: "oklch(0.085 0.020 292)" }}
            allow="clipboard-write; microphone"
          />
        )}
      </div>
    </div>
  );
}
