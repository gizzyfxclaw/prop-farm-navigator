import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { useLiveAccounts } from "@/lib/useLiveAccounts";
import { useStore } from "@/lib/store";
import { LiveDot } from "./anim";

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

  // MetaApi returns balance in cents for Cent accounts — convert to dollars
  const liveBalance = (live.exness.snapshot?.equity ?? 0) / 100;
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
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="ctl-label">
          Actual Exness Balance ($)
          <span className="ctl-hint" style={{ marginLeft: 4, textTransform: "none", letterSpacing: 0 }}>
            auto-converted from cents
          </span>
        </span>
        {isManual ? (
          <span className="badge badge-warning" title="MetaApi unavailable — value entered manually">
            MANUAL
          </span>
        ) : (
          <span className="badge badge-success" title="Auto-synced from MetaApi">
            <LiveDot state="live" />
            LIVE
          </span>
        )}
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
          className="ctl"
          placeholder="0.00"
        />
        {configured && (
          <button
            onClick={async () => {
              await live.refresh();
              if (live.exness.snapshot) {
                setEngine({ actualExnessBalance: Number(((live.exness.snapshot.equity ?? 0) / 100).toFixed(2)) });
                setIsManual(false);
              }
            }}
            className="btn btn-ghost fx-press flex-shrink-0"
            style={{ padding: "0 8px" }}
            title="Refresh from MetaApi"
            aria-label="Refresh from MetaApi"
          >
            <RotateCw size={12} />
          </button>
        )}
      </div>
      {hasLiveData && !isManual && (
        <span className="ctl-hint font-mono" style={{ fontVariantNumeric: "tabular-nums slashed-zero" }}>
          Synced ${liveBalance.toFixed(2)} from MetaApi
        </span>
      )}
    </div>
  );
}
