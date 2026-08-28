import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LiveAccountsPanel } from "@/components/terminal/LiveAccounts";
import { Alert, Badge, Button, Card, Field, Row, Select, TextInput } from "@/components/terminal/ui";
import { money, pendingOrderType, type Direction, type ExnessAccountType } from "@/lib/engine/calc";
import { PAIR_SPECS, PAIRS, formatPrice, type PairSymbol } from "@/lib/engine/pairs";
import { fetchQuote, placePendingOrder } from "@/lib/metaapi.functions";
import { useSelectedAccount, useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { useLiveAccounts } from "@/lib/useLiveAccounts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GizzyFx Engine — Inverted Mirror Hedge Calculator" },
      {
        name: "description",
        content:
          "Real-time dual-account hedge engine: lot sizes, mirrored SL/TP prices, escalating shield capital and MetaApi Cloud pending-order execution.",
      },
      { property: "og:title", content: "GizzyFx Engine — Inverted Mirror Hedge Calculator" },
      {
        property: "og:description",
        content: "Real-time prop/Exness mirror sizing with worst-case shield capital and live MT5 execution.",
      },
    ],
  }),
  component: EnginePage,
});

function EnginePage() {
  const { engine, setEngine, accounts, meta, addTrade } = useStore();
  const r = useEngine();
  const selectedAccount = useSelectedAccount();
  const liveAccounts = useLiveAccounts();
  const [live, setLive] = useState<{ price: number; label: string } | null>(null);
  const [status, setStatus] = useState<{ tone: "green" | "red" | "amber"; text: string } | null>(null);
  const [busy, setBusy] = useState<"price" | "trade" | null>(null);

  const dec = r.decimals;
  const symbol = engine.pair + meta.exnessSymbolSuffix;

  async function onFetchPrice() {
    if (!meta.token || !meta.exnessAccountId) {
      toast.error("Add your MetaApi token and Exness account ID in Settings first.");
      return;
    }
    setBusy("price");
    const res = await fetchQuote({ data: { token: meta.token, accountId: meta.exnessAccountId, symbol } });
    setBusy(null);
    if (!res.ok) {
      setLive(null);
      setStatus({ tone: "red", text: res.error });
      return;
    }
    setLive({ price: res.data.mid, label: `${symbol} bid ${res.data.bid} / ask ${res.data.ask}` });
    setEngine({ entryPrice: Number(res.data.mid.toFixed(dec)) });
    setStatus({ tone: "green", text: `Live ${symbol} ${formatPrice(res.data.mid, dec)} — entry price filled.` });
  }

  async function onExecute() {
    if (!meta.token || !meta.exnessAccountId) {
      toast.error("Add your MetaApi token and Exness account ID in Settings first.");
      return;
    }
    if (r.verdict.level === "red") {
      toast.error("Validator verdict is RED — execution blocked.");
      return;
    }
    if (!live) {
      toast.error("Fetch the live price first so the pending order type can be resolved.");
      return;
    }
    const volume = Number(r.exnessLots.toFixed(2));
    if (volume < 0.01) {
      toast.error("Exness lot size rounds below the 0.01 broker minimum. Increase the recovery target.");
      return;
    }
    const balance = liveAccounts.exness.snapshot;
    if (balance && balance.freeMargin <= 0) {
      toast.error("Live Exness free margin is zero — fund the account before placing the order.");
      return;
    }
    const actionType = pendingOrderType(r.exnessDirection, r.entryPrice, live.price);
    const summary = `${actionType.replace("ORDER_TYPE_", "")} ${symbol} ${volume} lots @ ${formatPrice(
      r.entryPrice,
      dec,
    )} · SL ${formatPrice(r.exnessSl, dec)} · TP ${formatPrice(r.exnessTp, dec)}`;
    const equityLine = balance ? `\nLive equity ${money(balance.equity)} · free margin ${money(balance.freeMargin)}` : "";
    if (!window.confirm(`Place this pending order on Exness?\n\n${summary}${equityLine}`)) return;

    setBusy("trade");
    const res = await placePendingOrder({
      data: {
        token: meta.token,
        accountId: meta.exnessAccountId,
        actionType,
        symbol,
        volume,
        openPrice: r.entryPrice,
        stopLoss: r.exnessSl,
        takeProfit: r.exnessTp,
        comment: "GizzyFx",
      },
    });
    setBusy(null);
    if (!res.ok) {
      setStatus({ tone: "red", text: res.error });
      return;
    }
    setStatus({ tone: "green", text: `Order placed — MT5 ticket ${res.data.orderId || "n/a"}. ${summary}` });
    const now = new Date();
    addTrade({
      id: `${now.getTime()}`,
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 8),
      pair: engine.pair,
      dir: engine.direction,
      result: "OPEN",
      propPnl: 0,
      exPnl: 0,
      netPnl: 0,
      ticket: res.data.orderId,
      details: {
        entry: r.entryPrice,
        propSl: r.propSl,
        propTp: r.propTp,
        exSl: r.exnessSl,
        exTp: r.exnessTp,
        propLots: Number(r.propLots.toFixed(2)),
        exLots: volume,
        rr: engine.rr,
        phase: engine.phase,
      },
    });
    toast.success("Pending order placed and logged in the journal.");
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Execution Engine</h1>

      <Card
        title="Live MT5 feed"
        badge={<Badge tone={live ? "green" : "blue"}>{live ? "MT5" : "API"}</Badge>}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Symbol">
            <Select
              value={engine.pair}
              onChange={(e) => setEngine({ pair: e.target.value as PairSymbol })}
            >
              {PAIRS.map((p) => (
                <option key={p} value={p}>
                  {PAIR_SPECS[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Broker symbol sent to MT5">
            <TextInput value={symbol} readOnly className="bg-secondary" />
          </Field>
          <Button onClick={onFetchPrice} disabled={busy === "price"}>
            {busy === "price" ? "Fetching…" : "Fetch live price"}
          </Button>
        </div>
        {status && (
          <div className="mt-4">
            <Alert level={status.tone} title={status.tone === "green" ? "Connected" : "Feed error"}>
              {status.text}
            </Alert>
          </div>
        )}
      </Card>

      <LiveAccountsPanel live={liveAccounts} result={r} account={selectedAccount} />

      <Card
        title="Inputs"
        badge={<Badge tone={engine.phase === 1 ? "blue" : "amber"}>Phase {engine.phase}</Badge>}
      >
        <div className="mb-4 flex gap-2">
          {[1, 2].map((p) => (
            <button
              key={p}
              onClick={() => setEngine({ phase: p as 1 | 2 })}
              className={`h-10 flex-1 rounded-xl text-[13px] font-semibold transition-colors ${
                engine.phase === p
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary text-muted-foreground"
              }`}
            >
              {p === 1 ? "Phase 1 · Micro Shield" : "Phase 2 · Mega Shield"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Prop account" hint={`${r.targetUsd ? money(r.targetUsd) : "$0.00"} target · ${money(r.maxDdUsd)} max DD`}>
            <Select
              value={engine.selectedAccountId}
              onChange={(e) => setEngine({ selectedAccountId: e.target.value })}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firm} · ${a.size.toLocaleString()} · {a.ddType}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prop risk per trade ($)">
            <TextInput
              type="number"
              step="0.01"
              value={engine.propRiskUsd}
              onChange={(e) => setEngine({ propRiskUsd: Number(e.target.value) })}
            />
          </Field>
          <Field label="R:R rotation (never 1:1)">
            <Select value={engine.rr} onChange={(e) => setEngine({ rr: Number(e.target.value) })}>
              <option value={1.5}>1 : 1.5</option>
              <option value={2}>1 : 2</option>
            </Select>
          </Field>
          <Field label="Prop stop loss (pips)">
            <TextInput
              type="number"
              step="1"
              value={engine.slPips}
              onChange={(e) => setEngine({ slPips: Number(e.target.value) })}
            />
          </Field>
          <Field label="Desired profit on blow ($)">
            <TextInput
              type="number"
              step="1"
              value={engine.desiredProfit}
              onChange={(e) => setEngine({ desiredProfit: Number(e.target.value) })}
            />
          </Field>
          <Field label="Safety buffer (%)" hint="Spread / slippage cushion">
            <TextInput
              type="number"
              step="1"
              value={engine.bufferPct}
              onChange={(e) => setEngine({ bufferPct: Number(e.target.value) })}
            />
          </Field>
          <Field label="Prop direction">
            <Select
              value={engine.direction}
              onChange={(e) => setEngine({ direction: e.target.value as Direction })}
            >
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </Select>
          </Field>
          <Field label="Exness account type">
            <Select
              value={engine.exnessAccountType}
              onChange={(e) => setEngine({ exnessAccountType: e.target.value as ExnessAccountType })}
            >
              <option value="Cent">Cent</option>
              <option value="Standard">Standard</option>
            </Select>
          </Field>
          <Field label="Entry price" hint={live ? live.label : "Fetch live price or type it"}>
            <TextInput
              type="number"
              step={engine.pair === "USDJPY" ? "0.001" : "0.00001"}
              value={engine.entryPrice}
              onChange={(e) => setEngine({ entryPrice: Number(e.target.value) })}
            />
          </Field>
          {engine.phase === 2 && (
            <>
              <Field
                label="Phase 1 total spent ($)"
                hint={`Auto: ${money(r.phase1TotalSpent)}`}
              >
                <TextInput
                  type="number"
                  step="0.01"
                  value={engine.carryPhase1TotalSpent ?? Number(r.phase1TotalSpent.toFixed(2))}
                  onChange={(e) => setEngine({ carryPhase1TotalSpent: Number(e.target.value) })}
                />
              </Field>
              <Field label="Phase 1 leftover Exness ($)">
                <TextInput
                  type="number"
                  step="0.01"
                  value={engine.carryPhase1Leftover ?? Number(r.phase1Leftover.toFixed(2))}
                  onChange={(e) => setEngine({ carryPhase1Leftover: Number(e.target.value) })}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  onClick={() => setEngine({ carryPhase1TotalSpent: null, carryPhase1Leftover: null })}
                >
                  Reset carry-over to Phase 1 math
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Mirror ticket">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="pb-2">Field</th>
                  <th className="pb-2">Prop firm</th>
                  <th className="pb-2">Exness {engine.exnessAccountType.toLowerCase()}</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {[
                  ["Direction", r.propDirection, r.exnessDirection],
                  ["Lot size (MT5)", r.propLots.toFixed(2), r.exnessLots.toFixed(2)],
                  ["SL / TP pips", `${r.propSlPips} / ${r.propTpPips}`, `${r.exnessSlPips} / ${r.exnessTpPips}`],
                  ["Entry", formatPrice(r.entryPrice, dec), formatPrice(r.entryPrice, dec)],
                  ["Stop loss", formatPrice(r.propSl, dec), formatPrice(r.exnessSl, dec)],
                  ["Take profit", formatPrice(r.propTp, dec), formatPrice(r.exnessTp, dec)],
                ].map(([label, a, b]) => (
                  <tr key={label} className="border-t border-border">
                    <td className="py-2 font-sans text-muted-foreground">{label}</td>
                    <td className="py-2 text-primary">{a}</td>
                    <td className="py-2 text-success">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Number(r.exnessLots.toFixed(2)) < 0.01 && (
            <p className="mt-3 text-[10.5px] text-destructive">
              Exness lot rounds to 0.00 — below the 0.01 broker minimum. Raise the desired profit on blow, lower the
              prop risk, or use a Cent account so the fuel size becomes tradable.
            </p>
          )}
          {engine.exnessAccountType === "Cent" && (
            <p className="mt-3 text-[10.5px] text-primary">
              Exness lots are cent lots (1 cent lot = 1/100 standard lot); pip value used is $
              {r.exnessPipValue.toFixed(2)}.
            </p>
          )}

        </Card>

        <Card title="Risk per trade">
          <Row label="Prop risk (SL hit)" value={money(-engine.propRiskUsd)} tone="neg" />
          <Row label="Prop reward (TP hit)" value={money(r.propWinPerTrade, true)} tone="pos" />
          <Row label="Exness reward (prop loses)" value={money(r.exnessWinTarget, true)} tone="pos" />
          <Row label="Exness risk (prop wins)" value={money(-r.exnessWinTarget * engine.rr)} tone="neg" />
          <Row label="Losses to blow prop" value={`${r.lossesToBlow} trades`} tone="accent" />
          <Row label="Wins to pass prop" value={`${r.winsToPass} trades`} tone="accent" />
        </Card>
      </div>

      <Card title="Total capital needed" badge={<Badge tone="amber">Worst case 1:2</Badge>}>
        {r.capitalBreakdown.map((b, i) => (
          <Row
            key={b.label}
            label={b.label}
            value={money(b.value)}
            tone={i === r.capitalBreakdown.length - 1 ? "default" : b.value < 0 ? "pos" : "neg"}
            strong={i === r.capitalBreakdown.length - 1}
          />
        ))}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Row label="Exness fuel required (buffered)" value={money(r.requiredExnessCapital)} tone="accent" />
          <Row label="Phase 2 refill required" value={money(r.phase2RefillRequired)} tone="accent" />
          <Row label="Prop payout at target" value={money(r.propPayout, true)} tone="pos" />
          <Row label="Net profit if passed" value={money(r.netProfitIfPassed, true)} tone={r.netProfitIfPassed >= 20 ? "pos" : "neg"} />
        </div>
        <p className="mt-3 text-[10.5px] text-muted-foreground">
          Capital always assumes the worst-case 1:2 rotation, so switching to 1:1.5 can never blow the fuel
          account. Buffer applied: {engine.bufferPct}%.
        </p>
      </Card>

      <Card title="Automated execution">
        <Alert level={r.verdict.level} title={r.verdict.title}>
          {r.verdict.detail}
        </Alert>
        <Button
          className="mt-4 w-full"
          onClick={onExecute}
          disabled={busy === "trade" || r.verdict.level === "red"}
        >
          {busy === "trade" ? "Placing order…" : "Execute Exness trade automatically"}
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Order type is resolved from the mirrored direction versus the live market price (BUY/SELL LIMIT or
          STOP). Fetch the live price first; the trade is logged to the journal on success.
        </p>
      </Card>
    </div>
  );
}
