import { useEffect, useState } from "react";
import { useLiveAccounts } from "@/lib/useLiveAccounts";
import { useStore } from "@/lib/store";
import { fetchAccountInformation } from "@/lib/metaapi.functions";

type ConnectionState = "connected" | "connecting" | "disconnected" | "error";

type ConnectionTarget = {
  name: string;
  short: string;
  state: ConnectionState;
  latency: number | undefined;
};

const STATE_STYLES: Record<
  ConnectionState,
  { color: string; glow: string; label: string }
> = {
  connected: {
    color: "oklch(0.720 0.190 148)",
    glow: "0 0 6px oklch(0.720 0.190 148)",
    label: "ONLINE",
  },
  connecting: {
    color: "oklch(0.769 0.153 70.1)",
    glow: "0 0 6px oklch(0.769 0.153 70.1)",
    label: "LINKING",
  },
  disconnected: {
    color: "oklch(0.500 0.100 250)",
    glow: "none",
    label: "OFFLINE",
  },
  error: {
    color: "oklch(0.637 0.208 25.3)",
    glow: "0 0 6px oklch(0.637 0.208 25.3)",
    label: "ERROR",
  },
};

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
  const avgLatency = latency ?? 0;

  return (
    <div className="flex items-center gap-3" title="Connection status">
      {targets.map((target) => {
        const style = STATE_STYLES[target.state];
        return (
          <div
            key={target.short}
            className="flex items-center gap-1.5"
            title={`${target.name}: ${style.label}${target.latency ? ` (${target.latency}ms)` : ""}`}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: style.color,
                boxShadow: style.glow,
                animation:
                  target.state === "connected"
                    ? "gz-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                    : "none",
              }}
            />
            <span
              className="font-mono text-[10px] font-medium tracking-wider"
              style={{ color: style.color }}
            >
              {target.short}
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-1">
        <span
          className="font-mono text-[9px]"
          style={{ color: "oklch(var(--gz-mut))" }}
        >
          {avgLatency > 0 ? `${avgLatency}ms` : "—"}
        </span>
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{
            background: allConnected
              ? "oklch(0.720 0.190 148)"
              : "oklch(0.637 0.208 25.3)",
            boxShadow: allConnected
              ? "0 0 8px oklch(0.720 0.190 148)"
              : "0 0 8px oklch(0.637 0.208 25.3)",
          }}
          title={allConnected ? "All systems operational" : "Connection issues detected"}
        />
      </div>
    </div>
  );
}
