import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";
import {
  Alert, Badge, Card, CockpitHeader, DataGrid, Row, Stat, Button,
} from "@/components/terminal/ui";
import { CountUp, Gauge, LedMeter } from "@/components/terminal/anim";
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

  const tradable = ranked.filter((x) => x.result.verdict.level === "green").length;

  /* Loss-budget headroom: how much of the allowed loss count the strategy
     actually needs. Both figures come straight from the engine. */
  const lossHeadroom = r.lossesToBlow > 0
    ? Math.max(0, Math.min(1, r.lossesToBlow / 6))
    : 0;
  const winLoad = r.winsToPass > 0
    ? Math.max(0, Math.min(1, r.winsToPass / 20))
    : 0;

  return (
    <div className="engine-cockpit">
      <CockpitHeader
        title="Prop Firm Validator"
        badges={
          <>
            <Badge tone="neutral">Phase {r.phase}</Badge>
            <Badge tone="blue">R:R 1:{r.rr}</Badge>
            <Badge tone={tradable > 0 ? "green" : "red"}>
              {tradable} of {ranked.length} tradable
            </Badge>
          </>
        }
        right={
          <span className="cockpit-pair">
            Scored with live engine inputs
          </span>
        }
      />

      <Alert
        level={r.verdict.level}
        title={r.verdict.title}
        breathe={r.verdict.level === "red"}
      >
        {r.verdict.detail}
      </Alert>

      {/* ── Headline metrics ─────────────────────────────────────── */}
      <div className="wgrid-4">
        <Stat
          label="Total capital needed"
          value={<CountUp value={r.totalRequiredCapital} format={(v) => money(v)} />}
          tone="c-acc"
          sub="Prop fee + buffered Exness fuel"
        />
        <Stat
          label="Prop payout at target"
          value={<CountUp value={r.propPayout} format={(v) => money(v)} />}
          tone="c-pos"
          sub={`${money(r.targetUsd)} target`}
        />
        <Stat
          label="Net profit if passed"
          value={<CountUp value={r.netProfitIfPassed} format={(v) => money(v, true)} />}
          tone={r.netProfitIfPassed >= 20 ? "c-pos" : "c-neg"}
          sub={r.netProfitIfPassed >= 20 ? "Viable" : "Below the $20 floor"}
          accessory={
            <Gauge
              pct={r.propPayout > 0 ? Math.max(0, Math.min(1, r.netProfitIfPassed / r.propPayout)) : 0}
              size={44}
              thickness={4}
              tone={r.netProfitIfPassed >= 20 ? "pos" : "neg"}
            />
          }
        />
        <Stat
          label="Wins to pass / losses to blow"
          value={`${r.winsToPass} / ${r.lossesToBlow}`}
          sub="Loss budget headroom"
          accessory={
            <div style={{ width: 68 }}>
              <LedMeter pct={lossHeadroom} segments={8} height={7} tone={r.lossesToBlow < 3 ? "neg" : "pos"} />
              <div style={{ height: 3 }} />
              <LedMeter pct={winLoad} segments={8} height={7} tone={r.winsToPass > 15 ? "warn" : "accent"} />
            </div>
          }
        />
      </div>

      {/* ── Structural warnings ──────────────────────────────────── */}
      {r.lossesToBlow < 3 && (
        <Alert level="red" title="Dangerous — too few losses allowed" breathe>
          Only {r.lossesToBlow} loss{r.lossesToBlow === 1 ? "" : "es"} before account blow. The mirror
          strategy needs at least 3 losses to absorb slippage. Reduce prop risk or pick a bigger account.
        </Alert>
      )}
      {r.winsToPass > 15 && (
        <Alert level="amber" title="Many wins needed">
          {r.winsToPass} wins to pass. That extends exposure time and slippage risk. Consider a higher
          R:R or a smaller account.
        </Alert>
      )}

      {/* ── Selected account breakdown ───────────────────────────── */}
      <Card
        title="Selected account breakdown"
        accent="primary"
        badge={<Badge tone="neutral">Phase {r.phase}</Badge>}
      >
        {r.capitalBreakdown.map((b) => (
          <Row key={b.label} label={b.label} value={money(b.value)} strong={b.label.startsWith("Total")} />
        ))}
        <div className="divider my-2" />
        <Row label="Phase 1 total spent" value={money(r.phase1TotalSpent)} />
        <Row label="Phase 1 leftover" value={money(r.phase1Leftover)} />
        <Row label="Phase 2 refill required" value={money(r.phase2RefillRequired)} />
        <Row label="Leftover Exness balance if passed" value={money(r.leftoverExnessBalance)} tone="accent" strong />
      </Card>

      {/* ── All accounts ranked ──────────────────────────────────── */}
      <Card
        title="All accounts ranked"
        accent="highlight"
        badge={<Badge tone="blue">By net profit</Badge>}
        flush
      >
        {/* Mobile: dense cards */}
        <div className="sm:hidden">
          {ranked.map(({ account, result }) => {
            const selected = engine.selectedAccountId === account.id;
            const good = result.verdict.level === "green";
            return (
              <button
                key={account.id}
                onClick={() => setEngine({ selectedAccountId: account.id })}
                className="w-full text-left fx-press"
                style={{
                  display: "block",
                  padding: "0.6rem 0.7rem",
                  borderBottom: "1px solid oklch(var(--gz-p) / 0.08)",
                  background: selected ? "oklch(var(--gz-p) / 0.10)" : "transparent",
                  boxShadow: selected ? "inset 2px 0 0 0 oklch(var(--gz-p))" : "none",
                  minHeight: 0,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono-cap" style={{ color: "oklch(var(--gz-txt))" }}>{account.firm}</span>
                  <Badge tone={good ? "green" : "red"}>
                    {good ? <ShieldCheck size={11} /> : <ShieldX size={11} />}
                    {good ? "Trade" : "Skip"}
                  </Badge>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-3">
                  <span className="kv"><span className="kv-label">Fee</span><span className="kv-value">{money(account.fee)}</span></span>
                  <span className="kv"><span className="kv-label">DD</span><span className="kv-value">{account.ddType}</span></span>
                  <span className="kv"><span className="kv-label">Capital</span><span className="kv-value">{money(result.totalRequiredCapital)}</span></span>
                  <span className="kv">
                    <span className="kv-label">Net</span>
                    <span className="kv-value" style={{ color: result.netProfitIfPassed >= 20 ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))" }}>
                      {money(result.netProfitIfPassed, true)}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop: blotter grid */}
        <div className="hidden sm:block">
          <DataGrid
            head={[
              { label: "Account" },
              { label: "Size", align: "right" },
              { label: "Fee", align: "right" },
              { label: "DD type" },
              { label: "Capital needed", align: "right" },
              { label: "Net if passed", align: "right" },
              { label: "Verdict" },
              { label: "" },
            ]}
          >
            {ranked.map(({ account, result }) => {
              const selected = engine.selectedAccountId === account.id;
              const good = result.verdict.level === "green";
              return (
                <tr key={account.id} className={selected ? "is-selected" : undefined}>
                  <td style={{ color: "oklch(var(--gz-txt))", fontWeight: 600 }}>{account.firm}</td>
                  <td className="num">${account.size.toLocaleString()}</td>
                  <td className="num">{money(account.fee)}</td>
                  <td>
                    <span style={{ color: account.ddType.toLowerCase().includes("trail") ? "oklch(var(--gz-warn))" : "oklch(var(--gz-mut))" }}>
                      {account.ddType.toLowerCase().includes("trail") && <AlertTriangle size={10} style={{ display: "inline", marginRight: 3, verticalAlign: "-1px" }} />}
                      {account.ddType}
                    </span>
                  </td>
                  <td className="num">{money(result.totalRequiredCapital)}</td>
                  <td className="num" style={{ color: result.netProfitIfPassed >= 20 ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))", fontWeight: 700 }}>
                    {money(result.netProfitIfPassed, true)}
                  </td>
                  <td>
                    <Badge tone={good ? "green" : "red"}>
                      {good ? <ShieldCheck size={11} /> : <ShieldX size={11} />}
                      {good ? "Trade" : "Skip"}
                    </Badge>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Button
                      variant={selected ? "success" : "ghost"}
                      onClick={() => setEngine({ selectedAccountId: account.id })}
                    >
                      {selected ? "Selected" : "Select"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </DataGrid>
        </div>
      </Card>
    </div>
  );
}
