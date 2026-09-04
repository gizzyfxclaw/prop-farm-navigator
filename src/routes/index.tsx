import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LiveAccountsPanel } from "@/components/terminal/LiveAccounts";
import { ActualExnessBalance } from "@/components/terminal/ActualExnessBalance";
import { RulesAlertPanel } from "@/components/terminal/RulesAlertPanel";
import {
  ActionButton, Alert, Badge, Button, Card, CockpitHeader, DataGrid, DirectionChip,
  Field, Row, Segmented, Select, Stat, TextInput,
} from "@/components/terminal/ui";
import { CountUp, Gauge, LedMeter, LoadBar, TickValue } from "@/components/terminal/anim";
import { money, pendingOrderType, type Direction, type ExnessAccountType } from "@/lib/engine/calc";
import { useNotifications } from "@/lib/notifications";
import { PAIR_SPECS, PAIRS, formatPrice, type PairSymbol } from "@/lib/engine/pairs";
import { placePendingOrder } from "@/lib/metaapi.functions";
import { marketStatus } from "@/lib/market-hours";
import { computeRecovery } from "@/lib/recovery";
import { useSelectedAccount, useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { useLiveAccounts } from "@/lib/useLiveAccounts";
import { useLivePrice } from "@/lib/useLivePrice";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GizzyFx Engine — Inverted Mirror Hedge Calculator" },
      { name: "description", content: "Real-time dual-account hedge engine: lot sizes, mirrored SL/TP prices, escalating shield capital and MetaApi Cloud pending-order execution." },
      { property: "og:title", content: "GizzyFx Engine — Inverted Mirror Hedge Calculator" },
      { property: "og:description", content: "Real-time prop/Exness mirror sizing with selected-R:R shield capital and live MT5 execution." },
    ],
  }),
  component: EnginePage,
});

function EnginePage() {
  const { engine, setEngine, accounts, meta, addTrade, journal } = useStore();
  const r = useEngine();
  const recovery = computeRecovery(r, journal);
  const selectedAccount = useSelectedAccount();
  const { addNotification } = useNotifications();
  const liveAccounts = useLiveAccounts();
  const [status, setStatus] = useState<{ tone: "green" | "red" | "amber"; text: string } | null>(null);
  const [busy, setBusy] = useState<"trade" | "trade-prop" | null>(null);
  const [liveMode, setLiveMode] = useState(true);
  const liveModeRef = useRef(liveMode);
  const lastRiskCapped = useRef(false);
  const lastBufferDepleted = useRef(false);

  useEffect(() => { liveModeRef.current = liveMode; }, [liveMode]);

  useEffect(() => {
    if (r.riskCapped && !lastRiskCapped.current) {
      addNotification({
        title: "Daily Profit Cap Active",
        body: `Prop Risk reduced from $${engine.propRiskUsd.toFixed(2)} to $${r.cappedPropRisk.toFixed(2)} (reward capped at $${(r.cappedPropRisk * r.rr).toFixed(2)})`,
        type: "warning",
      });
    }
    lastRiskCapped.current = r.riskCapped;

    if (recovery.bufferDepleted && !lastBufferDepleted.current) {
      addNotification({
        title: "Exness Buffer Depleted",
        body: `Deposit $${recovery.depositNeeded.toFixed(2)} to maintain the zero-loss loop.`,
        type: "error",
      });
    }
    lastBufferDepleted.current = recovery.bufferDepleted;
  }, [r.riskCapped, recovery.bufferDepleted, recovery.depositNeeded, engine.propRiskUsd, r.cappedPropRisk, r.rr, addNotification]);

  const [market, setMarket] = useState(() => marketStatus());
  useEffect(() => {
    const id = window.setInterval(() => setMarket(marketStatus()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const dec = r.decimals;
  const symbol = engine.pair + meta.exnessSymbolSuffix;
  const livePrice = useLivePrice(symbol);

  useEffect(() => {
    if (!liveModeRef.current || livePrice.price == null) return;
    setEngine({ entryPrice: Number(livePrice.price.toFixed(dec)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrice.price, livePrice.updatedAt]);

  const live = livePrice.price != null
    ? { price: livePrice.price, label: `${symbol} bid ${livePrice.bid} / ask ${livePrice.ask}` }
    : null;

  function onResumeLive() {
    if (!meta.token || !meta.exnessAccountId) {
      toast.error("Add your MetaApi token and Exness account ID in Settings first.");
      return;
    }
    setLiveMode(true);
    void livePrice.refresh();
  }

  async function onExecute(leg: "exness" | "prop") {
    const isProp = leg === "prop";
    const legLabel = isProp ? "prop" : "Exness";
    const accountId = isProp ? meta.propAccountId : meta.exnessAccountId;

    if (!meta.token || !accountId) {
      toast.error(`Add your MetaApi token and ${legLabel} account ID in Settings first.`);
      return;
    }
    if (!market.open) {
      toast.error(`Market closed — reopens ${market.changesIn}. The broker would reject this order.`);
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

    const direction = isProp ? r.propDirection : r.exnessDirection;
    const lots = isProp ? r.propLots : r.exnessLots;
    const stopLoss = isProp ? r.propSl : r.exnessSl;
    const takeProfit = isProp ? r.propTp : r.exnessTp;

    const volume = Number(lots.toFixed(2));
    if (volume < 0.01) {
      toast.error(`${legLabel} lot size rounds below the 0.01 broker minimum. Increase the recovery target.`);
      return;
    }

    const balance = isProp ? liveAccounts.prop.snapshot : liveAccounts.exness.snapshot;
    if (balance && balance.freeMargin <= 0) {
      toast.error(`Live ${legLabel} free margin is zero — fund the account before placing the order.`);
      return;
    }

    const actionType = pendingOrderType(direction, r.entryPrice, live.price);
    const summary = `${actionType.replace("ORDER_TYPE_", "")} ${symbol} ${volume} lots @ ${formatPrice(r.entryPrice, dec)} · SL ${formatPrice(stopLoss, dec)} · TP ${formatPrice(takeProfit, dec)}`;
    const equityLine = balance ? `\nLive equity ${money(balance.equity)} · free margin ${money(balance.freeMargin)}` : "";
    if (!window.confirm(`Place this pending order on ${legLabel}?\n\n${summary}${equityLine}`)) return;

    setBusy(isProp ? "trade-prop" : "trade");
    const res = await placePendingOrder({
      data: {
        token: meta.token,
        accountId,
        actionType,
        symbol,
        volume,
        openPrice: r.entryPrice,
        stopLoss,
        takeProfit,
        comment: "GizzyFx",
      },
    });
    setBusy(null);
    if (!res.ok) {
      setStatus({ tone: "red", text: res.error });
      return;
    }
    setStatus({
      tone: "green",
      text: `${legLabel} order placed — MT5 ticket ${res.data.orderId || "n/a"}. ${summary}`,
    });
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
        propLots: isProp ? volume : Number(r.propLots.toFixed(2)),
        exLots: isProp ? Number(r.exnessLots.toFixed(2)) : volume,
        rr: engine.rr,
        phase: engine.phase,
        leg,
      },
    });
    toast.success(`${legLabel} pending order placed and logged in the journal.`);
  }

  return (
    <div className="engine-cockpit">
      {/* ── COCKPIT HEADER ──────────────────────────────────────── */}
      <CockpitHeader
        title="Execution Engine"
        badges={
          <>
            <Badge tone={engine.phase === 1 ? "blue" : "amber"}>Phase {engine.phase}</Badge>
            <Badge tone={market.open ? "green" : "amber"} live={market.open}>
              {market.open ? "LIVE" : "CLOSED"}
            </Badge>
            {r.riskCapped && <Badge tone="amber">CAP</Badge>}
          </>
        }
        right={
          <div className="flex items-center gap-3">
            <span className="cockpit-pair">{symbol}</span>
            {live && (
              <TickValue
                value={live.price}
                format={(v) => formatPrice(v, dec)}
                className="cockpit-price"
              />
            )}
          </div>
        }
      />

      {/* ── RISK TELEMETRY ───────────────────────────────────────── */}
      <div className="wgrid-4">
        <Stat
          label="Prop risk (SL hit)"
          value={<CountUp value={-r.cappedPropRisk} format={(v) => money(v)} />}
          tone="c-neg"
          sub={r.riskCapped ? "Cap applied" : `${engine.slPips} pip SL`}
          accessory={r.riskCapped
            ? <Badge tone="amber">CAPPED</Badge>
            : undefined}
        />
        <Stat
          label="Prop reward (TP hit)"
          value={<CountUp value={r.cappedPropRisk * r.rr} format={(v) => money(v, true)} />}
          tone="c-pos"
          sub={`R:R 1:${r.rr}`}
        />
        <Stat
          label="Next Exness target"
          value={<CountUp value={recovery.newExnessWinTarget} format={(v) => money(v, true)} />}
          tone={recovery.adjustmentNeeded ? "c-warn" : "c-pos"}
          sub={recovery.adjustmentNeeded ? "Martingale bump active" : "Base target"}
        />
        <Stat
          label="Drawdown budget left"
          value={<CountUp value={recovery.remainingDrawdown} format={(v) => money(v)} />}
          tone={recovery.remainingDrawdown < r.maxDdUsd * 0.25 ? "c-neg" : "c-acc"}
          sub={`${money(r.maxDdUsd)} max`}
          accessory={
            <Gauge
              pct={Math.max(0, Math.min(1, recovery.remainingDrawdown / r.maxDdUsd))}
              size={40}
              thickness={4}
              tone={recovery.remainingDrawdown < r.maxDdUsd * 0.25 ? "neg" : "accent"}
            />
          }
        />
      </div>

      {/* ── RULES & ALERTS ─────────────────────────────────────── */}
      <RulesAlertPanel />

      {/* ── LIVE MT5 FEED ───────────────────────────────────────── */}
      <Card title="Live MT5 feed" badge={<Badge tone={livePrice.configured ? (live ? "green" : "amber") : "blue"}>{livePrice.configured ? (live ? "LIVE" : "CONNECTING") : "SETUP"}</Badge>}>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Symbol">
            <Select value={engine.pair} onChange={(e) => setEngine({ pair: e.target.value as PairSymbol })}>
              {PAIRS.map((p) => (
                <option key={p} value={p}>{PAIR_SPECS[p].label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Broker symbol sent to MT5">
            <TextInput value={symbol} readOnly className="bg-secondary" />
          </Field>
          <Button onClick={onResumeLive} disabled={livePrice.loading}>
            {livePrice.loading ? "Fetching…" : liveMode ? "Refresh now" : "Resume live price"}
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

      {/* ── INPUTS + MIRROR TICKET ──────────────────────────────── */}
      <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
        <Card
          title="Inputs"
          accent="primary"
          badge={<Badge tone={engine.phase === 1 ? "blue" : "amber"}>Phase {engine.phase}</Badge>}
          loading={livePrice.loading}
        >
          <div className="mb-4">
            <Segmented
              options={[
                { value: 1 as const, label: "Phase 1 — Challenge" },
                { value: 2 as const, label: "Phase 2 — Mega Shield" },
              ]}
              value={engine.phase}
              onChange={(p) => setEngine({ phase: p as 1 | 2 })}
            />
          </div>

          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            <Field
              label="Prop account"
              hint={
                `Target ${money(r.targetUsd)} · DD ${money(r.maxDdUsd)} · ` +
                `${r.winsToPass} wins to pass · ${r.lossesToBlow} losses to blow`
              }
            >
              <Select
                value={engine.selectedAccountId}
                onChange={(e) => {
                  const newId = e.target.value;
                  const newAcct = accounts.find((a) => a.id === newId);
                  const patch: Parameters<typeof setEngine>[0] = { selectedAccountId: newId };
                  // Auto-scale propRiskUsd proportionally so wins/losses ratio stays sane
                  // Base: $5k account = $50 risk. Scale linearly with account size.
                  if (newAcct) {
                    const baseSize = 5000;
                    const baseRisk = 50;
                    const suggested = Math.round((baseRisk * newAcct.size / baseSize) * 100) / 100;
                    // Only suggest — don't override if user already has a scaled value set
                    const currentRatio = engine.propRiskUsd / (selectedAccount?.size ?? baseSize);
                    const baseRatio = baseRisk / baseSize;
                    const isDefaultRatio = Math.abs(currentRatio - baseRatio) < 0.0001;
                    if (isDefaultRatio) patch.propRiskUsd = suggested;
                  }
                  setEngine(patch);
                }}
              >
                {accounts.map((a) => {
                  const targetUsd = (a.size * (a.targetPct ?? 6)) / 100;
                  const ddUsd = (a.size * (a.ddPct ?? 6)) / 100;
                  return (
                    <option key={a.id} value={a.id}>
                      {a.firm} — Target ${targetUsd.toLocaleString()} · DD ${ddUsd.toLocaleString()} · {a.ddType}
                    </option>
                  );
                })}
              </Select>
            </Field>

            {/* ── Account math summary — shows instantly when account changes ── */}
            <div
              className="lg:col-span-2 panel-sunken fx-unfold"
              style={{ padding: "0.6rem 0.8rem" }}
            >
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <div className="kv" style={{ gap: "0.35rem" }}>
                  <span className="kv-label">Target</span>
                  <span className="kv-value c-pos">{money(r.targetUsd)}</span>
                </div>
                <div className="kv" style={{ gap: "0.35rem" }}>
                  <span className="kv-label">Max DD</span>
                  <span className="kv-value c-neg">{money(r.maxDdUsd)}</span>
                </div>
                <div className="kv" style={{ gap: "0.35rem" }}>
                  <span className="kv-label">Wins to pass</span>
                  <span className="kv-value c-acc" style={{ fontWeight: 800, fontSize: "1.05em" }}>
                    {r.winsToPass}
                  </span>
                </div>
                <div className="kv" style={{ gap: "0.35rem" }}>
                  <span className="kv-label">Losses to blow</span>
                  <span className="kv-value c-neg" style={{ fontWeight: 800, fontSize: "1.05em" }}>
                    {r.lossesToBlow}
                  </span>
                </div>
                <div className="kv" style={{ gap: "0.35rem" }}>
                  <span className="kv-label">Win per trade</span>
                  <span className="kv-value">{money(r.cappedPropRisk * r.rr, true)}</span>
                </div>
                <div className="kv" style={{ gap: "0.35rem" }}>
                  <span className="kv-label">Prop fee</span>
                  <span className="kv-value">{money(selectedAccount.fee)}</span>
                </div>
                {r.riskCapped && (
                  <Badge tone="amber">Daily cap active — risk reduced to {money(r.cappedPropRisk)}</Badge>
                )}
              </div>
            </div>

            <Field label="Prop risk per trade ($)">
              <TextInput type="number" step="0.01" value={engine.propRiskUsd} onChange={(e) => setEngine({ propRiskUsd: Number(e.target.value) })} />
            </Field>
            <Field label="R:R rotation (1:1.5 – 1:3)">
              <Select value={engine.rr} onChange={(e) => setEngine({ rr: Number(e.target.value) })}>
                <option value={1.5}>1 : 1.5</option>
                <option value={2}>1 : 2</option>
                <option value={2.5}>1 : 2.5</option>
                <option value={3}>1 : 3</option>
              </Select>
            </Field>
            <Field label="Prop stop loss (pips)">
              <TextInput type="number" step="1" value={engine.slPips} onChange={(e) => setEngine({ slPips: Number(e.target.value) })} />
            </Field>
            <Field label="Desired profit on blow ($)">
              <TextInput type="number" step="1" value={engine.desiredProfit} onChange={(e) => setEngine({ desiredProfit: Number(e.target.value) })} />
            </Field>
            <Field label="Safety buffer (%)" hint="Spread / slippage cushion">
              <TextInput type="number" step="1" value={engine.bufferPct} onChange={(e) => setEngine({ bufferPct: Number(e.target.value) })} />
            </Field>
            <Field label="Prop direction">
              <Select value={engine.direction} onChange={(e) => setEngine({ direction: e.target.value as Direction })}>
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </Select>
            </Field>
            <Field label="Exness account type">
              <Select value={engine.exnessAccountType} onChange={(e) => setEngine({ exnessAccountType: e.target.value as ExnessAccountType })}>
                <option value="Cent">Cent</option>
                <option value="Standard">Standard</option>
              </Select>
            </Field>
            <Field label="Actual Exness balance ($)" hint="Your live Exness account balance (overrides calculated)">
              <ActualExnessBalance />
            </Field>
            <Field
              label="Entry price"
              hint={
                livePrice.error && liveMode
                  ? `Live price unavailable: ${livePrice.error}`
                  : !liveMode
                    ? "Paused on your typed value — click Resume live price to track the market again"
                    : live
                      ? `${live.label} (updating automatically)`
                      : "Add MetaApi credentials in Settings for a live price, or type one"
              }
            >
              <TextInput
                type="number"
                step={engine.pair === "USDJPY" ? "0.001" : "0.00001"}
                value={engine.entryPrice}
                onChange={(e) => {
                  setLiveMode(false);
                  setEngine({ entryPrice: Number(e.target.value) });
                }}
              />
            </Field>
            {engine.phase === 2 && (
              <>
                <Field label="Phase 1 total spent ($)" hint={`Auto: ${money(r.phase1TotalSpent)}`}>
                  <TextInput type="number" step="0.01" value={engine.carryPhase1TotalSpent ?? Number(r.phase1TotalSpent.toFixed(2))} onChange={(e) => setEngine({ carryPhase1TotalSpent: Number(e.target.value) })} />
                </Field>
                <Field label="Phase 1 leftover Exness ($)">
                  <TextInput type="number" step="0.01" value={engine.carryPhase1Leftover ?? Number(r.phase1Leftover.toFixed(2))} onChange={(e) => setEngine({ carryPhase1Leftover: Number(e.target.value) })} />
                </Field>
              </>
            )}
          </div>
        </Card>

        {/* ── MIRROR TICKET ──────────────────────────────────────── */}
        <div className="space-y-5 w-full">
          <Card title="Mirror ticket" accent="highlight" flush>
            {/* Mobile: kv layout */}
            <div className="sm:hidden" style={{ padding: "0.7rem" }}>
              {[
                { label: "Direction", prop: r.propDirection, ex: r.exnessDirection, isDir: true },
                { label: "Lot size (MT5)", prop: r.propLots.toFixed(2), ex: r.exnessLots.toFixed(2), isDir: false },
                { label: "SL / TP pips", prop: `${r.propSlPips} / ${r.propTpPips}`, ex: `${r.exnessSlPips} / ${r.exnessTpPips}`, isDir: false },
                { label: "Entry", prop: formatPrice(r.entryPrice, dec), ex: formatPrice(r.entryPrice, dec), isDir: false },
                { label: "Stop loss", prop: formatPrice(r.propSl, dec), ex: formatPrice(r.exnessSl, dec), isDir: false },
                { label: "Take profit", prop: formatPrice(r.propTp, dec), ex: formatPrice(r.exnessTp, dec), isDir: false },
              ].map(({ label, prop, ex, isDir }) => (
                <div key={label} className="kv" style={{ borderBottom: "1px solid oklch(var(--gz-p) / 0.07)", padding: "5px 0" }}>
                  <span className="kv-label">{label}</span>
                  <div className="flex gap-4 font-mono text-[11px]">
                    {isDir ? <DirectionChip dir={prop} /> : <span className="c-acc">{prop}</span>}
                    {isDir ? <DirectionChip dir={ex} /> : <span className="c-pos">{ex}</span>}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: DataGrid */}
            <div className="hidden sm:block">
              <DataGrid
                head={[
                  { label: "Field" },
                  { label: "Prop firm", align: "right" },
                  { label: `Exness ${engine.exnessAccountType.toLowerCase()}`, align: "right" },
                ]}
              >
                <tr>
                  <td className="lead">Direction</td>
                  <td className="num"><DirectionChip dir={r.propDirection} /></td>
                  <td className="num"><DirectionChip dir={r.exnessDirection} /></td>
                </tr>
                <tr>
                  <td className="lead">Lot size (MT5)</td>
                  <td className="num c-acc">{r.propLots.toFixed(2)}</td>
                  <td className="num c-pos">{r.exnessLots.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="lead">SL / TP pips</td>
                  <td className="num">{r.propSlPips} / {r.propTpPips}</td>
                  <td className="num">{r.exnessSlPips} / {r.exnessTpPips}</td>
                </tr>
                <tr>
                  <td className="lead">Entry</td>
                  <td className="num">{formatPrice(r.entryPrice, dec)}</td>
                  <td className="num">{formatPrice(r.entryPrice, dec)}</td>
                </tr>
                <tr>
                  <td className="lead">Stop loss</td>
                  <td className="num c-neg">{formatPrice(r.propSl, dec)}</td>
                  <td className="num c-neg">{formatPrice(r.exnessSl, dec)}</td>
                </tr>
                <tr>
                  <td className="lead">Take profit</td>
                  <td className="num c-pos">{formatPrice(r.propTp, dec)}</td>
                  <td className="num c-pos">{formatPrice(r.exnessTp, dec)}</td>
                </tr>
              </DataGrid>
            </div>
            {Number(r.exnessLots.toFixed(2)) < 0.01 && (
              <div className="alert alert-red" style={{ margin: "0.5rem 0.7rem" }}>
                <p className="alert-title">Lot size too small</p>
                <p className="alert-body">Exness lot rounds to 0.00 — below the 0.01 broker minimum. Raise the desired profit on blow, lower prop risk, or use a Cent account.</p>
              </div>
            )}
            {engine.exnessAccountType === "Cent" && (
              <p className="mono-cap" style={{ padding: "0 0.7rem 0.7rem", color: "oklch(var(--gz-p))" }}>
                Cent lots (1/100 standard); pip value ${r.exnessPipValue.toFixed(2)}
              </p>
            )}
          </Card>

          {/* ── RISK PER TRADE ──────────────────────────────────── */}
          <Card title="Risk per trade">
            <Row label="Prop risk (SL hit)" value={money(-r.cappedPropRisk)} tone="neg" />
            <Row label="Prop reward (TP hit)" value={money(r.cappedPropRisk * r.rr, true)} tone="pos" />
            {r.riskCapped && (
              <div className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 p-2 text-[10px] text-amber-400">
                Daily profit cap active — Prop Risk reduced from ${engine.propRiskUsd.toFixed(2)} to ${r.cappedPropRisk.toFixed(2)} so the ${money(r.cappedPropRisk * r.rr)} reward stays under the ${money(selectedAccount.dailyProfitCap ?? 0)} daily cap.
              </div>
            )}
            <Row
              label={recovery.adjustmentNeeded ? "Base Exness win target" : "Exness reward (prop loses)"}
              value={money(recovery.baseExnessWinTarget, true)}
              tone={recovery.adjustmentNeeded ? "default" : "pos"}
            />
            {recovery.adjustmentNeeded && (
              <Row label="Slippage debt (martingale bump)" value={money(recovery.slippageDebt, true)} tone="accent" />
            )}
            <Row
              label={recovery.adjustmentNeeded ? "Next Exness target" : "Exness reward (prop loses)"}
              value={money(recovery.newExnessWinTarget, true)}
              tone={recovery.adjustmentNeeded ? "accent" : "pos"}
              strong
            />
            <Row
              label={recovery.adjustmentNeeded ? "Next Exness risk (prop wins)" : "Exness risk (prop wins)"}
              value={money(-recovery.newExnessLossTarget)}
              tone={recovery.adjustmentNeeded ? "accent" : "neg"}
            />
            <Row label="Wins remaining (actual)" value={`${recovery.remainingWins} of ${r.winsToPass}`} tone="accent" />
            <Row label="Losses remaining (actual)" value={`${recovery.remainingLosses} of ${r.lossesToBlow}`} tone="accent" />
            <Row label="Remaining prop target" value={money(recovery.remainingPropTarget)} tone={recovery.challengePassed ? "pos" : "default"} />
            <Row label="Remaining drawdown budget" value={money(recovery.remainingDrawdown)} tone={recovery.remainingDrawdown < r.maxDdUsd * 0.25 ? "neg" : "default"} />
          </Card>
        </div>
      </div>

      {/* ── CAPITAL NEEDED ──────────────────────────────────────── */}
      <Card title="Total capital needed" badge={<Badge tone="amber">R:R 1:{r.rr}</Badge>}>
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
          <Row label={recovery.adjustmentNeeded ? "Exness fuel — dynamic (martingale)" : "Exness fuel required (buffered)"} value={money(recovery.dynamicExnessCapital)} tone="accent" />
          {engine.phase === 2 && (
            <Row label="Phase 2 refill required" value={money(r.phase2RefillRequired)} tone="accent" />
          )}
          <Row label="Prop payout at target" value={money(r.propPayout, true)} tone="pos" />
          <Row label="Net profit if passed" value={money(r.netProfitIfPassed, true)} tone={r.netProfitIfPassed >= 20 ? "pos" : "neg"} />
        </div>
        {recovery.adjustmentNeeded && (
          <p className="mt-2 text-[10px] text-amber-400">
            Martingale bump active — Exness fuel increased from {money(r.phase === 1 ? r.phase1.bufferedExnessCapital : r.phase2.bufferedExnessCapital)} to <strong>{money(recovery.dynamicExnessCapital)}</strong> to cover the slippage debt of {money(recovery.slippageDebt)} + the {r.bufferPct}% buffer.
          </p>
        )}
        <div className="mt-3 rounded border border-border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Row label={recovery.challengePassed ? "Exness fuel exhausted (final)" : "Exness fuel exhausted (so far)"} value={money(recovery.exnessFuelExhausted)} tone="neg" />
            <Row label="Prop fee" value={money(recovery.propFee)} tone="neg" />
            <Row label={recovery.challengePassed ? "Total money lost (final)" : "Total money lost (so far)"} value={money(recovery.totalMoneyLost)} tone="neg" strong />
            <Row label={recovery.challengePassed ? "Net result after payout (final)" : "Net result if passed now"} value={money(recovery.netResultAfterPayout, true)} tone={recovery.netResultAfterPayout >= 0 ? "pos" : "neg"} />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Real cash spent: the prop fee plus the net Exness fuel burn. Money still sitting in the Exness tank ({money(recovery.actualExnessBalance)}) is returnable principal, not lost.
          </p>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Capital is sized for the selected R:R (currently 1:{engine.rr}). Switching the R:R selector dynamically recalculates the fuel requirement. Buffer applied: {engine.bufferPct}%.
        </p>
      </Card>

      {/* ── AUTOMATED EXECUTION ────────────────────────────────── */}
      <Card
        title="Automated execution"
        badge={<Badge tone={market.open ? "green" : "amber"}>{market.open ? "Market open" : "Market closed"}</Badge>}
      >
        <Alert level={r.verdict.level} title={r.verdict.title}>
          {r.verdict.detail}
        </Alert>

        {recovery.challengePassed && (
          <Alert level="green" title="Challenge Passed — Request your payout">
            Prop target reached ({money(recovery.totalPropProfitLogged, true)} logged). Total money lost over the run: <strong>{money(recovery.totalMoneyLost)}</strong> — Exness fuel exhausted {money(recovery.exnessFuelExhausted)} plus the {money(recovery.propFee)} prop fee. Net result after payout: <strong>{money(recovery.netResultAfterPayout, true)}</strong>. Exness balance: {money(recovery.actualExnessBalance)} (returnable). Switch to Phase 2 (Mega Shield) for the Funded Stage.
          </Alert>
        )}

        {recovery.bufferDepleted && !recovery.challengePassed && (
          <Alert level="red" title="CRITICAL: Exness Buffer Depleted">
            Current Exness balance ({money(recovery.actualExnessBalance)}) is below what's needed to finish the remaining {recovery.remainingWins} prop win(s). Deposit <strong>{money(recovery.depositNeeded)}</strong> to maintain the zero-loss loop.
          </Alert>
        )}

        {recovery.adjustmentNeeded && !recovery.challengePassed && (
          <Alert level="amber" title="Martingale bump active">
            Slippage debt <strong>{money(recovery.slippageDebt)}</strong> is added to the next Exness win target ({money(recovery.baseExnessWinTarget)} → {money(recovery.newExnessWinTarget, true)}). Lot size and Exness fuel are already adjusted. The very next Exness win (prop loss) will wipe the debt and revert the target to {money(recovery.baseExnessWinTarget)}.
          </Alert>
        )}

        <div className={`mt-3 rounded border p-3 text-[11px] ${market.open ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/10"}`}>
          <p>
            <span className={market.open ? "font-semibold text-success" : "font-semibold text-warning"}>
              {market.open ? "Trades will execute." : "Trades will not execute."}
            </span>{" "}
            {market.detail}
          </p>
          <p className="mt-1 text-muted-foreground">
            {market.open ? "Market closes" : "Market reopens"} {market.changesIn} — {market.changesAt.toUTCString().slice(0, 22)} UTC.
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button onClick={() => void onExecute("exness")} disabled={busy !== null || r.verdict.level === "red" || !market.open}>
            {busy === "trade" ? "Placing…" : `Execute Exness ${r.exnessDirection} ${r.exnessLots.toFixed(2)}`}
          </Button>
          <Button variant="ghost" onClick={() => void onExecute("prop")} disabled={busy !== null || r.verdict.level === "red" || !market.open || !meta.propAccountId} title={meta.propAccountId ? "Place the prop leg of the hedge" : "Add your prop firm's MetaApi account ID in Settings to place this leg"}>
            {busy === "trade-prop" ? "Placing…" : `Execute prop ${r.propDirection} ${r.propLots.toFixed(2)}`}
          </Button>
        </div>
        {!meta.propAccountId && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Only the Exness leg can be placed — add your prop firm's MetaApi account ID in Settings to enable the prop leg. Each leg is placed separately so you stay in control of the order they go on.
          </p>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Order type is resolved from the mirrored direction versus the live market price (BUY/SELL LIMIT or STOP). Fetch the live price first; the trade is logged to the journal on success.
        </p>
      </Card>
    </div>
  );
}
