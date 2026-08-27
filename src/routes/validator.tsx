import { createFileRoute } from "@tanstack/react-router";
import { Alert, Badge, Card, Row, Stat } from "@/components/terminal/ui";
import { calculate, money } from "@/lib/engine/calc";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";

export const Route = createFileRoute("/validator")({
  head: () => ({
    meta: [
      { title: "Prop Firm Validator — GizzyFx" },
      {
        name: "description",
        content:
          "Validate any prop firm challenge against the inverted mirror strategy: drawdown type, capital required and net profit if passed.",
      },
      { property: "og:title", content: "Prop Firm Validator — GizzyFx" },
      {
        property: "og:description",
        content: "Screen every prop account for trailing drawdown and thin payouts before spending a cent.",
      },
    ],
  }),
  component: ValidatorPage,
});

function ValidatorPage() {
  const { accounts, engine, setEngine } = useStore();
  const r = useEngine();

  const ranked = accounts
    .map((account) => ({
      account,
      result: calculate({
        account,
        phase: engine.phase,
        propRiskUsd: engine.propRiskUsd,
        rr: engine.rr,
        slPips: engine.slPips,
        desiredProfit: engine.desiredProfit,
        bufferPct: engine.bufferPct,
        pair: engine.pair,
        direction: engine.direction,
        entryPrice: engine.entryPrice,
        exnessAccountType: engine.exnessAccountType,
        carryPhase1TotalSpent: engine.carryPhase1TotalSpent,
        carryPhase1Leftover: engine.carryPhase1Leftover,
      }),
    }))
    .sort((a, b) => b.result.netProfitIfPassed - a.result.netProfitIfPassed);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Validator</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Every account scored with the current engine inputs and worst-case 1:2 shield math.
        </p>
      </div>

      <Alert level={r.verdict.level} title={r.verdict.title}>
        {r.verdict.detail}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total capital needed" value={money(r.totalRequiredCapital)} tone="text-primary" />
        <Stat label="Prop payout at target" value={money(r.propPayout)} tone="text-success" />
        <Stat
          label="Net profit if passed"
          value={money(r.netProfitIfPassed, true)}
          tone={r.netProfitIfPassed >= 20 ? "text-success" : "text-destructive"}
        />
        <Stat label="Wins to pass / losses to blow" value={`${r.winsToPass} / ${r.lossesToBlow}`} />
      </div>

      <Card title="Selected account breakdown" badge={<Badge tone="neutral">Phase {r.phase}</Badge>}>
        {r.capitalBreakdown.map((b) => (
          <Row key={b.label} label={b.label} value={money(b.value)} strong={b.label.startsWith("Total")} />
        ))}
        <Row label="Phase 1 total spent" value={money(r.phase1TotalSpent)} />
        <Row label="Phase 1 leftover" value={money(r.phase1Leftover)} />
        <Row label="Phase 2 refill required" value={money(r.phase2RefillRequired)} />
        <Row label="Leftover Exness balance if passed" value={money(r.leftoverExnessBalance)} tone="accent" />
      </Card>

      <Card title="All accounts ranked">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Fee</th>
                <th className="py-2 pr-3">DD type</th>
                <th className="py-2 pr-3">Capital needed</th>
                <th className="py-2 pr-3">Net if passed</th>
                <th className="py-2 pr-3">Verdict</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="font-mono">
              {ranked.map(({ account, result }) => (
                <tr key={account.id} className="border-t border-border">
                  <td className="py-2 pr-3 text-foreground">{account.firm}</td>
                  <td className="py-2 pr-3">{money(account.fee)}</td>
                  <td className="py-2 pr-3">{account.ddType}</td>
                  <td className="py-2 pr-3">{money(result.totalRequiredCapital)}</td>
                  <td
                    className={
                      result.netProfitIfPassed >= 20 ? "py-2 pr-3 text-success" : "py-2 pr-3 text-destructive"
                    }
                  >
                    {money(result.netProfitIfPassed, true)}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={result.verdict.level === "green" ? "green" : "red"}>
                      {result.verdict.level === "green" ? "Trade" : "Skip"}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setEngine({ selectedAccountId: account.id })}
                      className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {engine.selectedAccountId === account.id ? "Selected" : "Select"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
