import { useEffect, useState } from "react";
import { useLiveAccounts } from "@/lib/useLiveAccounts";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/terminal/ui";

/**
 * Actual Exness Balance input with MetaApi auto-sync.
 * 
 * - When MetaApi is connected: auto-fetches live balance every 20s, shows green LIVE badge
 * - When MetaApi is offline: user types manually, shows amber MANUAL badge
 * - Updates engine.actualExnessBalance which drives Phase 2 deficit calculation
 */
export function ActualExnessBalance() {
  const { engine, setEngine } = useStore();
  const live = useLiveAccounts(20_000);
  const [isManual, setIsManual] = useState(true);

  const liveBalance = live.exness.snapshot?.equity ?? 0;
  const configured = live.configured;
  const hasLiveData = configured && liveBalance > 0;

  // Auto-sync from MetaApi when available
  useEffect(() => {
    if (hasLiveData) {
      setEngine({ actualExnessBalance: Number(liveBalance.toFixed(2)) });
      setIsManual(false);
    } else {
      setIsManual(true);
    }
  }, [hasLiveData, liveBalance, setEngine]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Actual Exness Balance ($)
        </span>
        <Badge tone={isManual ? "amber" : "green"}>
          {isManual ? "MANUAL" : "LIVE"}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          value={engine.actualExnessBalance}
          onChange={(e) => {
            setEngine({ actualExnessBalance: Number(e.target.value) });
            setIsManual(true);
          }}
          className="h-8 w-full rounded border border-border bg-secondary px-2 text-[12px] font-mono text-foreground"
          placeholder="0.00"
        />
        {configured && (
          <button
            onClick={async () => {
              await live.refresh();
              if (live.exness.snapshot) {
                setEngine({ actualExnessBalance: Number(live.exness.snapshot.equity.toFixed(2)) });
                setIsManual(false);
              }
            }}
            className="h-8 rounded border border-border bg-secondary px-2 text-[10px] text-muted-foreground hover:bg-primary/10 hover:text-primary"
            title="Refresh from MetaApi"
          >
            ↻
          </button>
        )}
      </div>
      {hasLiveData && !isManual && (
        <span className="text-[10px] text-muted-foreground">
          Auto-synced: ${liveBalance.toFixed(2)} from MetaApi
        </span>
      )}
    </div>
  );
}
