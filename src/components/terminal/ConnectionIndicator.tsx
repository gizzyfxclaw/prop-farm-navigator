import { useEffect, useState } from "react";

type ConnectionState = "connected" | "connecting" | "disconnected" | "error";

type ConnectionTarget = {
  name: string;
  short: string;
  state: ConnectionState;
  latency?: number;
};

function useSimulatedConnections(): ConnectionTarget[] {
  const [targets, setTargets] = useState<ConnectionTarget[]>([
    { name: "MetaApi Cloud", short: "API", state: "connected", latency: 42 },
    { name: "MT5 Bridge", short: "MT5", state: "connected", latency: 18 },
    { name: "Price Feed", short: "FEED", state: "connected", latency: 7 },
  ]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTargets((prev) =>
        prev.map((t) => ({
          ...t,
          latency: Math.max(5, (t.latency ?? 20) + Math.floor(Math.random() * 10 - 5)),
        }))
      );
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return targets;
}

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
  const targets = useSimulatedConnections();
  const allConnected = targets.every((t) => t.state === "connected");
  const avgLatency = Math.round(
    targets.reduce((sum, t) => sum + (t.latency ?? 0), 0) / targets.length
  );

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
          {avgLatency}ms
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