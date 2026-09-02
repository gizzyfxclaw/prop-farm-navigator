import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/terminal/ui";

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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agent Console</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The GizzyFx Co-pilot console for strategy teaching and market analysis.
          </p>
        </div>
      </div>

      <div
        className="relative flex flex-col items-center justify-center rounded-xl p-12 text-center"
        style={{
          border: "1px solid oklch(0.680 0.230 295 / 0.13)",
          boxShadow: "0 0 12px oklch(0.680 0.230 295 / 0.08)",
          minHeight: 400,
          background: "oklch(0.085 0.020 292)",
        }}
      >
        <div className="mb-4 text-4xl">🤖</div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">GizzyFx Co-pilot</h2>
        <p className="mb-6 max-w-md text-[13px] text-muted-foreground">
          The Hermes agent console is a heavy web app that doesn't run well embedded in an iframe on mobile devices.
          Open it in a new tab for the best experience.
        </p>
        <div className="flex gap-3">
          <a href="https://hermes.gizzyfxstrategy.dpdns.org" target="_blank" rel="noreferrer">
            <Button className="h-10 px-6 text-base">
              Open Console in New Tab ↗
            </Button>
          </a>
        </div>
        <p className="mt-4 text-[10px] text-muted-foreground">
          Use the console to teach strategies, request backtests, and review market analysis.
        </p>
      </div>
    </div>
  );
}
