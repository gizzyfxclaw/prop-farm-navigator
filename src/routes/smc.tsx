import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Target, AlertTriangle, BarChart3 } from "lucide-react";
import { Badge, Button, Card } from "@/components/terminal/ui";
import { generatePineScript, getPineScriptSummary } from "@/lib/pine-script-generator";

export const Route = createFileRoute("/smc")({
  head: () => ({
    meta: [{ title: "SMC Analysis — GizzyFx" }],
  }),
  component: SMCPage,
});

interface SMCSummary {
  ok: boolean;
  error?: string;
  structure: {
    swings: Array<{ idx: number; price: number; kind: "high" | "low" }>;
    bias: "bullish" | "bearish" | "neutral";
    bos: "bullish" | "bearish" | null;
    choch: "bullish" | "bearish" | null;
    lastBosIdx: number | null;
    lastChochIdx: number | null;
  };
  orderBlocks: Array<{ low: number; high: number; kind: "bullish" | "bearish"; idx: number; impulseMag: number; }>;
  fvgs: Array<{ low: number; high: number; kind: "bullish" | "bearish"; idx: number; filled: boolean; }>;
  sweeps: Array<{ idx: number; kind: "bullish" | "bearish"; sweptLevel: number; close: number; }>;
  zone: { zone: string; depthPct?: number; rangeHigh?: number; rangeLow?: number; rangeMid?: number; };
  summary: string;
  pair: string;
  interval: string;
  barCount: number;
}

interface DebateSynthesis {
  bullCase: { direction: string; points: Array<{ claim: string; evidence: string; confidence: number; }>; overallConfidence: number; keyLevel: string; invalidation: string; };
  bearCase: { direction: string; points: Array<{ claim: string; evidence: string; confidence: number; }>; overallConfidence: number; keyLevel: string; invalidation: string; };
  debateRounds: string[];
  finalVerdict: string;
  confidence: number;
  finalRationale: string;
  entryZone: string;
  invalidationLevel: string;
  riskReward: string;
}

interface PatternResult {
  pattern: string;
  quality: "High" | "Medium" | "Low";
  direction: "bullish" | "bearish" | "neutral";
  entry: { aggressive: string; conservative: string };
  stopLoss: string;
  targets: { t1: string; t2: string };
  invalidation: string;
  confidence: number;
}

const PAIRS = ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "XAUUSD"];
const TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
type TF = (typeof TIMEFRAMES)[number];

function SMCPage() {
  const [pair, setPair] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState<TF>("1h");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SMCSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/smc?pair=${pair}&interval=${timeframe}&limit=500`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Analysis failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch SMC data");
    } finally {
      setLoading(false);
    }
  }, [pair, timeframe]);

  useEffect(() => { load(); }, [load]);

  const bias = data?.structure?.bias ?? "neutral";
  const biasColor = bias === "bullish" ? "green" : bias === "bearish" ? "red" : "neutral";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">SMC Analysis</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Smart Money Concepts — market structure, order blocks, FVGs, and liquidity sweeps.
        </p>
      </div>

      <Card title="Configuration">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1">Pair</label>
            <select className="w-full rounded-md border border-white/10 bg-background px-3 py-2 text-[13px]" value={pair} onChange={(e) => setPair(e.target.value)}>
              {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1">Timeframe</label>
            <select className="w-full rounded-md border border-white/10 bg-background px-3 py-2 text-[13px]" value={timeframe} onChange={(e) => setTimeframe(e.target.value as TF)}>
              {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={load} disabled={loading} className="w-full justify-center">
              <BarChart3 size={12} />
              {loading ? "Analyzing…" : "Refresh Analysis"}
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <div className="alert alert-red">
          <p className="alert-title"><AlertTriangle size={13} /> Error</p>
          <p className="alert-body">{error}</p>
        </div>
      )}

      {data && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-medium text-muted-foreground">
              {data.pair} · {data.interval.toUpperCase()} · {data.barCount} bars
            </span>
            <span className="text-[13px] font-mono text-muted-foreground">{data.summary}</span>
          </div>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Market Structure">
            <div className="flex items-center gap-3">
              {bias === "bullish" ? <TrendingUp size={20} className="text-emerald-400" /> :
               bias === "bearish" ? <TrendingDown size={20} className="text-red-400" /> :
               <BarChart3 size={20} className="text-amber-400" />}
              <div>
                <p className="text-[15px] font-bold capitalize text-foreground">{bias}</p>
                <p className="text-[12px] text-muted-foreground">
                  {data.structure.bos ? `BOS ${data.structure.bos}` : ""}
                  {data.structure.choch ? ` · CHoCH ${data.structure.choch}` : ""}
                  {!data.structure.bos && !data.structure.choch ? "No recent structure break" : ""}
                </p>
              </div>
            </div>
          </Card>
          <Card title="Premium / Discount Zone">
            <div className="flex items-center gap-3">
              <Target size={20} className="text-blue-400" />
              <div>
                <p className="text-[15px] font-bold capitalize text-foreground">{data.zone.zone}</p>
                {data.zone.depthPct !== undefined && (
                  <p className="text-[12px] text-muted-foreground">
                    Depth: {data.zone.depthPct.toFixed(1)}% · Range: {data.zone.rangeLow?.toFixed(5)} – {data.zone.rangeHigh?.toFixed(5)}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {data && data.orderBlocks.length > 0 && (
        <Card title={`Order Blocks (${data.orderBlocks.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-white/10 text-left text-muted-foreground">
                  <th className="px-2 py-1">Type</th><th className="px-2 py-1">Low</th><th className="px-2 py-1">High</th><th className="px-2 py-1">Impulse</th>
                </tr>
              </thead>
              <tbody>
                {data.orderBlocks.slice(-5).map((ob, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="px-2 py-1"><Badge tone={ob.kind === "bullish" ? "green" : "red"}>{ob.kind}</Badge></td>
                    <td className="px-2 py-1 font-mono">{ob.low.toFixed(5)}</td>
                    <td className="px-2 py-1 font-mono">{ob.high.toFixed(5)}</td>
                    <td className="px-2 py-1 font-mono">{ob.impulseMag.toFixed(1)}× ATR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && data.fvgs.length > 0 && (
        <Card title={`Fair Value Gaps (${data.fvgs.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-white/10 text-left text-muted-foreground">
                  <th className="px-2 py-1">Type</th><th className="px-2 py-1">Low</th><th className="px-2 py-1">High</th><th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.fvgs.filter((f) => !f.filled).slice(-5).map((fvg, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="px-2 py-1"><Badge tone={fvg.kind === "bullish" ? "green" : "red"}>{fvg.kind}</Badge></td>
                    <td className="px-2 py-1 font-mono">{fvg.low.toFixed(5)}</td>
                    <td className="px-2 py-1 font-mono">{fvg.high.toFixed(5)}</td>
                    <td className="px-2 py-1"><Badge tone="green">Unfilled</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && data.sweeps.length > 0 && (
        <Card title={`Liquidity Sweeps (${data.sweeps.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-white/10 text-left text-muted-foreground">
                  <th className="px-2 py-1">Type</th><th className="px-2 py-1">Level Swept</th><th className="px-2 py-1">Close</th>
                </tr>
              </thead>
              <tbody>
                {data.sweeps.slice(-5).map((sw, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="px-2 py-1"><Badge tone={sw.kind === "bullish" ? "green" : "red"}>{sw.kind}</Badge></td>
                    <td className="px-2 py-1 font-mono">{sw.sweptLevel.toFixed(5)}</td>
                    <td className="px-2 py-1 font-mono">{sw.close.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && <ConfluenceCard data={data} />}
      {data && <DebateCard pair={data.pair} interval={data.interval} />}
      {data && <PatternCard pair={data.pair} interval={data.interval} />}
      {data && <PineScriptCard pair={data.pair} smc={data} />}
    </div>
  );
}

/* ── Debate Card ────────────────────────────────────────────────────────── */

function DebateCard({ pair, interval }: { pair: string; interval: string }) {
  const [debate, setDebate] = useState<DebateSynthesis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = React.useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/debate?pair=${pair}&interval=${interval}&limit=500`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setDebate(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load debate");
    } finally {
      setLoading(false);
    }
  }, [pair, interval]);

  useEffect(() => {
    if (!loaded.current) { loaded.current = true; load(); }
  }, [load]);

  if (error) {
    return (
      <Card title="Bull vs Bear Debate">
        <div className="alert alert-amber mb-2">
          <p className="alert-title"><AlertTriangle size={13} /> Debate unavailable</p>
          <p className="alert-body">{error}</p>
        </div>
        <Button variant="ghost" onClick={load} disabled={loading}>
          <BarChart3 size={12} /> {loading ? "Retrying…" : "Retry"}
        </Button>
      </Card>
    );
  }

  if (!debate && !loading) return null;

  return (
    <Card title="Bull vs Bear Debate">
      <div className="mb-3">
        <Button variant="ghost" onClick={load} disabled={loading}>
          <BarChart3 size={12} /> {loading ? "Debating…" : "Refresh"}
        </Button>
      </div>
      {debate && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Badge tone={debate.finalVerdict.includes("LONG") ? "green" : debate.finalVerdict.includes("SHORT") ? "red" : "amber"}>
              <Target size={12} /> {debate.finalVerdict.replace("_", " ")}
            </Badge>
            <span className="text-[13px] text-muted-foreground">
              Confidence: {(debate.confidence * 100).toFixed(0)}% · R:R {debate.riskReward}
            </span>
          </div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-[12px] font-bold text-emerald-400 mb-2">BULL CASE ({(debate.bullCase.overallConfidence * 100).toFixed(0)}% confidence)</p>
            <ul className="space-y-1 text-[12px]">
              {debate.bullCase.points.slice(0, 3).map((p, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="text-foreground font-medium">{p.claim}</span>
                  <span className="text-[11px] text-muted-foreground/70"> — {p.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-[12px] font-bold text-red-400 mb-2">BEAR CASE ({(debate.bearCase.overallConfidence * 100).toFixed(0)}% confidence)</p>
            <ul className="space-y-1 text-[12px]">
              {debate.bearCase.points.slice(0, 3).map((p, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="text-foreground font-medium">{p.claim}</span>
                  <span className="text-[11px] text-muted-foreground/70"> — {p.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-4 text-[12px]">
            <div><span className="text-muted-foreground">Entry Zone: </span><span className="font-mono text-emerald-400">{debate.entryZone}</span></div>
            <div><span className="text-muted-foreground">Invalidation: </span><span className="font-mono text-red-400">{debate.invalidationLevel}</span></div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Pattern Card ──────────────────────────────────────────────────────── */

function PatternCard({ pair, interval }: { pair: string; interval: string }) {
  const [patterns, setPatterns] = useState<PatternResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = React.useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern?pair=${pair}&interval=${interval}&limit=300`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setPatterns(json.patterns || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load patterns");
    } finally {
      setLoading(false);
    }
  }, [pair, interval]);

  useEffect(() => {
    if (!loaded.current) { loaded.current = true; load(); }
  }, [load]);

  if (error) {
    return (
      <Card title="Chart Patterns">
        <div className="alert alert-amber mb-2">
          <p className="alert-title"><AlertTriangle size={13} /> Pattern scan unavailable</p>
          <p className="alert-body">{error}</p>
        </div>
        <Button variant="ghost" onClick={load} disabled={loading}>
          <BarChart3 size={12} /> {loading ? "Retrying…" : "Retry"}
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Chart Patterns">
      <div className="mb-3">
        <Button variant="ghost" onClick={load} disabled={loading}>
          <BarChart3 size={12} /> {loading ? "Scanning…" : "Scan Patterns"}
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground mb-3">
        Detects Double Top/Bottom, Head & Shoulders, Triangles, Flags, and Breakout/Retest.
      </p>
      {patterns && patterns.length === 0 && !error && (
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-4 text-center">
          <p className="text-[13px] text-muted-foreground">No clear chart patterns detected</p>
        </div>
      )}
      {patterns && patterns.length > 0 && (
        <div className="space-y-3">
          {patterns.map((p, i) => (
            <div key={i} className={`rounded-md border p-3 ${p.direction === "bullish" ? "border-emerald-500/20 bg-emerald-500/5" : p.direction === "bearish" ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
              <div className="flex items-center justify-between mb-2">
                <Badge tone={p.direction === "bullish" ? "green" : p.direction === "bearish" ? "red" : "amber"}>{p.pattern}</Badge>
                <span className="text-[11px] text-muted-foreground">Confidence: {(p.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="grid gap-1 text-[12px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Direction:</span><span className={p.direction === "bullish" ? "text-emerald-400" : p.direction === "bearish" ? "text-red-400" : "text-amber-400"}>{p.direction}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Entry:</span><span className="text-foreground font-mono">{p.entry.conservative}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Stop:</span><span className="text-red-400 font-mono">{p.stopLoss}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Target:</span><span className="text-emerald-400 font-mono">{p.targets.t1}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── Pine Script Card (FIXED: no require()) ─────────────────────────────── */

function PineScriptCard({ pair, smc }: { pair: string; smc: SMCSummary }) {
  const [script, setScript] = useState<string>("");
  const [showScript, setShowScript] = useState(false);

  const generate = useCallback(() => {
    const smcResult = {
      ok: true,
      structure: smc.structure,
      orderBlocks: smc.orderBlocks,
      fvgs: smc.fvgs,
      sweeps: smc.sweeps,
      zone: smc.zone,
    };
    const code = generatePineScript(smcResult as any, pair);
    setScript(code);
    setShowScript(true);
  }, [pair, smc]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(script);
  }, [script]);

  return (
    <Card title="Pine Script Output">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" onClick={generate}>
          <BarChart3 size={12} /> Generate Pine Script
        </Button>
        {showScript && (
          <Button variant="ghost" onClick={copyToClipboard}>
            <BarChart3 size={12} /> Copy
          </Button>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground mb-3">
        Generates Pine Script v5 code that plots SMC signals on TradingView.
      </p>
      {showScript && (
        <div className="rounded-md border border-white/10 bg-black/30 p-3">
          <pre className="text-[11px] font-mono text-emerald-400 whitespace-pre-wrap overflow-x-auto">{script}</pre>
        </div>
      )}
    </Card>
  );
}

/* ── Confluence Score Card ─────────────────────────────────────────────── */

function ConfluenceCard({ data }: { data: SMCSummary }) {
  let longScore = 0, shortScore = 0;
  if (data.structure.bias === "bullish") longScore += 1;
  if (data.structure.bias === "bearish") shortScore += 1;
  if (data.structure.bos === "bullish") longScore += 1;
  if (data.structure.bos === "bearish") shortScore += 1;
  if (data.structure.choch === "bullish") longScore += 1.5;
  if (data.structure.choch === "bearish") shortScore += 1.5;
  for (const ob of data.orderBlocks.slice(-3)) {
    if (ob.kind === "bullish") longScore += 2;
    if (ob.kind === "bearish") shortScore += 2;
  }
  longScore += data.fvgs.filter((f) => f.kind === "bullish" && !f.filled).length * 0.5;
  shortScore += data.fvgs.filter((f) => f.kind === "bearish" && !f.filled).length * 0.5;
  if (data.sweeps.length > 0) {
    const last = data.sweeps[data.sweeps.length - 1];
    if (last.kind === "bullish") longScore += 2;
    if (last.kind === "bearish") shortScore += 2;
  }
  if (data.zone.zone === "discount" && (data.zone.depthPct ?? 0) > 50) longScore += 0.5;
  if (data.zone.zone === "premium" && (data.zone.depthPct ?? 0) > 50) shortScore += 0.5;

  const total = longScore + shortScore;
  const verdict = longScore >= 4 && longScore > shortScore * 1.5 ? "STRONG LONG" :
                  longScore >= 2.5 && longScore > shortScore ? "LEAN LONG" :
                  shortScore >= 4 && shortScore > longScore * 1.5 ? "STRONG SHORT" :
                  shortScore >= 2.5 && shortScore > longScore ? "LEAN SHORT" : "NEUTRAL";
  const verdictColor = verdict.includes("LONG") ? "green" : verdict.includes("SHORT") ? "red" : "amber";

  return (
    <Card title="SMC Confluence Score">
      <div className="flex items-center gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-emerald-400">Long: {longScore.toFixed(1)}</span>
            <span className="text-red-400">Short: {shortScore.toFixed(1)}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${total > 0 ? (longScore / total) * 100 : 50}%` }} />
          </div>
        </div>
        <Badge tone={verdictColor}><Target size={12} /> {verdict}</Badge>
      </div>
    </Card>
  );
}
