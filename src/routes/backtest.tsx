import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Alert, Badge, Button, Card, Field, TextInput } from "@/components/terminal/ui";
import { runBacktest, type BacktestResult, type SimTrade } from "@/lib/backtest-engine";
import { fetchHistoricalCandles } from "@/lib/metaapi.functions";
import { loadStrategyRules, type StrategyRule } from "@/lib/hermes-db.functions";
import { placePendingOrder } from "@/lib/metaapi.functions";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [{ title: "Backtest — GizzyFx" }],
  }),
  component: BacktestPage,
});

/* ── helpers ──────────────────────────────────────────────────── */

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
type TF = (typeof TIMEFRAMES)[number];

const PAIRS = ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "XAUUSD"] as const;

function fmtDate(unix: number) {
  return new Date(unix * 1000).toISOString().slice(0, 16).replace("T", " ");
}

function resultBadge(r: SimTrade["result"]) {
  if (r === "win") return <Badge tone="green">WIN</Badge>;
  if (r === "loss") return <Badge tone="red">LOSS</Badge>;
  return <Badge tone="neutral">BE</Badge>;
}

/* ── component ────────────────────────────────────────────────── */

function BacktestPage() {
  const { meta } = useStore();

  /* Strategy rules from DB */
  const [rules, setRules] = useState<StrategyRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");

  /* Form state */
  const [pair, setPair] = useState<string>("EURUSD");
  const [timeframe, setTimeframe] = useState<TF>("1h");
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10),
  );
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [spreadPips, setSpreadPips] = useState("1.0");
  const [slippagePips, setSlippagePips] = useState("0.5");
  const [commissionPerMicroLot, setCommissionPerMicroLot] = useState("0.07");
  const [lotSize, setLotSize] = useState("0.01");
  const [startingEquity, setStartingEquity] = useState("10000");

  /* Forward-test mode */
  const [forwardTest, setForwardTest] = useState(false);
  const [ftBusy, setFtBusy] = useState(false);

  /* Progress & result */
  const [phase, setPhase] = useState<"idle" | "fetching" | "simulating" | "done" | "error">(
    "idle",
  );
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Load strategy rules */
  useEffect(() => {
    loadStrategyRules().then(setRules).catch(() => {});
  }, []);

  const selectedRule = rules.find((r) => r.id === selectedRuleId);

  /* ── Run backtest ───────────────────────────────────────────── */
  async function handleRun() {
    if (!selectedRule) { toast.error("Select a strategy rule first."); return; }
    if (selectedRule.entry_type === "custom") {
      toast.error(
        "This is a discretionary strategy — use the Trading Agent to judge trades, not the mechanical engine.",
      );
      return;
    }

    setError(null);
    setResult(null);
    setPhase("fetching");
    setProgress("Fetching historical candles from MetaApi…");

    // Need token + accountId to call MetaApi history
    if (!meta.token || !meta.exnessAccountId) {
      setPhase("error");
      setError("Set your MetaApi token and account ID in Settings first.");
      return;
    }

    const from = new Date(fromDate).toISOString();
    const to   = new Date(toDate + "T23:59:59Z").toISOString();

    const candleRes = await fetchHistoricalCandles({
      data: {
        token: meta.token,
        accountId: meta.exnessAccountId,
        symbol: pair + (meta.exnessSymbolSuffix ?? ""),
        timeframe,
        from,
        to,
        limit: 50_000,
      },
    });

    if (!candleRes.ok) {
      setPhase("error");
      setError(`Failed to fetch candles: ${candleRes.error}`);
      return;
    }

    const bars = candleRes.data;
    setProgress(`Running simulation over ${bars.length} bars…`);
    setPhase("simulating");

    try {
      const bt = await runBacktest({
        data: {
          bars,
          rule: {
            entry_type:   selectedRule.entry_type as any,
            entry_params: (typeof selectedRule.entry_params === "string"
                ? JSON.parse(selectedRule.entry_params || "{}")
                : selectedRule.entry_params) as Record<string, number> ?? {},
            custom_rules: selectedRule.custom_rules ?? undefined,
            direction:    selectedRule.direction as any,
            sl_type:      selectedRule.sl_type as any,
            sl_value:     selectedRule.sl_value,
            tp_type:      selectedRule.tp_type as any,
            tp_value:     selectedRule.tp_value,
          },
          config: {
            spreadPips:            parseFloat(spreadPips)             || 1.0,
            slippagePips:          parseFloat(slippagePips)           || 0.5,
            commissionPerMicroLot: parseFloat(commissionPerMicroLot) || 0.07,
            lotSize:               parseFloat(lotSize)                || 0.01,
            pipValuePerLot:        10,
            startingEquity:        parseFloat(startingEquity)         || 10_000,
          },
          periodDescription: `${pair} ${timeframe.toUpperCase()} ${fromDate} → ${toDate}`,
        },
      });
      setResult(bt);
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Backtest failed");
    }
  }

  /* ── Forward test: place real demo orders from last N signals ── */
  async function handleForwardTest() {
    if (!result || result.trades.length === 0) {
      toast.error("Run a backtest first.");
      return;
    }
    if (!meta.token || !meta.exnessAccountId) {
      toast.error("Set MetaApi credentials in Settings.");
      return;
    }
    if (!selectedRule) return;

    // Place the most recent signal as a live demo pending order
    const lastTrade = result.trades[result.trades.length - 1];
    if (!lastTrade) { toast.error("No trades in backtest result."); return; }
    const symbol = pair + (meta.exnessSymbolSuffix ?? "");
    const actionType =
      lastTrade.direction === "long" ? "ORDER_TYPE_BUY_STOP" : "ORDER_TYPE_SELL_STOP";

    setFtBusy(true);
    const res = await placePendingOrder({
      data: {
        token:      meta.token,
        accountId:  meta.exnessAccountId,
        actionType,
        symbol,
        volume:     parseFloat(lotSize) || 0.01,
        openPrice:  lastTrade.tp, // re-entry near last TP level
        stopLoss:   lastTrade.sl,
        takeProfit: lastTrade.tp,
        comment:    `GizzyFx BT ${selectedRule.title.slice(0, 10)}`,
      },
    });
    setFtBusy(false);
    if (res.ok) {
      toast.success(`Demo order placed — ID: ${res.data.orderId}`);
    } else {
      toast.error(`Order failed: ${res.error}`);
    }
  }

  /* ── Stats summary ─────────────────────────────────────────── */
  const s = result?.stats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Backtest</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Run a deterministic bar-by-bar simulation against real MetaApi broker history, then
          optionally forward-test on the connected demo account.
        </p>
      </div>

      {/* ── CONFIGURATION ─────────────────────────────────────── */}
      <Card title="Configuration">
        <div className="grid gap-4">
          {/* Strategy picker */}
          <Field label="Strategy rule" hint="Only mechanical (non-custom) rules can run deterministically.">
            <select
              className="w-full rounded-md border border-white/10 bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              value={selectedRuleId}
              onChange={(e) => setSelectedRuleId(e.target.value)}
            >
              <option value="">— select a strategy —</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id} disabled={r.entry_type === "custom"}>
                  {r.title}
                  {r.entry_type === "custom" ? " (custom — agent only)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Symbol */}
            <Field label="Symbol">
              <select
                className="w-full rounded-md border border-white/10 bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                value={pair}
                onChange={(e) => setPair(e.target.value)}
              >
                {PAIRS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>

            {/* Timeframe */}
            <Field label="Timeframe">
              <select
                className="w-full rounded-md border border-white/10 bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as TF)}
              >
                {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="From">
              <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </Field>
            <Field label="To">
              <TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </Field>
          </div>

          {/* Execution parameters */}
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Execution parameters (spread / slippage / commission)
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Spread (pips)">
                <TextInput value={spreadPips} onChange={(e) => setSpreadPips(e.target.value)} />
              </Field>
              <Field label="Slippage (pips)">
                <TextInput value={slippagePips} onChange={(e) => setSlippagePips(e.target.value)} />
              </Field>
              <Field label="Commission / 0.01 lot (USD)">
                <TextInput value={commissionPerMicroLot} onChange={(e) => setCommissionPerMicroLot(e.target.value)} />
              </Field>
              <Field label="Lot size">
                <TextInput value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
              </Field>
              <Field label="Starting equity (USD)">
                <TextInput value={startingEquity} onChange={(e) => setStartingEquity(e.target.value)} />
              </Field>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={phase === "fetching" || phase === "simulating" || !selectedRuleId}
              onClick={handleRun}
            >
              {phase === "fetching"   ? "Fetching candles…"
               : phase === "simulating" ? "Simulating…"
               : "Run Backtest"}
            </Button>

            {result && (
              <label className="flex items-center gap-2 text-[13px] text-muted-foreground select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={forwardTest}
                  onChange={(e) => setForwardTest(e.target.checked)}
                  className="accent-primary"
                />
                Forward-test on demo account
              </label>
            )}

            {result && forwardTest && (
              <Button variant="ghost" disabled={ftBusy} onClick={handleForwardTest}>
                {ftBusy ? "Placing order…" : "Place demo order from last signal"}
              </Button>
            )}
          </div>

          {/* Progress */}
          {(phase === "fetching" || phase === "simulating") && (
            <p className="text-[12px] text-muted-foreground animate-pulse">{progress}</p>
          )}
          {phase === "error" && error && <Alert level="red" title="Error">{error}</Alert>}
        </div>
      </Card>

      {/* ── RESULTS ───────────────────────────────────────────── */}
      {result && s && (
        <>
          {/* Summary stats */}
          <Card title="Summary">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Trades",        s.totalTrades.toString()],
                ["Win Rate",      `${(s.winRate * 100).toFixed(1)}%`],
                ["Net PnL",       `$${s.netProfit.toFixed(2)}`],
                ["Profit Factor", isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"],
                ["Max Drawdown",  `${s.maxDrawdownPct.toFixed(2)}%`],
                ["Avg R:R",       s.avgRR.toFixed(2)],
                ["Sharpe",        s.sharpeRatio.toFixed(2)],
                ["Final Equity",  `$${s.finalEquity.toFixed(2)}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/8 bg-white/4 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
                  <p className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[12px] text-muted-foreground leading-relaxed">
              {result.narrative}
            </p>
          </Card>

          {/* Equity curve */}
          <Card title="Equity Curve">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(t) => new Date(t * 1000).toLocaleDateString()}
                    tick={{ fontSize: 10, fill: "#8b949e" }}
                    stroke="#30363d"
                  />
                  <YAxis
                    tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                    tick={{ fontSize: 10, fill: "#8b949e" }}
                    stroke="#30363d"
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8 }}
                    labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString()}
                    formatter={(v: number) => [`$${v.toFixed(2)}`, "Equity"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="oklch(var(--gz-p))"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Trade log */}
          <Card title={`Trade Log — ${result.trades.length} trades`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] tabular-nums">
                <thead>
                  <tr className="border-b border-white/8 text-left text-muted-foreground">
                    {["Entry", "Exit", "Dir", "Entry Px", "Exit Px", "SL", "TP", "PnL (pips)", "PnL (USD)", "Result"].map(
                      (h) => <th key={h} className="pb-2 pr-4 font-medium">{h}</th>,
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-b border-white/4 hover:bg-white/2">
                      <td className="py-1.5 pr-4">{fmtDate(t.entryTime)}</td>
                      <td className="py-1.5 pr-4">{fmtDate(t.exitTime)}</td>
                      <td className="py-1.5 pr-4">
                        <Badge tone={t.direction === "long" ? "green" : "red"}>
                          {t.direction.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-4">{t.entryPrice.toFixed(5)}</td>
                      <td className="py-1.5 pr-4">{t.exitPrice.toFixed(5)}</td>
                      <td className="py-1.5 pr-4">{t.sl.toFixed(5)}</td>
                      <td className="py-1.5 pr-4">{t.tp.toFixed(5)}</td>
                      <td className={["py-1.5 pr-4", t.pnlPips >= 0 ? "text-success" : "text-destructive"].join(" ")}>
                        {t.pnlPips >= 0 ? "+" : ""}{t.pnlPips.toFixed(1)}
                      </td>
                      <td className={["py-1.5 pr-4", t.pnlUsd >= 0 ? "text-success" : "text-destructive"].join(" ")}>
                        {t.pnlUsd >= 0 ? "+" : ""}${t.pnlUsd.toFixed(2)}
                      </td>
                      <td className="py-1.5">{resultBadge(t.result)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
