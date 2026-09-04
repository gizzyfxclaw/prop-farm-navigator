import { useEffect, useState } from "react";
import { useLiveAccounts } from "@/lib/useLiveAccounts";
import { useStore } from "@/lib/store";
import { fetchAccountInformation } from "@/lib/metaapi.functions";
import { LiveDot } from "./anim";

type ConnectionState = "connected" | "connecting" | "disconnected" | "error";

type ConnectionTarget = {
  name: string;
  short: string;
  state: ConnectionState;
  latency: number | undefined;
};

const STATE_META: Record<
  ConnectionState,
  { label: string; color: string; dot: "live" | "stale" | "dead" }
> = {
  connected: { label: "ONLINE", color: "oklch(var(--gz-pos))", dot: "live" },
  connecting: { label: "LINKING", color: "oklch(var(--gz-warn))", dot: "stale" },
  disconnected: { label: "OFFLINE", color: "oklch(var(--gz-mut) / 0.7)", dot: "dead" },
  error: { label: "ERROR", color: "oklch(var(--gz-neg))", dot: "dead" },
};

/** Latency colour band — green <300ms, amber <800ms, red above. */
function latencyColor(ms: number | null): string {
  if (ms === null) return "oklch(var(--gz-mut))";
  if (ms < 300) return "oklch(var(--gz-pos))";
  if (ms < 800) return "oklch(var(--gz-warn))";
  return "oklch(var(--gz-neg))";
}

export function ConnectionIndicator() {
  const { meta } = useStore();
  const live = useLiveAccounts(10_000);
  const [latency, setLatency] = useState<number | null>(null);
  const [priceFeedOk, setPriceFeedOk] = useState<boolean>(false);

  const configured = live.configured;
  const hasExnessData = live.exness.snapshot !== null;
  const hasExnessError = live.exness.error !== null;
  const hasPropData = live.prop.snapshot !== null;
  const hasPropError = live.prop.error !== null;

  // Measure latency by timing a real API call
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const measure = async () => {
      const start = Date.now();
      const res = await fetchAccountInformation({ data: { token: meta.token, accountId: meta.exnessAccountId } });
      if (cancelled) return;
      const elapsed = Date.now() - start;
      if (res.ok) {
        setLatency(elapsed);
        setPriceFeedOk(true);
      } else {
        setPriceFeedOk(false);
      }
    };
    measure();
    const id = setInterval(measure, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [configured, meta.token, meta.exnessAccountId]);

  const targets: ConnectionTarget[] = [
    {
      name: "MetaApi Cloud",
      short: "API",
      state: hasExnessData ? "connected" : hasExnessError ? "error" : configured ? "connecting" : "disconnected",
      latency: latency ?? undefined,
    },
    {
      name: "MT5 Bridge",
      short: "MT5",
      state: hasExnessData ? "connected" : hasExnessError ? "error" : configured ? "connecting" : "disconnected",
      latency: undefined,
    },
    {
      name: "Price Feed",
      short: "FEED",
      state: priceFeedOk ? "connected" : hasExnessError ? "error" : configured ? "connecting" : "disconnected",
      latency: undefined,
    },
  ];

  const allConnected = targets.every((t) => t.state === "connected");

  return (
    <div className="flex items-center gap-2.5" title="Connection status">
      {targets.map((target) => {
        const style = STATE_META[target.state];
        return (
          <div
            key={target.short}
            className="flex items-center gap-1.5"
            title={`${target.name}: ${style.label}${target.latency !== undefined ? ` · ${target.latency}ms` : ""}`}
          >
            {/* The error state needs a red dot, which LiveDot has no variant for;
                it still renders the design system's .fx-live-dot. */}
            {target.state === "error" ? (
              <span
                className="fx-live-dot"
                style={{ color: "oklch(var(--gz-neg))" }}
                aria-hidden
              />
            ) : (
              <LiveDot state={style.dot} />
            )}
            <span className="mono-cap" style={{ color: style.color }}>
              {target.short}
            </span>
          </div>
        );
      })}

      {/* Real measured round-trip latency — never synthesised. */}
      <span
        className="font-mono"
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: latencyColor(latency),
          fontVariantNumeric: "tabular-nums slashed-zero",
        }}
        title={
          latency === null
            ? "No latency sample yet"
            : `Measured MetaApi round-trip: ${latency}ms`
        }
      >
        {latency === null ? "—" : `${latency}ms`}
      </span>

      <span
        className={allConnected ? "badge badge-success" : "badge badge-danger"}
        title={allConnected ? "All systems operational" : "Connection issues detected"}
      >
        {allConnected ? "LINK" : "DEGRADED"}
      </span>
    </div>
  );
}
