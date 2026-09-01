import { useEffect, useState } from "react";

type AccountSummary = {
  balance: number;
  equity: number;
  currency: string;
  dailyPnl: number;
  dailyPnlPercent: number;
};

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function useSimulatedAccount(): AccountSummary {
  const [account, setAccount] = useState<AccountSummary>({
    balance: 100000,
    equity: 100247.5,
    currency: "USD",
    dailyPnl: 247.5,
    dailyPnlPercent: 0.25,
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      setAccount((prev) => {
        const change = (Math.random() - 0.48) * 150;
        const newEquity = prev.equity + change;
        const newDailyPnl = prev.dailyPnl + change;
        return {
          ...prev,
          equity: newEquity,
          dailyPnl: newDailyPnl,
          dailyPnlPercent: (newDailyPnl / prev.balance) * 100,
        };
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  return account;
}

export function AccountBalance() {
  const account = useSimulatedAccount();
  const isProfit = account.dailyPnl >= 0;

  return (
    <div className="flex items-center gap-4" title="Account balance">
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
          {formatCurrency(account.equity, account.currency)}
        </span>
      </div>
      <div className="h-6 w-px" style={{ background: "oklch(var(--gz-p) / 0.15)" }} />
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
            color: isProfit ? "oklch(0.720 0.190 148)" : "oklch(0.637 0.208 25.3)",
          }}
        >
          {isProfit ? "+" : ""}
          {formatCurrency(account.dailyPnl, account.currency)}
          <span className="ml-1 text-[10px]">
            ({isProfit ? "+" : ""}
            {account.dailyPnlPercent.toFixed(2)}%)
          </span>
        </span>
      </div>
    </div>
  );
}