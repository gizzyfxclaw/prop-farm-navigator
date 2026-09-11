import { useState } from "react";
import { Bot, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";

export interface HermesAnalysis {
  analysis: string;
  direction: "BUY" | "SELL" | "NEUTRAL" | "UNKNOWN";
  confidence: number;
  affected_pairs: string[];
  spike_pips: string;
  duration: string;
  cached?: boolean;
}

interface HermesPanelProps {
  events: Array<{
    id: string;
    event: string;
    currency: string;
    impact: string;
    secondsUntil: number;
    forecast: string;
    previous: string;
  }>;
  analyses: Record<string, HermesAnalysis | "loading" | undefined>;
  onAnalyze: (id: string) => void;
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds < 0) return "PASSED";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function HermesPanel({ events, analyses, onAnalyze }: HermesPanelProps) {
  const [expanded, setExpanded] = useState(true);
  
  if (events.length === 0) return null;

  return (
    <div className="panel" style={{ padding: 0, borderColor: "oklch(var(--gz-p) / 0.25)" }}>
      <div
        className="panel-head"
        style={{ background: "oklch(var(--gz-p) / 0.05)", cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Bot size={14} style={{ color: "oklch(var(--gz-p))" }} />
          <h2 className="panel-head-title">Hermes AI Analysis</h2>
          <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>
            {events.length} event{events.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>
            Click to {expanded ? "collapse" : "expand"}
          </span>
          {expanded ? <ChevronUp size={14} style={{ color: "oklch(var(--gz-p))" }} /> : <ChevronDown size={14} style={{ color: "oklch(var(--gz-p))" }} />}
        </div>
      </div>
      {expanded && (
        <div className="space-y-3 p-4">
          {events.map((ev) => {
            const analysis = analyses[ev.id];
            if (analysis === "loading" || !analysis) {
              return (
                <div key={ev.id} className="rounded-lg p-4" style={{ background: "oklch(var(--gz-s2) / 0.5)", border: "1px solid oklch(var(--gz-p) / 0.15)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-danger">HIGH</span>
                      <span className="text-sm font-semibold" style={{ color: "oklch(var(--gz-txt))" }}>{ev.event}</span>
                      <span className="font-mono text-[10px] tabular-nums" style={{ color: "oklch(var(--gz-mut))" }}>{formatCountdown(ev.secondsUntil)}</span>
                    </div>
                    <button
                      onClick={() => onAnalyze(ev.id)}
                      className="text-[10px] mono-cap font-bold cursor-pointer px-2 py-1 rounded"
                      style={{ background: "oklch(var(--gz-p) / 0.1)", color: "oklch(var(--gz-p))", border: "1px solid oklch(var(--gz-p) / 0.3)" }}
                    >
                      Analyze Now
                    </button>
                  </div>
                  <p className="text-[11px]" style={{ color: "oklch(var(--gz-mut))" }}>
                    Click "Analyze Now" to get market direction, confidence, and impact prediction from Hermes AI.
                  </p>
                </div>
              );
            }
            const dirColor =
              analysis.direction === "BUY" ? "oklch(var(--gz-pos))" :
              analysis.direction === "SELL" ? "oklch(var(--gz-neg))" :
              "oklch(var(--gz-mut))";
            const DirIcon =
              analysis.direction === "BUY" ? TrendingUp :
              analysis.direction === "SELL" ? TrendingDown :
              Minus;
            return (
              <div key={ev.id} className="rounded-lg p-4" style={{ background: "oklch(var(--gz-s2))", border: `1px solid ${dirColor}20` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-danger">HIGH</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(var(--gz-txt))" }}>{ev.event}</span>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: "oklch(var(--gz-mut))" }}>{formatCountdown(ev.secondsUntil)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <DirIcon size={16} style={{ color: dirColor }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: dirColor, letterSpacing: "0.05em" }}>{analysis.direction}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${dirColor}15`, color: dirColor }}>
                      {analysis.confidence}%
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "oklch(var(--gz-txt) / 0.9)", marginBottom: 8 }}>
                  {analysis.analysis}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: "oklch(var(--gz-mut))" }}>Pairs:</span>
                  {analysis.affected_pairs.slice(0, 4).map((p) => (
                    <span key={p} className="badge badge-neutral" style={{ fontSize: 9, padding: "1px 5px" }}>{p}</span>
                  ))}
                  <span className="text-[10px] ml-auto" style={{ color: "oklch(var(--gz-mut))" }}>
                    Impact: {analysis.spike_pips} pips · {analysis.duration}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
