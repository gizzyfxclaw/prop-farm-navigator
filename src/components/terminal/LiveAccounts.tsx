import { Alert, Badge, Button, Card, Row, Stat } from "@/components/terminal/ui";
import { money, type EngineResult, type PropAccount } from "@/lib/engine/calc";
import type { LiveAccounts } from "@/lib/useLiveAccounts";

/**
 * All figures here come from MetaApi Cloud account-information calls; the engine
 * numbers are only used as the required-capital baseline to compare against.
 */
export function LiveAccountsPanel({
  live,
  result,
  account,
}: {
  live: LiveAccounts;
  result: EngineResult;
  account: PropAccount;
}) {
  const ex = live.exness.snapshot ? {
    ...live.exness.snapshot,
    balance: (live.exness.snapshot.balance ?? 0) / 100,
    equity: (live.exness.snapshot.equity ?? 0) / 100,
    margin: (live.exness.snapshot.margin ?? 0) / 100,
    freeMargin: (live.exness.snapshot.freeMargin ?? 0) / 100,
  } : null;
  const pr = live.prop.snapshot;
  const required = result.requiredExnessCapital;
  const fuelGap = ex ? ex.equity - required : null;

  // Prop stats derived from live MT5 equity when the prop account is linked.
  const propStart = account.size;
  const propProfit = pr ? pr.equity - propStart : null;
  const propTargetLeft = propProfit === null ? null : result.targetUsd - propProfit;
  const propDdLeft = propProfit === null ? null : result.maxDdUsd + Math.min(0, propProfit);

  return (
    <Card
      title="Live account stats (MetaApi Cloud)"
      badge={
        <Badge tone={live.exness.error ? "red" : ex ? "green" : "amber"}>
          {live.loading ? "Syncing" : ex ? "Live" : "Offline"}
        </Badge>
      }
    >
      {!live.configured && (
        <Alert level="amber" title="MetaApi not configured">
          Add your MetaApi token and Exness account ID in Settings — every balance below then streams from
          MetaApi Cloud.
        </Alert>
      )}
      {live.exness.error && (
        <Alert level="red" title="Exness account error">
          {live.exness.error}
        </Alert>
      )}

      {ex && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Exness balance" value={money(ex.balance)} />
          <Stat label="Exness equity" value={money(ex.equity)} />
          <Stat label="Free margin" value={money(ex.freeMargin)} />
          <Stat
            label="Fuel vs required"
            value={money(fuelGap ?? 0, true)}
            tone={(fuelGap ?? 0) >= 0 ? "text-success" : "text-destructive"}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Exness fuel account
          </p>
          <Row label="Broker / server" value={ex ? `${ex.broker ?? "—"} · ${ex.server ?? "—"}` : "—"} />
          <Row label="Login" value={ex?.login ? String(ex.login) : "—"} />
          <Row label="Currency / leverage" value={ex ? `${ex.currency ?? "—"} · 1:${ex.leverage ?? "—"}` : "—"} />
          <Row label="Used margin" value={ex ? money(ex.margin) : "—"} />
          <Row label="Required (buffered)" value={money(required)} tone="accent" />
          <Row
            label={fuelGap !== null && fuelGap < 0 ? "Top-up needed" : "Surplus fuel"}
            value={fuelGap === null ? "—" : money(Math.abs(fuelGap))}
            tone={fuelGap !== null && fuelGap < 0 ? "neg" : "pos"}
            strong
          />
        </div>

        <div>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Prop account {account.firm}
          </p>
          {live.prop.error && (
            <Alert level="red" title="Prop account error">
              {live.prop.error}
            </Alert>
          )}
          {!live.prop.accountId && (
            <p className="mb-2 text-[11px] text-muted-foreground">
              Link this prop account&apos;s MetaApi account ID (Accounts page) to stream its live equity.
            </p>
          )}
          <Row label="Live equity" value={pr ? money(pr.equity) : "—"} />
          <Row label="Live balance" value={pr ? money(pr.balance) : "—"} />
          <Row
            label="Profit so far"
            value={propProfit === null ? "—" : money(propProfit, true)}
            tone={propProfit !== null && propProfit >= 0 ? "pos" : "neg"}
          />
          <Row label="Target remaining" value={propTargetLeft === null ? money(result.targetUsd) : money(Math.max(0, propTargetLeft))} tone="accent" />
          <Row
            label="Drawdown remaining"
            value={propDdLeft === null ? money(result.maxDdUsd) : money(Math.max(0, propDdLeft))}
            tone="neg"
            strong
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[10.5px] text-muted-foreground">
          {live.updatedAt ? `Updated ${new Date(live.updatedAt).toLocaleTimeString()} · auto-refresh 20s` : "Not synced yet"}
        </p>
        <Button variant="ghost" disabled={!live.configured || live.loading} onClick={() => void live.refresh()}>
          {live.loading ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>
    </Card>
  );
}
