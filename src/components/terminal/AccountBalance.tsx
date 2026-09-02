import { useEffect, useState } from "react";
import { useLiveAccounts } from "@/lib/useLiveAccounts";
import { useStore } from "@/lib/store";

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

  return (
    <div className="flex items-center gap-4" title="Live account balance from MetaApi">
      {/* Equity */}
      <div className="flex flex-col items-end">
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
          style={{ color: "oklch(var(--gz-mut))" }}
        >
          Equity
        </span>
        <span
          className="font-mono text-[12px] font-semibold"
          style={{ color: "oklch(var(--gz-txt))" }}
        >
          {hasData ? formatCurrency(equity, currency) : configured ? "Loading…" : "—"}
        </span>
      </div>

      <div className="h-6 w-px" style={{ background: "oklch(var(--gz-p) / 0.15)" }} />

      {/* Daily P&L */}
      <div className="flex flex-col items-end">
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
          style={{ color: "oklch(var(--gz-mut))" }}
        >
          Day P&L
        </span>
        <span
          className="font-mono text-[12px] font-semibold"
          style={{
            color: hasData
              ? isProfit
                ? "oklch(0.720 0.190 148)"
                : "oklch(0.637 0.208 25.3)"
              : "oklch(var(--gz-mut))",
          }}
        >
          {hasData ? (
            <>
              {isProfit ? "+" : ""}
              {formatCurrency(dailyPnl, currency)}
              <span className="ml-1 text-[10px]">
                ({isProfit ? "+" : ""}
                {dailyPnlPercent.toFixed(2)}%)
              </span>
            </>
          ) : configured ? (
            "Loading…"
          ) : (
            "—"
          )}
        </span>
      </div>

      {/* Error indicator */}
      {hasError && (
        <div
          className="flex items-center gap-1 rounded px-1.5 py-0.5"
          style={{ background: "oklch(0.637 0.208 25.3 / 0.15)" }}
          title={`Connection error: ${live.exness.error}`}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "oklch(0.637 0.208 25.3)" }}
          />
          <span className="font-mono text-[9px]" style={{ color: "oklch(0.637 0.208 25.3)" }}>
            ERROR
          </span>
        </div>
      )}
    </div>
  );
}
