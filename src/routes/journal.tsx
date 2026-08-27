import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { useStore, type JournalTrade } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";

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

function JournalPage() {
  const { journal, addTrade, updateTrade, deleteTrade, clearJournal, engine } = useStore();
  const r = useEngine();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pair, setPair] = useState<string>(engine.pair);
  const [dir, setDir] = useState<Direction>(engine.direction);

  function log(result: "WIN" | "LOSS") {
    const pnl = tradePnl(r, result === "WIN", engine.rr);
    const now = new Date();
    addTrade({
      id: `${now.getTime()}`,
      date,
      time: now.toTimeString().slice(0, 8),
      pair,
      dir,
      result,
      propPnl: pnl.propPnl,
      exPnl: pnl.exPnl,
      netPnl: pnl.netPnl,
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
    toast.success(`${result} logged — net ${money(pnl.netPnl, true)}`);
  }

  function settle(trade: JournalTrade, result: "WIN" | "LOSS") {
    const rr = trade.details?.rr ?? engine.rr;
    const pnl = tradePnl(r, result === "WIN", rr);
    updateTrade(trade.id, { result, propPnl: pnl.propPnl, exPnl: pnl.exPnl, netPnl: pnl.netPnl });
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
          {engine.rr}).
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
                .map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 pr-3">{t.date}</td>
                    <td className="py-2 pr-3 text-foreground">{t.pair}</td>
                    <td className="py-2 pr-3">{t.dir}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={t.result === "WIN" ? "green" : t.result === "LOSS" ? "red" : "amber"}>
                        {t.result}
                      </Badge>
                    </td>
                    <td className={t.propPnl >= 0 ? "py-2 pr-3 text-success" : "py-2 pr-3 text-destructive"}>
                      {money(t.propPnl, true)}
                    </td>
                    <td className={t.exPnl >= 0 ? "py-2 pr-3 text-success" : "py-2 pr-3 text-destructive"}>
                      {money(t.exPnl, true)}
                    </td>
                    <td className={t.netPnl >= 0 ? "py-2 pr-3 text-success" : "py-2 pr-3 text-destructive"}>
                      {money(t.netPnl, true)}
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1.5">
                        {t.result === "OPEN" && (
                          <>
                            <button
                              onClick={() => settle(t, "WIN")}
                              className="rounded-lg border border-success/40 px-2.5 py-1 text-[11px] font-semibold text-success"
                            >
                              Win
                            </button>
                            <button
                              onClick={() => settle(t, "LOSS")}
                              className="rounded-lg border border-destructive/40 px-2.5 py-1 text-[11px] font-semibold text-destructive"
                            >
                              Loss
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
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
