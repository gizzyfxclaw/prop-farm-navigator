import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, Badge, Button, Card, Row, Stat } from "@/components/terminal/ui";
import { money } from "@/lib/engine/calc";
import {
  cancelPendingOrder,
  closePosition,
  fetchAccountInformation,
  fetchHistoryDeals,
  fetchOpenState,
  type AccountSnapshot,
  type DealRow,
  type OrderRow,
  type PositionRow,
} from "@/lib/metaapi.functions";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live MT5 Terminal — GizzyFx" },
      {
        name: "description",
        content:
          "Live MetaApi Cloud view of your Exness MT5 account: equity, open positions, pending orders and closed deal history.",
      },
      { property: "og:title", content: "Live MT5 Terminal — GizzyFx" },
      {
        property: "og:description",
        content: "Monitor equity, positions and pending orders straight from MetaApi Cloud.",
      },
    ],
  }),
  component: LivePage,
});

function LivePage() {
  const { meta } = useStore();
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = Boolean(meta.token && meta.exnessAccountId);

  const refresh = useCallback(async () => {
    if (!meta.token || !meta.exnessAccountId) return;
    const cred = { token: meta.token, accountId: meta.exnessAccountId };
    setBusy(true);
    const [info, open, history] = await Promise.all([
      fetchAccountInformation({ data: cred }),
      fetchOpenState({ data: cred }),
      fetchHistoryDeals({ data: { ...cred, days: 30 } }),
    ]);
    setBusy(false);
    const failure = [info, open, history].find((res) => !res.ok);
    setError(failure && !failure.ok ? failure.error : null);
    if (info.ok) setSnapshot(info.data);
    if (open.ok) {
      setPositions(open.data.positions);
      setOrders(open.data.orders);
    }
    if (history.ok) setDeals(history.data);
  }, [meta.token, meta.exnessAccountId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCancel(orderId: string) {
    const res = await cancelPendingOrder({
      data: { token: meta.token, accountId: meta.exnessAccountId, orderId },
    });
    if (!res.ok) return toast.error(res.error);
    toast.success("Pending order cancelled.");
    void refresh();
  }

  async function onClose(positionId: string) {
    const res = await closePosition({
      data: { token: meta.token, accountId: meta.exnessAccountId, positionId },
    });
    if (!res.ok) return toast.error(res.error);
    toast.success("Position closed.");
    void refresh();
  }

  const closedPnl = deals.reduce((s, d) => s + d.profit + d.commission + d.swap, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Live MT5</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Exness fuel account streamed through MetaApi Cloud.
          </p>
        </div>
        <Button variant="ghost" disabled={!configured || busy} onClick={() => void refresh()}>
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {!configured && (
        <Alert level="amber" title="MetaApi not configured">
          Add your MetaApi token and Exness account ID in Settings to stream this account.
        </Alert>
      )}
      {error && (
        <Alert level="red" title="MetaApi error">
          {error}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Balance" value={snapshot ? money(snapshot.balance) : "—"} />
        <Stat
          label="Equity"
          value={snapshot ? money(snapshot.equity) : "—"}
          tone={snapshot && snapshot.equity >= snapshot.balance ? "text-success" : "text-destructive"}
        />
        <Stat label="Free margin" value={snapshot ? money(snapshot.freeMargin) : "—"} />
        <Stat
          label="Closed P&L (30d)"
          value={money(closedPnl, true)}
          tone={closedPnl >= 0 ? "text-success" : "text-destructive"}
        />
      </div>

      <Card
        title="Account"
        badge={snapshot ? <Badge tone="green">Connected</Badge> : <Badge tone="neutral">Idle</Badge>}
      >
        <Row label="Broker" value={snapshot?.broker ?? "—"} />
        <Row label="Server" value={snapshot?.server ?? "—"} />
        <Row label="Login" value={snapshot?.login ?? "—"} />
        <Row label="Currency" value={snapshot?.currency ?? "—"} />
        <Row label="Leverage" value={snapshot?.leverage ? `1:${snapshot.leverage}` : "—"} />
        <Row label="Margin used" value={snapshot ? money(snapshot.margin) : "—"} />
      </Card>

      <Card title={`Open positions (${positions.length})`}>
        {positions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2 pr-3">Symbol</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Lots</th>
                  <th className="py-2 pr-3">Open</th>
                  <th className="py-2 pr-3">SL / TP</th>
                  <th className="py-2 pr-3">P&L</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="font-mono">
                {positions.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 pr-3 text-foreground">{p.symbol}</td>
                    <td className="py-2 pr-3">{p.type.replace("POSITION_TYPE_", "")}</td>
                    <td className="py-2 pr-3">{p.volume}</td>
                    <td className="py-2 pr-3">{p.openPrice}</td>
                    <td className="py-2 pr-3">
                      {p.stopLoss ?? "—"} / {p.takeProfit ?? "—"}
                    </td>
                    <td className={p.profit >= 0 ? "py-2 pr-3 text-success" : "py-2 pr-3 text-destructive"}>
                      {money(p.profit, true)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => void onClose(p.id)}
                        className="rounded-lg border border-destructive/40 px-2.5 py-1 text-[11px] font-semibold text-destructive"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No open positions.</p>
        )}
      </Card>

      <Card title={`Pending orders (${orders.length})`}>
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2 pr-3">Symbol</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Lots</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">SL / TP</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="font-mono">
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="py-2 pr-3 text-foreground">{o.symbol}</td>
                    <td className="py-2 pr-3">{o.type.replace("ORDER_TYPE_", "")}</td>
                    <td className="py-2 pr-3">{o.volume}</td>
                    <td className="py-2 pr-3">{o.openPrice}</td>
                    <td className="py-2 pr-3">
                      {o.stopLoss ?? "—"} / {o.takeProfit ?? "—"}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => void onCancel(o.id)}
                        className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No pending orders.</p>
        )}
      </Card>

      <Card title={`Closed deals — last 30 days (${deals.length})`}>
        {deals.length ? (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Symbol</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Lots</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Net</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {deals.map((d) => {
                  const netD = d.profit + d.commission + d.swap;
                  return (
                    <tr key={d.id} className="border-t border-border">
                      <td className="py-2 pr-3">{d.time.slice(0, 16).replace("T", " ")}</td>
                      <td className="py-2 pr-3 text-foreground">{d.symbol || "—"}</td>
                      <td className="py-2 pr-3">{d.type.replace("DEAL_TYPE_", "")}</td>
                      <td className="py-2 pr-3">{d.volume}</td>
                      <td className="py-2 pr-3">{d.price}</td>
                      <td className={netD >= 0 ? "py-2 pr-3 text-success" : "py-2 pr-3 text-destructive"}>
                        {money(netD, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No deal history yet.</p>
        )}
      </Card>
    </div>
  );
}
