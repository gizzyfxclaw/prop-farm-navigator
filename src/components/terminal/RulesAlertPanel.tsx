import { useState } from "react";
import { money } from "@/lib/engine/calc";
import { useEngine } from "@/lib/useEngine";
import { useStore } from "@/lib/store";
import { computeRecovery } from "@/lib/recovery";
import { marketStatus } from "@/lib/market-hours";

interface Rule {
  id: string;
  category: "compliance" | "execution" | "journal" | "risk";
  text: string;
  detail: string;
  critical?: boolean;
}

const RULES: Rule[] = [
  {
    id: "dpc",
    category: "compliance",
    text: "Daily Profit Cap: $100/day max",
    detail: "Engine auto-reduces risk if reward exceeds cap. Never override manually.",
    critical: true,
  },
  {
    id: "session",
    category: "execution",
    text: "Trade London/NY overlap (13:00-16:00 EST)",
    detail: "Best liquidity. Avoid Asian session entries.",
  },
  {
    id: "entry-time",
    category: "execution",
    text: "Vary entry times: 08:13, 10:42, 14:05",
    detail: "Avoids prop firm AI bot detection. Never trade at round times.",
  },
  {
    id: "sl-pips",
    category: "execution",
    text: "Vary SL pips: 28, 35, 22",
    detail: "Avoids prop firm AI bot detection. Rotate between these values.",
  },
  {
    id: "news",
    category: "execution",
    text: "NO pending orders ±30min red-folder news",
    detail: "Check ForexFactory calendar. Red folder = high impact.",
    critical: true,
  },
  {
    id: "order-exec",
    category: "execution",
    text: "Exness FIRST → Prop SECOND",
    detail: "Place Exness trade, wait for green confirmation, THEN place Prop manually.",
    critical: true,
  },
  {
    id: "mt5-check",
    category: "execution",
    text: "Check Live MT5 tab before trading",
    detail: "Confirms MetaApi/VPS online. Must show live balance.",
  },
  {
    id: "signs",
    category: "journal",
    text: "Log P&L signs correctly",
    detail: "Prop WIN → Exness P&L MUST be negative. Prop LOSS → Exness P&L MUST be positive.",
    critical: true,
  },
  {
    id: "bad-data",
    category: "journal",
    text: "Clear bad Journal data immediately",
    detail: "If Exness P&L is positive for a Prop Win, click 'Clear all' and start fresh.",
  },
  {
    id: "refresh",
    category: "execution",
    text: "Hard refresh after deployment (Ctrl+Shift+R)",
    detail: "Loads latest JS bundle. Prevents stale cache issues.",
  },
];

export function RulesAlertPanel() {
  const r = useEngine();
  const { engine, journal } = useStore();
  const recovery = computeRecovery(r, journal);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  const market = marketStatus();

  const activeAlerts: { rule: Rule; active: boolean; message: string }[] = [
    {
      rule: RULES[0],
      active: r.riskCapped,
      message: r.riskCapped
        ? `Risk reduced to $${r.cappedPropRisk.toFixed(2)} (reward capped at $${(r.cappedPropRisk * r.rr).toFixed(2)})`
        : `Current reward: $${r.propWinPerTrade.toFixed(2)} — under cap`,
    },
    {
      rule: RULES[5],
      active: recovery.bufferDepleted,
      message: recovery.bufferDepleted
        ? `Deposit $${recovery.depositNeeded.toFixed(2)} to continue`
        : `Exness balance: sufficient`,
    },
    {
      rule: RULES[7],
      active: (() => {
        const badTrade = journal.find(
          (t) => t.result === "WIN" && t.exPnl > 0
        );
        return !!badTrade;
      })(),
      message: "Bad trade data detected! Click 'Clear all' in Journal.",
    },
  ];

  const criticalAlerts = activeAlerts.filter((a) => a.active && a.rule.critical);
  const warningAlerts = activeAlerts.filter((a) => a.active && !a.rule.critical);
  const visibleRules = RULES.filter((rule) => !dismissed.has(rule.id));

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a]">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#1a1a1a] bg-[#0f0f0f]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase text-[#8a8a8a]" style={{ letterSpacing: "0.08em" }}>
            Rules & Alerts
          </span>
          {criticalAlerts.length > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white animate-pulse">
              {criticalAlerts.length}
            </span>
          )}
          {warningAlerts.length > 0 && criticalAlerts.length === 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[9px] font-bold text-white">
              {warningAlerts.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-[#8a8a8a] hover:text-white transition-colors"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </header>

      <div className="p-3">
        {/* Critical Alerts */}
        {criticalAlerts.length > 0 && (
          <div className="mb-3 space-y-2">
            {criticalAlerts.map((a) => (
              <div key={a.rule.id} className="flex items-start gap-2 rounded border border-red-800/40 bg-red-950/30 p-2">
                <span className="mt-0.5 text-red-500 text-xs">🚨</span>
                <div>
                  <div className="font-mono text-[11px] font-bold text-red-400">{a.rule.text}</div>
                  <div className="font-mono text-[10px] text-red-400/70">{a.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Warning Alerts */}
        {warningAlerts.length > 0 && criticalAlerts.length === 0 && (
          <div className="mb-3 space-y-2">
            {warningAlerts.map((a) => (
              <div key={a.rule.id} className="flex items-start gap-2 rounded border border-amber-800/40 bg-amber-950/30 p-2">
                <span className="mt-0.5 text-amber-500 text-xs">⚠️</span>
                <div>
                  <div className="font-mono text-[11px] font-bold text-amber-400">{a.rule.text}</div>
                  <div className="font-mono text-[10px] text-amber-400/70">{a.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Collapsible Rules List */}
        {expanded && (
          <div className="space-y-1">
            {visibleRules.map((rule) => {
              const alert = activeAlerts.find((a) => a.rule.id === rule.id);
              const isActive = alert?.active;
              return (
                <div
                  key={rule.id}
                  className={`flex items-start gap-2 rounded p-2 transition-colors ${
                    isActive
                      ? "bg-red-950/20 border border-red-800/30"
                      : "hover:bg-[#0f0f0f]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3 w-3 rounded border-[#333] bg-[#0a0a0a] accent-emerald-600"
                    title="Dismiss this rule"
                    onChange={() => setDismissed((prev) => new Set([...prev, rule.id]))}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#e0e0e0]">
                        {rule.text}
                      </span>
                      {rule.critical && (
                        <span className="font-mono text-[8px] font-bold uppercase text-red-500 bg-red-950/40 px-1 rounded">
                          Critical
                        </span>
                      )}
                      <span className="font-mono text-[8px] uppercase text-[#666]">
                        {rule.category}
                      </span>
                    </div>
                    <div className="font-mono text-[9px] text-[#888]">{rule.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Session Status */}
        <div className="mt-3 flex items-center gap-3 border-t border-[#1a1a1a] pt-2">
          <div className="flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${market.open ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="font-mono text-[9px] text-[#888]">
              {market.open ? "Market Open" : "Market Closed"}
            </span>
          </div>
          <div className="font-mono text-[9px] text-[#666]">
            {market.label}
          </div>
          <div className="ml-auto font-mono text-[9px] text-[#666]">
            {r.phase === 1 ? "Phase 1" : "Phase 2"} · R:R 1:{r.rr}
          </div>
        </div>
      </div>
    </div>
  );
}
