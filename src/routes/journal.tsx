import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, Card, Field, Select, Stat, TextInput } from "@/components/terminal/ui";
import { money, tradePnl, type Direction } from "@/lib/engine/calc";
import { PAIRS } from "@/lib/engine/pairs";
import { fetchOpenState } from "@/lib/metaapi.functions";
import { useStore, type JournalTrade } from "@/lib/store";
import { useEngineWithRecovery } from "@/lib/useEngine";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trading Journal — GizzyFx" },
      {
        name: "description",
        content:
          "Automated hedge journal: prop and Exness P&L derived from live engine values, with equity curve, win rate and profit factor.",
      },
      { property: "og:title", content: "Trading Journal — GizzyFx" },
      {
        property: "og:description",
        content: "Log each mirrored trade and watch net P&L, win rate and profit factor update instantly.",
      },
    ],
  }),
  component: JournalPage,
});

/* ── Live P&L hook for OPEN journal trades ──────────────────────────────── */

/**
 * Polls MetaApi every 10 seconds for open positions and returns a map of
 * { journalTradeId → live floating profit (USD) }.
 *
 * Matches journal trades to MetaApi positions by normalising the symbol
 * (strip broker suffix, e.g. "EURUSDm" → "EURUSD") and direction.
 */
function useLiveOpenPnl(
  openTrades: JournalTrade[],
  token: string,
  exnessAccountId: string,
  exnessSymbolSuffix: string,
  pollMs = 10_000,
): Map<string, number> {
  const [liveMap, setLiveMap] = useState<Map<string, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!token || !exnessAccountId || openTrades.length === 0) {
      setLiveMap(new Map());
      return;
    }
    const res = await fetchOpenState({ data: { token, accountId: exnessAccountId } });
    if (!res.ok) return;

    const positions = res.data.positions;

    // Build map: normalised symbol+dir → live profit
    const posMap = new Map<string, number>();
    for (const p of positions) {
      const sym = p.symbol.replace(new RegExp(`${exnessSymbolSuffix}$`), "").toUpperCase();
      const dir = p.type.includes("BUY") ? "LONG" : "SHORT";
      const key = `${sym}|${dir}`;
      // Accumulate if multiple lots on same symbol/dir
      posMap.set(key, (posMap.get(key) ?? 0) + p.profit);
    }

    // Match to journal trades
    const next = new Map<string, number>();
    for (const t of openTrades) {
      const key = `${t.pair.toUpperCase()}|${t.dir}`;
      if (posMap.has(key)) {
        next.set(t.id, posMap.get(key)!);
      }
    }
    setLiveMap(next);
  }, [token, exnessAccountId, exnessSymbolSuffix, openTrades]);

  useEffect(() => {
    void poll();
    timerRef.current = setInterval(() => void poll(), pollMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll, pollMs]);

  return liveMap;
}

/* ── Component ──────────────────────────────────────────────────────────── */

function JournalPage() {
  const { journal, addTrade, updateTrade, deleteTrade, clearJournal, engine, meta } = useStore();
  const { result: r, recovery } = useEngineWithRecovery();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pair, setPair] = useState<string>(engine.pair);
  const [dir, setDir] = useState<Direction>(engine.direction);
  const [actualPropPnl, setActualPropPnl] = useState("");
  const [actualExPnl, setActualExPnl] = useState("");

  // Settle a specific open trade with exact PnL override
  const [settleId, setSettleId] = useState<string | null>(null);
  const [settlePropPnl, setSettlePropPnl] = useState("");
  const [settleExPnl, setSettleExPnl] = useState("");

  const openTrades = journal.filter((t) => t.result === "OPEN");
  const liveMap = useLiveOpenPnl(
    openTrades,
    meta.token,
    meta.exnessAccountId,
    meta.exnessSymbolSuffix ?? "",
  );

  function log(result: "WIN" | "LOSS") {
    const derived = tradePnl(r, result === "WIN", engine.rr);
    const propPnl = actualPropPnl !== "" ? Number(actualPropPnl) : derived.propPnl;
    const exPnl = actualExPnl !== "" ? Number(actualExPnl) : derived.exPnl;
    const netPnl = propPnl + exPnl;
    const now = new Date();
    addTrade({
      id: `${now.getTime()}`,
      date,
      time: now.toTimeString().slice(0, 8),
      pair,
      dir,
      result,
      propPnl,
      exPnl,
      netPnl,
      details: {
        entry: r.entryPrice,
        propSl: r.propSl,
        propTp: r.propTp,
        exSl: r.exnessSl,
        exTp: r.exnessTp,
        propLots: r.propLots,
        exLots: r.exnessLots,
        rr: engine.rr,
        phase: r.phase,
      },
    });
    setActualPropPnl("");
    setActualExPnl("");
    toast.success(`${result} logged — net ${money(netPnl, true)}`);
  }

  function settle(trade: JournalTrade, result: "WIN" | "LOSS") {
    if (settleId === trade.id && (settlePropPnl !== "" || settleExPnl !== "")) {
      // Use exact values from the inline form
      const propPnl = settlePropPnl !== "" ? Number(settlePropPnl) : trade.propPnl;
      const exPnl = settleExPnl !== "" ? Number(settleExPnl) : trade.exPnl;
      const netPnl = propPnl + exPnl;
      updateTrade(trade.id, { result, propPnl, exPnl, netPnl });
      toast.success(`Settled as ${result} — net ${money(netPnl, true)}`);
    } else {
      // Derive from engine
      const rr = trade.details?.rr ?? engine.rr;
      const derived = tradePnl(r, result === "WIN", rr);
      updateTrade(trade.id, {
        result,
        propPnl: derived.propPnl,
        exPnl: derived.exPnl,
        netPnl: derived.netPnl,
      });
      toast.success(`Settled as ${result}`);
    }
    setSettleId(null);
    setSettlePropPnl("");
    setSettleExPnl("");
  }

  const closed = journal.filter((t) => t.result !== "OPEN");
  const wins = closed.filter((t) => t.result === "WIN");
  const losses = closed.filter((t) => t.result === "LOSS");
  const net = closed.reduce((s, t) => s + t.netPnl, 0);
  const gross = closed.filter((t) => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(closed.filter((t) => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0));
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? gross / grossLoss : gross > 0 ? Infinity : 0;

  let running = 0;
  const curve = closed.map((t, i) => {
    running += t.netPnl;
    return { i: i + 1, equity: Number(running.toFixed(2)) };
  });

  const distribution = [
    { name: "Wins", value: wins.length, fill: "var(--color-success)" },
    { name: "Losses", value: losses.length, fill: "var(--color-destructive)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Journal</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          P&amp;L is derived automatically from the live engine state (risk {money(engine.propRiskUsd)}, R:R 1:
          {engine.rr}). Open trades show live floating P&amp;L from MetaApi (refreshes every 10s).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Closed trades" value={closed.length} />
        <Stat label="Win rate" value={`${winRate.toFixed(1)}%`} tone="text-primary" />
        <Stat
          label="Net P&L"
          value={money(net, true)}
          tone={net >= 0 ? "text-success" : "text-destructive"}
        />
        <Stat
          label="Profit factor"
          value={Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞"}
          tone="text-primary"
        />
      </div>

      <Card title="Log a trade">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Pair">
            <Select value={pair} onChange={(e) => setPair(e.target.value)}>
              {PAIRS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prop direction">
            <Select value={dir} onChange={(e) => setDir(e.target.value as Direction)}>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button variant="success" onClick={() => log("WIN")}>
              Log win
            </Button>
            <Button variant="danger" onClick={() => log("LOSS")}>
              Log loss
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Override actual P&amp;L below (leave blank to use engine values):
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Actual Prop P&L ($)" hint="e.g. +125.00 or -62.50">
            <TextInput
              type="number"
              step="0.01"
              value={actualPropPnl}
              onChange={(e) => setActualPropPnl(e.target.value)}
              placeholder={`engine: ${money(tradePnl(r, true, engine.rr).propPnl, true)}`}
            />
          </Field>
          <Field label="Actual Exness P&L ($)" hint="e.g. -250.00 or +125.00">
            <TextInput
              type="number"
              step="0.01"
              value={actualExPnl}
              onChange={(e) => setActualExPnl(e.target.value)}
              placeholder={`engine: ${money(tradePnl(r, true, engine.rr).exPnl, true)}`}
            />
          </Field>
        </div>
      </Card>

      <Card title="Next steps">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Wins remaining" value={recovery.remainingWins} />
          <Stat label="Losses remaining" value={recovery.remainingLosses} />
          <Stat
            label="Exness balance"
            value={money(recovery.actualExnessBalance)}
            tone={recovery.actualExnessBalance >= 0 ? "text-success" : "text-destructive"}
          />
          <Stat
            label={recovery.adjustmentNeeded ? "Adjusted win target ⚡" : "Win target"}
            value={money(recovery.newExnessWinTarget ?? r.exnessWinTarget)}
            tone={recovery.adjustmentNeeded ? "text-amber-400" : undefined}
          />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[12px] text-muted-foreground">
          <div>Prop profit logged: <span className="text-success font-mono">{money(recovery.totalPropProfitLogged, true)}</span></div>
          <div>Prop loss logged: <span className="text-destructive font-mono">{money(-recovery.totalPropLossLogged)}</span></div>
          <div>Remaining target: <span className="font-mono text-foreground">{money(recovery.remainingPropTarget)}</span></div>
          <div>Remaining drawdown: <span className={`font-mono ${recovery.remainingDrawdown < r.maxDdUsd * 0.25 ? "text-destructive" : "text-foreground"}`}>{money(recovery.remainingDrawdown)}</span></div>
        </div>

        {/* Challenge passed */}
        {recovery.challengePassed && (
          <p className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12px] text-success font-semibold">
            🎉 Challenge Passed! Request your payout. Switch to Phase 2 (Mega Shield) for the Funded Stage.
          </p>
        )}

        {/* Buffer depleted */}
        {recovery.bufferDepleted && !recovery.challengePassed && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive font-semibold">
            ⚠️ CRITICAL: Exness Buffer Depleted — deposit <strong>{money(recovery.depositNeeded)}</strong> to maintain the zero-loss loop.
          </p>
        )}

        {/* Self-healing adjustment */}
        {recovery.adjustmentNeeded && recovery.newExnessWinTarget != null && !recovery.challengePassed && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-400">
            ⚡ Recovery shortfall {money(recovery.recoveryShortfall)} — Exness win target auto-adjusted to{" "}
            {money(recovery.newExnessWinTarget, true)} per trade across {recovery.remainingLosses} remaining prop{" "}
            {recovery.remainingLosses === 1 ? "loss" : "losses"}.
          </p>
        )}

        {!recovery.adjustmentNeeded && recovery.recoveryShortfall <= 0 && closed.length > 0 && !recovery.challengePassed && (
          <p className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12px] text-success">
            Recovery target met — Exness has earned enough to cover fee + desired profit.
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Equity curve" className="lg:col-span-2">
          <div className="h-64">
            {curve.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis dataKey="i" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="equity" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-[13px] text-muted-foreground">
                Log a trade to build the curve.
              </p>
            )}
          </div>
        </Card>
        <Card title="Win / loss">
          <div className="h-64">
            {closed.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                    {distribution.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-[13px] text-muted-foreground">No closed trades yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* ── Trades table ─────────────────────────────────────── */}
      <Card
        title={`Trades (${journal.length})`}
        badge={
          journal.length ? (
            <Button variant="ghost" className="h-8 px-3 text-[11px]" onClick={() => clearJournal()}>
              Clear all
            </Button>
          ) : undefined
        }
      >
        {/* Live indicator if MetaApi configured and there are open trades */}
        {openTrades.length > 0 && meta.token && meta.exnessAccountId && (
          <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
            Live P&amp;L updating from MetaApi every 10s
            {liveMap.size === 0 && " — matching positions…"}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Pair</th>
                <th className="py-2 pr-3">Dir</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Prop P&L</th>
                <th className="py-2 pr-3">Exness P&L</th>
                <th className="py-2 pr-3">Net</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="font-mono">
              {journal
                .slice()
                .reverse()
                .map((t) => {
                  const isOpen = t.result === "OPEN";
                  const livePnl = liveMap.get(t.id);
                  const hasLive = isOpen && livePnl !== undefined;

                  // Display values: for OPEN, prefer live; for closed, use stored
                  const displayProp = hasLive ? livePnl : t.propPnl;
                  const displayEx   = hasLive ? 0 : t.exPnl;
                  const displayNet  = hasLive ? livePnl : t.netPnl;

                  return (
                    <>
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-2 pr-3 text-[11px] text-muted-foreground">{t.date}</td>
                        <td className="py-2 pr-3 text-foreground">{t.pair}</td>
                        <td className="py-2 pr-3">{t.dir}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={t.result === "WIN" ? "green" : t.result === "LOSS" ? "red" : "amber"}>
                              {t.result}
                            </Badge>
                            {hasLive && (
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" title="Live from MetaApi" />
                            )}
                          </div>
                        </td>
                        {/* Prop P&L — for OPEN, shows live floating total; for closed, stored */}
                        <td className={displayProp >= 0 ? "py-2 pr-3 text-success" : "py-2 pr-3 text-destructive"}>
                          {isOpen && hasLive ? (
                            <span className="font-semibold">{money(displayProp, true)}<span className="ml-1 text-[9px] text-muted-foreground">live</span></span>
                          ) : (
                            money(displayProp, true)
                          )}
                        </td>
                        <td className={displayEx >= 0 ? "py-2 pr-3 text-success" : "py-2 pr-3 text-destructive"}>
                          {isOpen && !hasLive ? <span className="text-muted-foreground">—</span> : money(displayEx, true)}
                        </td>
                        <td className={displayNet >= 0 ? "py-2 pr-3 font-semibold text-success" : "py-2 pr-3 font-semibold text-destructive"}>
                          {money(displayNet, true)}
                        </td>
                        <td className="py-2">
                          <div className="flex justify-end gap-1.5">
                            {isOpen && (
                              <>
                                <button
                                  onClick={() => {
                                    setSettleId(settleId === t.id ? null : t.id);
                                    setSettlePropPnl("");
                                    setSettleExPnl("");
                                  }}
                                  className="rounded-lg border border-primary/40 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
                                >
                                  Settle…
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => deleteTrade(t.id)}
                              className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ── Inline settle form (expand on "Settle…") ── */}
                      {settleId === t.id && (
                        <tr key={`${t.id}-settle`} className="border-b border-primary/20 bg-primary/5">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <p className="w-full text-[11px] text-muted-foreground mb-1">
                                Enter actual P&amp;L, then click Win or Loss (blank = engine-derived):
                              </p>
                              <div className="flex items-center gap-2">
                                <label className="text-[11px] text-muted-foreground w-24">Prop P&L ($)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={settlePropPnl}
                                  onChange={(e) => setSettlePropPnl(e.target.value)}
                                  placeholder={hasLive ? money(livePnl, true) : "engine value"}
                                  className="w-32 rounded-md border border-white/10 bg-background px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-[11px] text-muted-foreground w-24">Ex P&L ($)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={settleExPnl}
                                  onChange={(e) => setSettleExPnl(e.target.value)}
                                  placeholder="0.00"
                                  className="w-32 rounded-md border border-white/10 bg-background px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </div>
                              <button
                                onClick={() => settle(t, "WIN")}
                                className="rounded-lg border border-success/40 bg-success/10 px-3 py-1 text-[11px] font-semibold text-success hover:bg-success/20"
                              >
                                ✓ Win
                              </button>
                              <button
                                onClick={() => settle(t, "LOSS")}
                                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/20"
                              >
                                ✗ Loss
                              </button>
                              <button
                                onClick={() => setSettleId(null)}
                                className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
            </tbody>
          </table>
          {journal.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted-foreground">No trades yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
