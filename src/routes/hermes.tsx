import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/terminal/ui";

export const Route = createFileRoute("/hermes")({
  head: () => ({
    meta: [
      { title: "Trading Agent — GizzyFx" },
      {
        name: "description",
        content: "Teach the Trading Agent strategy material and review its market analysis log.",
      },
    ],
  }),
  component: HermesPage,
});

function HermesPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Trading Agent</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            AI-powered market analysis and strategy validation.
          </p>
        </div>
      </div>

      {/* Hero card */}
      <div
        className="relative overflow-hidden rounded-2xl p-8 text-center"
        style={{
          border: "1px solid oklch(0.680 0.230 295 / 0.13)",
          background: "linear-gradient(135deg, oklch(0.15 0.02 292) 0%, oklch(0.12 0.03 295) 100%)",
        }}
      >
        <h2 className="mb-2 text-xl font-bold text-foreground">GizzyFx Co-pilot</h2>
        <p className="mx-auto mb-6 max-w-md text-[13px] text-muted-foreground">
          The Trading Agent console is a full AI chat interface for market analysis, strategy teaching,
          and backtesting. It runs best in its own tab on mobile.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <a href="https://hermes.gizzyfxstrategy.dpdns.org" target="_blank" rel="noreferrer">
            <Button className="h-11 px-8 text-base font-semibold">
              Open Agent Console ↗
            </Button>
          </a>
        </div>
      </div>

      {/* Feature grid */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-2xl">📚</div>
          <h3 className="mb-1 text-sm font-semibold">Teach Strategies</h3>
          <p className="text-[11px] text-muted-foreground">
            Upload strategy docs and build rules the agent applies to live analysis.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-2xl">📊</div>
          <h3 className="mb-1 text-sm font-semibold">Request Analysis</h3>
          <p className="text-[11px] text-muted-foreground">
            Get trade setups with entry/SL/TP on any pair and timeframe.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-2xl">📈</div>
          <h3 className="mb-1 text-sm font-semibold">Review Backtests</h3>
          <p className="text-[11px] text-muted-foreground">
            See strategy performance over real historical candles.
          </p>
        </div>
      </div>

      {/* Quick info */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">How it works</h3>
        <ul className="space-y-1 text-[12px] text-muted-foreground">
          <li>• Teach the agent your strategy rules and entry conditions</li>
          <li>• Ask for analysis on any pair — the agent draws levels on a chart</li>
          <li>• Request backtests to validate strategies against real market history</li>
          <li>• The agent remembers everything you teach it for future sessions</li>
        </ul>
      </div>
    </div>
  );
}
