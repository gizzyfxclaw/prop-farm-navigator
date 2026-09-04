import { useEffect, useState } from "react";
import { useLiveAccounts } from "@/lib/useLiveAccounts";
import { useStore } from "@/lib/store";
import { Skeleton, TickValue } from "./anim";

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSigned(value: number, currency: string): string {
  return `${value >= 0 ? "+" : ""}${formatCurrency(value, currency)}`;
}

/** One dense label-over-value cell in the command bar. */
function Cell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-end leading-tight ${className ?? ""}`}>
      <span className="mono-cap c-mut" style={{ fontSize: 9 }}>
        {label}
      </span>
      <span
        className="font-mono"
        style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums slashed-zero" }}
      >
        {children}
      </span>
    </div>
  );
}

export function AccountBalance() {
  const { meta } = useStore();
  const live = useLiveAccounts(10_000);
  const [prevEquity, setPrevEquity] = useState<number | null>(null);
  const [dailyPnl, setDailyPnl] = useState<number>(0);

  const equity = (live.exness.snapshot?.equity ?? 0) / 100;
  const currency = live.exness.snapshot?.currency ?? "USD";
  const balance = (live.exness.snapshot?.balance ?? 0) / 100;

  // Track daily P&L by comparing to first equity reading of the session
  useEffect(() => {
    if (equity > 0 && prevEquity === null) {
      setPrevEquity(equity);
    }
  }, [equity, prevEquity]);

  useEffect(() => {
    if (prevEquity !== null && equity > 0) {
      setDailyPnl(equity - prevEquity);
    }
  }, [equity, prevEquity]);

  const isProfit = dailyPnl >= 0;
  const dailyPnlPercent = balance > 0 ? (dailyPnl / balance) * 100 : 0;

  const configured = live.configured;
  const hasData = live.exness.snapshot !== null;
  const hasError = live.exness.error !== null;

  // Unrealised P&L on the open book — equity less closed balance.
  const unrealised = equity - balance;

  const loading = configured && !hasData && !hasError;
  const dash = <span className="c-mut">—</span>;

  return (
    <div className="flex items-center gap-3" title="Live account balance from MetaApi">
      <Cell label="Equity">
        {hasData ? (
          <TickValue value={equity} format={(v) => formatCurrency(v, currency)} showArrow={false} />
        ) : loading ? (
          <Skeleton w={62} h={11} />
        ) : (
          dash
        )}
      </Cell>

      <span className="vdivider" style={{ height: 20 }} />

      <Cell label="Balance" className="hidden md:flex">
        {hasData ? (
          <TickValue value={balance} format={(v) => formatCurrency(v, currency)} showArrow={false} />
        ) : loading ? (
          <Skeleton w={62} h={11} />
        ) : (
          dash
        )}
      </Cell>

      <span className="vdivider hidden md:block" style={{ height: 20 }} />

      <Cell label="U/PL">
        <span
          style={{
            color: hasData
              ? unrealised >= 0
                ? "oklch(var(--gz-pos))"
                : "oklch(var(--gz-neg))"
              : "oklch(var(--gz-mut))",
          }}
        >
          {hasData ? (
            <TickValue value={unrealised} format={(v) => formatSigned(v, currency)} />
          ) : loading ? (
            <Skeleton w={54} h={11} />
          ) : (
            dash
          )}
        </span>
      </Cell>

      <span className="vdivider hidden xl:block" style={{ height: 20 }} />

      <Cell label="Day P&L" className="hidden xl:flex">
        <span
          style={{
            color: hasData
              ? isProfit
                ? "oklch(var(--gz-pos))"
                : "oklch(var(--gz-neg))"
              : "oklch(var(--gz-mut))",
          }}
        >
          {hasData ? (
            <>
              <TickValue value={dailyPnl} format={(v) => formatSigned(v, currency)} showArrow={false} />
              <span className="ml-1" style={{ fontSize: 10 }}>
                ({isProfit ? "+" : ""}
                {dailyPnlPercent.toFixed(2)}%)
              </span>
            </>
          ) : loading ? (
            <Skeleton w={54} h={11} />
          ) : (
            dash
          )}
        </span>
      </Cell>

      {hasError && (
        <span className="badge badge-danger" title={`Connection error: ${live.exness.error}`}>
          ERROR
        </span>
      )}
    </div>
  );
}
