import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { BarChart3, TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react";
import { Badge, Button, Card } from "@/components/terminal/ui";
import { loadJournal } from "@/lib/db.functions";
import { calcDashboardStats, getPnLBreakdown, DEFAULT_PNL_CONFIG, type Trade } from "@/lib/pnl-dashboard";

export const Route = createFileRoute("/pnl")({
  head: () => ({
    meta: [{ title: "P&L Dashboard — GizzyFx" }],
  }),
  component: PnLPage,
});

interface JournalTrade {
  id: string;
  date: string;
  time: string;
  pair: string;
  dir: "LONG" | "SHORT";
  result: "OPEN" | "WIN" | "LOSS";
  propPnl: number;
  exPnl: number;
  netPnl: number;
  ticket?: string;
  note?: string;
  details?: any;
}

function PnLPage() {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadJournal();
      setTrades(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Convert journal trades to Trade format for stats
  const tradeData: Trade[] = trades
    .filter((t) => t.result !== "OPEN")
    .map((t) => ({
      entryTime: new Date(`${t.date}T${t.time}`).getTime() / 1000,
      exitTime: new Date(`${t.date}T${t.time}`).getTime() / 1000,
      direction: t.dir.toLowerCase() as "long" | "short",
      entryPrice: t.details?.entry || 0,
      exitPrice: t.details?.exit || 0,
      sl: t.details?.sl || 0,
      tp: t.details?.tp || 0,
      pnlUsd: t.netPnl,
      pnlPips: t.details?.pnlPips || 0,
      result: t.result === "WIN" ? "win" : "loss",
      reason: t.details?.reason || "tp",
    }));

  const stats = calcDashboardStats(tradeData);
  const openTrades = trades.filter((t) => t.result === "OPEN");
  const realizedPnl = tradeData.reduce((s, t) => s + t.pnlUsd, 0);
  const breakdown = getPnLBreakdown(realizedPnl, 0, DEFAULT_PNL_CONFIG);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">P&L Dashboard</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Real-time P&L from your journal trades — realized, unrealized, and cost coverage.
        </p>
      </div>

      <div className="mb-3">
        <Button variant="ghost" onClick={load} disabled={loading}>
          <BarChart3 size={12} /> {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="alert alert-red">
          <p className="alert-title"><AlertTriangle size={13} /> Error</p>
          <p className="alert-body">{error}</p>
        </div>
      )}

      {trades.length === 0 && !loading && !error && (
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-[15px] text-muted-foreground">No trades in journal</p>
          <p className="text-[12px] text-muted-foreground/70 mt-1">
            Add trades in the Journal tab to see P&L analytics here.
          </p>
        </div>
      )}

      {trades.length > 0 && (
        <>
          {/* ── Open Positions ───────────────────────────────────────── */}
          {openTrades.length > 0 && (
            <Card title={`Open Positions (${openTrades.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-muted-foreground">
                      <th className="px-2 py-1">Pair</th>
                      <th className="px-2 py-1">Side</th>
                      <th className="px-2 py-1">Date</th>
                      <th className="px-2 py-1">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTrades.map((t) => (
                      <tr key={t.id} className="border-b border-white/5">
                        <td className="px-2 py-1 font-medium">{t.pair}</td>
                        <td className="px-2 py-1">
                          <Badge tone={t.dir === "LONG" ? "green" : "red"}>{t.dir}</Badge>
                        </td>
                        <td className="px-2 py-1 font-mono">{t.date}</td>
                        <td className="px-2 py-1 text-muted-foreground">{t.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── P&L Breakdown ────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="P&L Breakdown">
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Realized P&L</span>
                  <span className={`font-mono ${realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    ${realizedPnl.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unrealized P&L</span>
                  <span className="font-mono text-amber-400">
                    {openTrades.length > 0 ? `${openTrades.length} open` : "—"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
                  <span className="text-muted-foreground">Net P&L</span>
                  <span className={`font-mono ${realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    ${realizedPnl.toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>

            <Card title="Cost Coverage">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{ width: `${Math.min(Math.max(breakdown.costCoveragePct, 0), 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Covers <span className="font-bold text-foreground">{breakdown.costCoveragePct.toFixed(0)}%</span> of daily costs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold text-emerald-400">${realizedPnl.toFixed(0)}</p>
                  <p className="text-[11px] text-muted-foreground">vs ${breakdown.totalCost.toFixed(0)} cost</p>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Dashboard Stats ──────────────────────────────────────── */}
          <Card title="Trade Statistics">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <StatBox label="Trades" value={stats.trades.toString()} />
              <StatBox label="Win Rate" value={`${(stats.winRate * 100).toFixed(0)}%`} tone={stats.winRate >= 0.5 ? "green" : "red"} />
              <StatBox label="Wins / Losses" value={`${stats.wins}W / ${stats.losses}L`} />
              <StatBox label="Profit Factor" value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"} tone={stats.profitFactor >= 1.5 ? "green" : stats.profitFactor >= 1 ? "amber" : "red"} />
              <StatBox label="Avg Win" value={`$${stats.avgWin.toFixed(2)}`} tone="green" />
              <StatBox label="Avg Loss" value={`$${stats.avgLoss.toFixed(2)}`} tone="red" />
              <StatBox label="Max Drawdown" value={`${stats.maxDrawdownPct.toFixed(1)}%`} tone={stats.maxDrawdownPct <= 10 ? "green" : "amber"} />
              <StatBox label="Sharpe" value={stats.sharpeRatio.toFixed(2)} tone="blue" />
            </div>
          </Card>

          {/* ── Loss Streak ──────────────────────────────────────────── */}
          {stats.lossStreak > 0 && (
            <div className="alert alert-red">
              <p className="alert-title"><AlertTriangle size={13} /> Loss Streak</p>
              <p className="alert-body">
                {stats.lossStreak} consecutive losses. Consider reducing size or waiting for A+ setups.
              </p>
            </div>
          )}

          {/* ── Trade Log ────────────────────────────────────────────── */}
          <Card title="Recent Trades">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-white/10 text-left text-muted-foreground">
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">Pair</th>
                    <th className="px-2 py-1">Side</th>
                    <th className="px-2 py-1">Prop P&L</th>
                    <th className="px-2 py-1">Ex P&L</th>
                    <th className="px-2 py-1">Net P&L</th>
                    <th className="px-2 py-1">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(-20).reverse().map((t) => (
                    <tr key={t.id} className="border-b border-white/5">
                      <td className="px-2 py-1 font-mono">{t.date}</td>
                      <td className="px-2 py-1 font-medium">{t.pair}</td>
                      <td className="px-2 py-1">
                        <Badge tone={t.dir === "LONG" ? "green" : "red"}>{t.dir}</Badge>
                      </td>
                      <td className={`px-2 py-1 font-mono ${t.propPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.propPnl >= 0 ? "+" : ""}${t.propPnl.toFixed(2)}
                      </td>
                      <td className={`px-2 py-1 font-mono ${t.exPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.exPnl >= 0 ? "+" : ""}${t.exPnl.toFixed(2)}
                      </td>
                      <td className={`px-2 py-1 font-mono ${t.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.netPnl >= 0 ? "+" : ""}${t.netPnl.toFixed(2)}
                      </td>
                      <td className="px-2 py-1">
                        <Badge tone={t.result === "WIN" ? "green" : t.result === "LOSS" ? "red" : "amber"}>
                          {t.result}
                        </Badge>
                      </td>
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

function StatBox({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "green" | "red" | "blue" | "amber" | "neutral" }) {
  const colors: Record<string, string> = {
    green: "text-emerald-400", red: "text-red-400", blue: "text-blue-400", amber: "text-amber-400", neutral: "text-foreground",
  };
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[16px] font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}
