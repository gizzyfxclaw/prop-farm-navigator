import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, Activity, RefreshCw, Gauge,
  Layers, ShieldCheck, AlertTriangle, ArrowRight, Zap, ChevronDown, ChevronUp,
  ExternalLink, Users, Award,
} from "lucide-react";
import { Badge, Button } from "@/components/terminal/ui";

interface TechnicalsData {
  pair: string;
  ticker: string;
  interval: string;
  summary: {
    score: number;
    verdict: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
    counts: { buy: number; neutral: number; sell: number };
  };
  oscillators: {
    score: number;
    verdict: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
    counts: { buy: number; neutral: number; sell: number };
    rows: Array<{ name: string; value: number | null; action: "Buy" | "Sell" | "Neutral" }>;
  };
  moving_averages: {
    score: number;
    verdict: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
    counts: { buy: number; neutral: number; sell: number };
    rows: Array<{ name: string; value: number | null; action: "Buy" | "Sell" | "Neutral" }>;
  };
  pivots: {
    classic: { r3: number; r2: number; r1: number; p: number; s1: number; s2: number; s3: number };
    fibonacci: { r3: number; r2: number; r1: number; p: number; s1: number; s2: number; s3: number };
    camarilla: { r3: number; r2: number; r1: number; p: number; s1: number; s2: number; s3: number };
    woodie: { r3: number; r2: number; r1: number; p: number; s1: number; s2: number; s3: number };
    demark: { r1: number; p: number; s1: number };
  };
  price: {
    close: number;
    open: number;
    high: number;
    low: number;
  };
  timestamp: string;
}

interface CommunityReport {
  pair: string;
  totalAnalyzed: number;
  sentiment: {
    longCount: number;
    shortCount: number;
    neutralCount: number;
    longPct: number;
    shortPct: number;
    bias: string;
  };
  topRatedIdeas: Array<{
    id: string;
    title: string;
    author: string;
    authorUrl: string;
    link: string;
    description: string;
    image?: string;
    direction: "LONG" | "SHORT" | "NEUTRAL";
    accuracyScore: number;
    accuracyGrade: string;
    verdict: string;
    confluencePoints: string[];
    riskWarnings: string[];
  }>;
  synthesis: string;
  actionableRecommendation: string;
}

const TIMEFRAMES = [
  { label: "1 minute", value: "1m" },
  { label: "5 minutes", value: "5m" },
  { label: "15 minutes", value: "15m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "2 hours", value: "2h" },
  { label: "4 hours", value: "4h" },
  { label: "1 day", value: "1d" },
  { label: "1 week", value: "1w" },
  { label: "1 month", value: "1M" },
];

const PAIR_NAMES: Record<string, string> = {
  EURUSD: "Euro / U.S. Dollar",
  USDJPY: "U.S. Dollar / Japanese Yen",
  GBPUSD: "British Pound / U.S. Dollar",
  AUDUSD: "Australian Dollar / U.S. Dollar",
  USDCAD: "U.S. Dollar / Canadian Dollar",
  NZDUSD: "New Zealand Dollar / U.S. Dollar",
  USDCHF: "U.S. Dollar / Swiss Franc",
  XAUUSD: "Gold / U.S. Dollar",
};

function formatVerdict(v: string) {
  switch (v) {
    case "STRONG_BUY": return "Strong buy";
    case "BUY": return "Buy";
    case "STRONG_SELL": return "Strong sell";
    case "SELL": return "Sell";
    default: return "Neutral";
  }
}

function getVerdictColor(v: string) {
  switch (v) {
    case "STRONG_BUY":
    case "BUY":
      return "var(--tv-teal, oklch(var(--gz-pos)))";
    case "STRONG_SELL":
    case "SELL":
      return "var(--tv-red, oklch(var(--gz-neg)))";
    default:
      return "var(--tv-text-secondary, oklch(var(--gz-mut)))";
  }
}

function getActionColor(action: "Buy" | "Sell" | "Neutral") {
  if (action === "Buy") return "var(--tv-blue, oklch(var(--gz-p)))";
  if (action === "Sell") return "var(--tv-red, oklch(var(--gz-neg)))";
  return "var(--tv-text-secondary, oklch(var(--gz-mut)))";
}

// TradingView Speedometer Semi-circle SVG Gauge
function SpeedometerGauge({
  title,
  score,
  verdict,
  counts,
}: {
  title: string;
  score: number;
  verdict: string;
  counts: { buy: number; neutral: number; sell: number };
}) {
  const clampedScore = Math.max(-1, Math.min(1, score));
  const angle = clampedScore * 80;
  const verdictText = formatVerdict(verdict);
  const verdictColor = getVerdictColor(verdict);

  return (
    <div className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-card/60 border border-border">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </span>

      {/* SVG Arc Gauge */}
      <div className="relative w-48 h-28 flex items-center justify-center">
        <svg viewBox="0 0 200 120" className="w-full h-full overflow-visible">
          {/* Background Track */}
          <path
            d="M 25 105 A 75 75 0 0 1 175 105"
            fill="none"
            stroke="oklch(var(--gz-p) / 0.12)"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Red Arc (Sell side: left) */}
          <path
            d="M 25 105 A 75 75 0 0 1 78 42"
            fill="none"
            stroke="var(--tv-red, #f23645)"
            strokeWidth="8"
            strokeLinecap="round"
            opacity={clampedScore < -0.1 ? 0.95 : 0.4}
          />

          {/* Neutral Arc (Top) */}
          <path
            d="M 83 38 A 75 75 0 0 1 117 38"
            fill="none"
            stroke="var(--tv-text-secondary, #787b86)"
            strokeWidth="8"
            strokeLinecap="round"
            opacity={Math.abs(clampedScore) <= 0.1 ? 0.95 : 0.4}
          />

          {/* Green Arc (Buy side: right) */}
          <path
            d="M 122 42 A 75 75 0 0 1 175 105"
            fill="none"
            stroke="var(--tv-teal, #089981)"
            strokeWidth="8"
            strokeLinecap="round"
            opacity={clampedScore > 0.1 ? 0.95 : 0.4}
          />

          {/* Clean text markers inside SVG coordinate system */}
          <text x="18" y="118" fill="var(--tv-red, #f23645)" fontSize="9" fontWeight="700" textAnchor="start" fontFamily="sans-serif">
            Strong sell
          </text>
          <text x="100" y="24" fill="var(--tv-text-secondary, #787b86)" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">
            Neutral
          </text>
          <text x="182" y="118" fill="var(--tv-teal, #089981)" fontSize="9" fontWeight="700" textAnchor="end" fontFamily="sans-serif">
            Strong buy
          </text>

          {/* Needle Indicator */}
          <g transform={`rotate(${angle}, 100, 105)`} style={{ transition: "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
            <line
              x1="100"
              y1="105"
              x2="100"
              y2="34"
              stroke="oklch(var(--gz-txt))"
              strokeWidth="3.5"
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,0.5))" }}
            />
            <circle cx="100" cy="105" r="6" fill="oklch(var(--gz-txt))" />
            <circle cx="100" cy="105" r="3" fill="var(--tv-blue, oklch(var(--gz-p)))" />
          </g>
        </svg>
      </div>

      {/* Large Verdict */}
      <span className="text-base font-extrabold mt-2 uppercase tracking-wide" style={{ color: verdictColor }}>
        {verdictText}
      </span>

      {/* 3-Column Breakdown (Sell / Neutral / Buy) */}
      <div className="grid grid-cols-3 gap-4 text-center mt-2 pt-2 border-t border-border/40 w-full font-mono">
        <div>
          <span className="text-[10px] text-muted-foreground block font-sans uppercase">Sell</span>
          <span className="text-sm font-bold text-destructive">{counts.sell}</span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block font-sans uppercase">Neutral</span>
          <span className="text-sm font-bold text-muted-foreground">{counts.neutral}</span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block font-sans uppercase">Buy</span>
          <span className="text-sm font-bold text-primary">{counts.buy}</span>
        </div>
      </div>
    </div>
  );
}

export function TradingViewTechnicalsPanel({
  pair,
  smcBias,
}: {
  pair: string;
  smcBias?: "bullish" | "bearish" | "neutral";
}) {
  const [interval, setInterval] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("gizzyfx.technicals.interval") || "1h";
      } catch {}
    }
    return "1h";
  });
  const [data, setData] = useState<TechnicalsData | null>(null);
  const [communityReport, setCommunityReport] = useState<CommunityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"gauges" | "oscillators" | "moving_averages" | "pivots" | "community">(() => {
    if (typeof window !== "undefined") {
      try {
        return (localStorage.getItem("gizzyfx.technicals.tab") as any) || "gauges";
      } catch {}
    }
    return "gauges";
  });

  const cleanPair = pair.toUpperCase().replace(/[^A-Z]/g, "") || "EURUSD";
  const fullName = PAIR_NAMES[cleanPair] || `${cleanPair} Technicals`;

  useEffect(() => {
    try {
      localStorage.setItem("gizzyfx.technicals.interval", interval);
    } catch {}
  }, [interval]);

  useEffect(() => {
    try {
      localStorage.setItem("gizzyfx.technicals.tab", activeTab);
    } catch {}
  }, [activeTab]);

  const fetchTechnicals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/technicals?pair=${cleanPair}&interval=${interval}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load TradingView technicals");
    } finally {
      setLoading(false);
    }
  }, [cleanPair, interval]);

  const fetchCommunityIdeas = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const res = await fetch(`/api/tradingview-ideas?pair=${cleanPair}`);
      if (res.ok) {
        const json = await res.json();
        setCommunityReport(json);
      }
    } catch {}
    finally {
      setCommunityLoading(false);
    }
  }, [cleanPair]);

  useEffect(() => {
    fetchTechnicals();
    fetchCommunityIdeas();
    const id = window.setInterval(fetchTechnicals, 30_000);
    return () => window.clearInterval(id);
  }, [fetchTechnicals, fetchCommunityIdeas]);

  // Compute Confluence between SMC Structure and TradingView Technicals
  const tvVerdict = data?.summary.verdict;
  const isConfluent =
    (smcBias === "bullish" && (tvVerdict === "BUY" || tvVerdict === "STRONG_BUY")) ||
    (smcBias === "bearish" && (tvVerdict === "SELL" || tvVerdict === "STRONG_SELL"));

  const isDivergent =
    (smcBias === "bullish" && (tvVerdict === "SELL" || tvVerdict === "STRONG_SELL")) ||
    (smcBias === "bearish" && (tvVerdict === "BUY" || tvVerdict === "STRONG_BUY"));

  const confluenceScore = isConfluent ? 92 : isDivergent ? 45 : 70;

  return (
    <div className="panel space-y-4" style={{ background: "var(--tv-surface)", borderColor: "var(--tv-border)" }}>
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs text-primary">
            TV
          </div>
          <div>
            <h2 className="font-bold text-sm text-foreground">{fullName} • Technicals</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              Live Institutional Data & Community Pro Analyses from TradingView
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={fetchTechnicals} disabled={loading} style={{ height: 32 }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Timeframe Switcher Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-institutional">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setInterval(tf.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
              interval === tf.value
                ? "bg-secondary text-primary border border-primary/30 shadow-sm"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="alert alert-red">{error}</div>
      ) : !data ? (
        <div className="py-12 text-center text-muted-foreground">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2 opacity-50" />
          <p className="text-xs font-mono">Loading TradingView technical indicators…</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SMC + TRADINGVIEW CONFLUENCE HIGHLIGHT CARD */}
          {smcBias && (
            <div
              className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3"
              style={{
                background: isConfluent ? "oklch(var(--gz-pos) / 0.08)" : isDivergent ? "oklch(var(--gz-neg) / 0.08)" : "var(--tv-surface-subtle)",
                borderColor: isConfluent ? "var(--tv-teal)" : isDivergent ? "var(--tv-red)" : "var(--tv-border)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-card">
                  {isConfluent ? (
                    <ShieldCheck size={20} className="text-success" />
                  ) : isDivergent ? (
                    <AlertTriangle size={20} className="text-destructive" />
                  ) : (
                    <Activity size={20} className="text-primary" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs uppercase tracking-wide">
                      {isConfluent ? "High-Probability Alignment (SMC + TradingView)" : isDivergent ? "Technical Divergence Warning" : "Neutral / Developing Confluence"}
                    </span>
                    <Badge tone={isConfluent ? "green" : isDivergent ? "red" : "amber"}>
                      {confluenceScore}% Grade
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    SMC Bias: <strong className="uppercase text-foreground">{smcBias}</strong> | TradingView Consensus: <strong className="text-foreground">{formatVerdict(data.summary.verdict)}</strong>
                  </p>
                </div>
              </div>

              <div className="font-mono text-xs text-right">
                <span className="text-muted-foreground block text-[10px]">TradingView Close</span>
                <span className="font-bold text-sm text-foreground">{data.price.close}</span>
              </div>
            </div>
          )}

          {/* 3 Speedometer Gauges (Summary, Oscillators, Moving Averages) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SpeedometerGauge
              title="Summary"
              score={data.summary.score}
              verdict={data.summary.verdict}
              counts={data.summary.counts}
            />
            <SpeedometerGauge
              title="Oscillators"
              score={data.oscillators.score}
              verdict={data.oscillators.verdict}
              counts={data.oscillators.counts}
            />
            <SpeedometerGauge
              title="Moving Averages"
              score={data.moving_averages.score}
              verdict={data.moving_averages.verdict}
              counts={data.moving_averages.counts}
            />
          </div>

          {/* Section Tabs */}
          <div className="flex border-b border-border/50 gap-2 pt-2 flex-wrap">
            <button
              onClick={() => setActiveTab("oscillators")}
              className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border-b-2 ${
                activeTab === "oscillators"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Oscillators ({data.oscillators.rows.length})
            </button>
            <button
              onClick={() => setActiveTab("moving_averages")}
              className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border-b-2 ${
                activeTab === "moving_averages"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Moving Averages ({data.moving_averages.rows.length})
            </button>
            <button
              onClick={() => setActiveTab("pivots")}
              className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border-b-2 ${
                activeTab === "pivots"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Pivots (Key Levels)
            </button>
            <button
              onClick={() => setActiveTab("community")}
              className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border-b-2 flex items-center gap-1.5 ${
                activeTab === "community"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users size={12} />
              Community Pro Setups ({communityReport?.topRatedIdeas.length ?? "…"})
            </button>
          </div>

          {/* TAB 1: OSCILLATORS TABLE */}
          {activeTab === "oscillators" && (
            <div className="overflow-x-auto scrollbar-institutional">
              <table className="dgrid w-full">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th style={{ textAlign: "right" }}>Value</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.oscillators.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-secondary/40">
                      <td className="font-medium text-foreground text-xs py-2">{r.name}</td>
                      <td className="font-mono text-xs text-right text-foreground font-semibold">
                        {r.value != null ? r.value.toFixed(5).replace(/\.?0+$/, '') : "—"}
                      </td>
                      <td className="text-right font-bold text-xs" style={{ color: getActionColor(r.action) }}>
                        {r.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: MOVING AVERAGES TABLE */}
          {activeTab === "moving_averages" && (
            <div className="overflow-x-auto scrollbar-institutional">
              <table className="dgrid w-full">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th style={{ textAlign: "right" }}>Value</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.moving_averages.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-secondary/40">
                      <td className="font-medium text-foreground text-xs py-2">{r.name}</td>
                      <td className="font-mono text-xs text-right text-foreground font-semibold">
                        {r.value != null ? r.value.toFixed(5).replace(/\.?0+$/, '') : "—"}
                      </td>
                      <td className="text-right font-bold text-xs" style={{ color: getActionColor(r.action) }}>
                        {r.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: PIVOTS TABLE */}
          {activeTab === "pivots" && (
            <div className="overflow-x-auto scrollbar-institutional">
              <table className="dgrid w-full">
                <thead>
                  <tr>
                    <th>Pivot</th>
                    <th style={{ textAlign: "right" }}>Classic</th>
                    <th style={{ textAlign: "right" }}>Fibonacci</th>
                    <th style={{ textAlign: "right" }}>Camarilla</th>
                    <th style={{ textAlign: "right" }}>Woodie</th>
                    <th style={{ textAlign: "right" }}>DM</th>
                  </tr>
                </thead>
                <tbody>
                  {["R3", "R2", "R1", "P", "S1", "S2", "S3"].map((level) => {
                    const lKey = level.toLowerCase() as "r3" | "r2" | "r1" | "p" | "s1" | "s2" | "s3";
                    const isPivot = level === "P";
                    const isResistance = level.startsWith("R");
                    const isSupport = level.startsWith("S");
                    return (
                      <tr key={level} className="hover:bg-secondary/40">
                        <td className="font-mono font-bold text-xs py-2" style={{
                          color: isResistance ? "var(--tv-red)" : isSupport ? "var(--tv-teal)" : "var(--tv-blue)"
                        }}>
                          {level}
                        </td>
                        <td className="font-mono text-xs text-right">{data.pivots.classic[lKey] != null ? data.pivots.classic[lKey].toFixed(5) : "—"}</td>
                        <td className="font-mono text-xs text-right">{data.pivots.fibonacci[lKey] != null ? data.pivots.fibonacci[lKey].toFixed(5) : "—"}</td>
                        <td className="font-mono text-xs text-right">{data.pivots.camarilla[lKey] != null ? data.pivots.camarilla[lKey].toFixed(5) : "—"}</td>
                        <td className="font-mono text-xs text-right">{data.pivots.woodie[lKey] != null ? data.pivots.woodie[lKey].toFixed(5) : "—"}</td>
                        <td className="font-mono text-xs text-right">
                          {level === "R1" ? data.pivots.demark.r1?.toFixed(5) : level === "P" ? data.pivots.demark.p?.toFixed(5) : level === "S1" ? data.pivots.demark.s1?.toFixed(5) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: COMMUNITY PRO IDEAS GRADED BY ACCURACY */}
          {activeTab === "community" && (
            <div className="space-y-4">
              {communityLoading ? (
                <div className="py-8 text-center text-muted-foreground font-mono text-xs">
                  Fetching top-rated TradingView analyses and evaluating institutional accuracy…
                </div>
              ) : !communityReport || communityReport.topRatedIdeas.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  No community trade ideas found for {cleanPair}.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Consensus Header */}
                  <div className="p-3 rounded-lg bg-secondary/50 border border-border/60 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Award size={16} className="text-primary" />
                        <span className="font-bold text-xs uppercase tracking-wide text-foreground">
                          Community Sentiment: {communityReport.sentiment.bias.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{communityReport.synthesis}</p>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                        {communityReport.sentiment.longPct}% Long
                      </span>
                      <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-bold">
                        {communityReport.sentiment.shortPct}% Short
                      </span>
                    </div>
                  </div>

                  {/* List of Pro Analyses Graded by Accuracy */}
                  <div className="space-y-3">
                    {communityReport.topRatedIdeas.map((idea) => {
                      const gradeTone = idea.accuracyScore >= 85 ? "badge-success" : idea.accuracyScore >= 70 ? "badge-warning" : "badge-danger";
                      return (
                        <div key={idea.id} className="p-3.5 rounded-lg bg-card border border-border space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`badge ${gradeTone}`}>{idea.accuracyGrade}</span>
                              <span className="font-bold text-xs text-foreground">{idea.title}</span>
                              <span className="text-[11px] text-muted-foreground">by <strong>{idea.author}</strong></span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${idea.direction === "LONG" ? "bg-emerald-500/15 text-emerald-400" : idea.direction === "SHORT" ? "bg-red-500/15 text-red-400" : "bg-secondary text-muted-foreground"}`}>
                                {idea.direction}
                              </span>
                              <a
                                href={idea.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary flex items-center gap-1 hover:underline"
                              >
                                View Chart <ExternalLink size={11} />
                              </a>
                            </div>
                          </div>

                          <p className="text-xs text-foreground/80 leading-relaxed">{idea.description}</p>

                          {/* Confluence points & warnings */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                            {idea.confluencePoints.length > 0 && (
                              <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 space-y-0.5">
                                <span className="font-bold block text-[10px] uppercase">Validated Confluence:</span>
                                {idea.confluencePoints.map((cp, idx) => (
                                  <div key={idx}>✓ {cp}</div>
                                ))}
                              </div>
                            )}
                            {idea.riskWarnings.length > 0 && (
                              <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20 text-amber-300 space-y-0.5">
                                <span className="font-bold block text-[10px] uppercase">Risk Warning:</span>
                                {idea.riskWarnings.map((rw, idx) => (
                                  <div key={idx}>⚠ {rw}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
            Disclaimer: Technical indicator data and community analysis are sourced directly from TradingView. Combine with GizzyFx SMC order blocks and strict dual-account risk hedging.
          </p>
        </div>
      )}
    </div>
  );
}
