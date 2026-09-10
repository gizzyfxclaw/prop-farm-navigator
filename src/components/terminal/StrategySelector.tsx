/**
 * Strategy Selector — shows the strategy used for analysis
 * and lets you switch between registered strategies.
 */

import { useState, useEffect, useCallback } from "react";

export interface StrategyOption {
  id: string;
  name: string;
  family: string;
  description: string;
}

// Built-in strategies (matching src/lib/strategies/registry.ts)
const BUILT_IN_STRATEGIES: StrategyOption[] = [
  { id: "channel-breakout", name: "GizzyFx Channel Breakout", family: "SMC/ICT", description: "Parallel channel breakout with retest confirmation" },
  { id: "asia-sweep-reversals", name: "Asia Sweep Reversals", family: "SMC/ICT", description: "Asia session range sweep + CHoCH entry" },
  { id: "pdh-l-fvg", name: "PDH/L FVG", family: "SMC/ICT", description: "Previous Day High/Low Fair Value Gap" },
  { id: "trend-continuation", name: "Trend Continuation", family: "Trend", description: "Breakout entries in trend direction" },
  { id: "london-breakout", name: "London Breakout", family: "Session", description: "London session breakout with momentum confirmation" },
  { id: "ema-9-vwap", name: "EMA 9 + VWAP", family: "Trend", description: "EMA 9 + VWAP with ATR Trailing Stop" },
];

export interface StrategySelectorProps {
  value: string;
  onChange: (strategyId: string) => void;
  disabled?: boolean;
}

export function StrategySelector({ value, onChange, disabled }: StrategySelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = BUILT_IN_STRATEGIES.find((s) => s.id === value) ?? BUILT_IN_STRATEGIES[0]!;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-strategy-selector]")) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
    },
    [onChange]
  );

  return (
    <div data-strategy-selector style={{ position: "relative", width: "100%" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${open ? "oklch(var(--gz-p) / 0.4)" : "oklch(var(--gz-p) / 0.15)"}`,
          background: "oklch(var(--gz-s2) / 0.5)",
          color: "oklch(var(--gz-txt))",
          fontSize: 12,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 0.15s ease",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Scale size={14} style={{ color: "oklch(var(--gz-p))" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--gz-txt))" }}>
              {selected.name}
            </span>
            <span style={{ fontSize: 9, fontWeight: 500, color: "oklch(var(--gz-mut))", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {selected.family}
            </span>
          </div>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: "oklch(var(--gz-mut))",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 999,
            background: "oklch(var(--gz-s1) / 0.98)",
            border: "1px solid oklch(var(--gz-p) / 0.15)",
            borderRadius: 8,
            boxShadow: "0 12px 32px oklch(0 0 0 / 0.4)",
            overflow: "hidden",
            backdropFilter: "blur(16px)",
          }}
        >
          {/* Header */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid oklch(var(--gz-p) / 0.1)" }}>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "oklch(var(--gz-mut))" }}>
              Select Strategy
            </p>
          </div>

          {/* Options */}
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {BUILT_IN_STRATEGIES.map((s) => {
              const isActive = s.id === value;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    background: isActive ? "oklch(var(--gz-p) / 0.1)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid oklch(var(--gz-p) / 0.06)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "oklch(var(--gz-p) / 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? "oklch(var(--gz-p))" : "oklch(var(--gz-txt))" }}>
                        {s.name}
                      </span>
                      {isActive && (
                        <CheckCircle2 size={10} style={{ color: "oklch(var(--gz-p))" }} />
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: "oklch(var(--gz-mut))", fontWeight: 500 }}>
                      {s.description}
                    </span>
                  </div>
                  <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "oklch(var(--gz-mut) / 0.6)", flexShrink: 0 }}>
                    {s.family}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import { Scale, ChevronDown, CheckCircle2 } from "lucide-react";
