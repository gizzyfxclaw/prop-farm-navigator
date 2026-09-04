import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  TrendingUp, TrendingDown, Target, AlertTriangle, BarChart3, Bot,
  Upload, Camera, Sparkles, CheckCircle2, XCircle, MessageSquare,
  RefreshCw, Clock, Activity, ChevronDown, ChevronUp, Zap, Trash2,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/terminal/ui";
import { generatePineScript } from "@/lib/pine-script-generator";

export const Route = createFileRoute("/smc")({
  head: () => ({ meta: [{ title: "SMC Analysis — GizzyFx" }] }),
  component: SMCPage,
});

/* ── Types ─────────────────────────────────────────────────────── */
interface AnalysisData {
  structure: {
    bias: string;
    bos: string | null;
    orderBlocks: Array<{ low: number; high: number; kind: string; impulseMag: number }>;
    lastSwingHigh: number;
    lastSwingLow: number;
    highs: number;
    lows: number;
  };
  debate: {
    bullCase: { points: Array<{ claim: string; evidence: string }>; overallConfidence: number };
    bearCase: { points: Array<{ claim: string; evidence: string }>; overallConfidence: number };
    finalVerdict: string;
    confidence: number;
    debateRounds: string[];
  };
  levels: {
    direction: string;
    entry: string;
    stopLoss: string;
    takeProfit1: string;
    takeProfit2: string;
    riskReward: string;
  };
  pair: string;
  interval: string;
  barCount: number;
  lastPrice: number;
}

interface HermesReview {
  id: string;
  pair: string;
  timeframe: string;
  smc_data: string;
  user_notes: string | null;
  user_image: string | null;
  status: "pending" | "fulfilled";
  verdict: "match" | "diverge" | "partial" | "neutral" | null;
  feedback: string | null;
  strategy_notes: string | null;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  direction: "long" | "short" | null;
  accuracy_grade: "HIGH" | "STANDARD" | "NONE" | null;
  created_at: string;
  fulfilled_at: string | null;
}

/* ── Storage helpers ────────────────────────────────────────────── */
const LS_KEY = "gizzyfx.smc";

interface Persisted {
  pair: string;
  timeframe: string;
  data: AnalysisData | null;
  fetchedAt: number | null;
  reviews: HermesReview[];
  selectedReviewId: string | null;
  userNotes: string;
}

function readLS(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch { /* ignore */ }
  return { pair: "EURUSD", timeframe: "1h", data: null, fetchedAt: null, reviews: [], selectedReviewId: null, userNotes: "" };
}

function writeLS(v: Partial<Persisted>) {
  try {
    const cur = readLS();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...v }));
  } catch { /* ignore */ }
}

/* ── Constants ──────────────────────────────────────────────────── */
const PAIRS = ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "XAUUSD"];
const TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
type TF = (typeof TIMEFRAMES)[number];

/* ── Main component ─────────────────────────────────────────────── */
function SMCPage() {
  const saved = readLS();

  const [pair, setPair]           = useState(saved.pair);
  const [timeframe, setTimeframe] = useState<TF>(saved.timeframe as TF ?? "1h");
  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState<AnalysisData | null>(saved.data);
  const [fetchedAt, setFetchedAt] = useState<number | null>(saved.fetchedAt);
  const [error, setError]         = useState<string | null>(null);
  const [showPine, setShowPine]   = useState(false);
  const [pineScript, setPineScript] = useState("");

  // Hermes panel
  const [showHermesPanel, setShowHermesPanel] = useState(false);
  const [userNotes, setUserNotes]             = useState(saved.userNotes ?? "");
  const [userImage, setUserImage]             = useState<string | null>(null);
  const [imagePreview, setImagePreview]       = useState<string | null>(null);
  const [submitting, setSubmitting]           = useState(false);

  // Reviews — persisted
  const [reviews, setReviews]               = useState<HermesReview[]>(saved.reviews ?? []);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(saved.selectedReviewId);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [pollingId, setPollingId]           = useState<string | null>(null);  // ID being polled
  const [expandedReview, setExpandedReview] = useState<HermesReview | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimer    = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Persist pair/timeframe/data on every state change ────────── */
  useEffect(() => { writeLS({ pair, timeframe }); }, [pair, timeframe]);
  useEffect(() => { writeLS({ data, fetchedAt }); }, [data, fetchedAt]);
  useEffect(() => { writeLS({ reviews }); }, [reviews]);
  useEffect(() => { writeLS({ selectedReviewId }); }, [selectedReviewId]);
  useEffect(() => { writeLS({ userNotes }); }, [userNotes]);

  /* ── Load expanded review from persisted reviews list ─────────── */
  useEffect(() => {
    if (selectedReviewId && reviews.length > 0) {
      const r = reviews.find(r => r.id === selectedReviewId) ?? null;
      setExpandedReview(r);
    }
  }, [selectedReviewId, reviews]);

  /* ── SMC Analysis fetch ─────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    setShowPine(false);

    try {
      const res = await fetch(`/api/smc-analyze?pair=${pair}&interval=${timeframe}&limit=500`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error || `HTTP ${res.status}`);
      }
      const json = await res.json() as AnalysisData;
      if ((json as any).error) throw new Error((json as any).error);
      setData(json);
      setFetchedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }, [pair, timeframe]);

  /* ── Load all reviews (includes fulfilled ones) ─────────────────── */
  const loadReviews = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingReviews(true);
    try {
      const res = await fetch("/api/hermes/analyze-with-hermes");
      if (res.ok) {
        const json = await res.json() as { reviews: HermesReview[] };
        const all = json.reviews ?? [];
        setReviews(all);
        // If a polled review is now fulfilled, stop polling
        if (pollingId) {
          const found = all.find(r => r.id === pollingId);
          if (found?.status === "fulfilled") {
            setPollingId(null);
            setExpandedReview(found);
            setSelectedReviewId(found.id);
          }
        }
      }
    } catch { /* silent */ } finally {
      if (!quiet) setLoadingReviews(false);
    }
  }, [pollingId]);

  /* ── On mount: load, fetch reviews ─────────────────────────────── */
  useEffect(() => {
    // Only auto-fetch if there's no saved data or it's stale (>30min)
    const stale = !saved.data || !saved.fetchedAt || (Date.now() - saved.fetchedAt > 30 * 60 * 1000);
    if (stale) load();
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Auto-poll when a review is pending ─────────────────────────── */
  useEffect(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (pollingId) {
      pollTimer.current = setInterval(() => loadReviews(true), 8000);
    }
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [pollingId, loadReviews]);

  /* ── Pine script ─────────────────────────────────────────────────── */
  const generatePine = useCallback(() => {
    if (!data) return;
    const smc = { ok: true, structure: data.structure, orderBlocks: data.structure.orderBlocks, fvgs: [], sweeps: [], zone: { zone: "unknown" } };
    setPineScript(generatePineScript(smc as any, pair));
    setShowPine(true);
  }, [pair, data]);

  /* ── Image upload ────────────────────────────────────────────────── */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { alert("Image too large. Max 2MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setUserImage(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setUserImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ── Submit to Hermes ────────────────────────────────────────────── */
  const submitToHermes = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/hermes/analyze-with-hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair,
          smc_data: data,
          user_notes: userNotes || undefined,
          user_image: userImage || undefined,
          timeframe,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      const json = await res.json() as { id: string };
      setUserNotes("");
      setUserImage(null);
      setImagePreview(null);
      setShowHermesPanel(false);
      setPollingId(json.id);  // Start polling for this review
      await loadReviews();
    } catch {
      alert("Failed to submit to Hermes. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Delete review(s) ───────────────────────────────────────────── */
  const deleteReview = async (id: string) => {
    try {
      await fetch(`/api/hermes/analyze-with-hermes?id=${id}`, { method: "DELETE" });
      const updated = reviews.filter(r => r.id !== id);
      setReviews(updated);
      if (expandedReview?.id === id) { setExpandedReview(null); setSelectedReviewId(null); }
    } catch { alert("Delete failed. Try again."); }
  };

  const deleteAll = async () => {
    if (!confirm("Delete all Hermes analysis history? This cannot be undone.")) return;
    try {
      await fetch("/api/hermes/analyze-with-hermes?all=true", { method: "DELETE" });
      setReviews([]);
      setExpandedReview(null);
      setSelectedReviewId(null);
      writeLS({ reviews: [], selectedReviewId: null });
    } catch { alert("Delete failed. Try again."); }
  };

  /* ── Helpers ─────────────────────────────────────────────────────── */
  const bias = data?.structure?.bias ?? "neutral";
  const verdictColor = data?.debate?.finalVerdict?.includes("LONG") ? "green"
    : data?.debate?.finalVerdict?.includes("SHORT") ? "red" : "amber";

  const pendingReviews   = reviews.filter(r => r.status === "pending");
  const fulfilledReviews = reviews.filter(r => r.status === "fulfilled");

  function verdictTone(v: HermesReview["verdict"]): "green" | "red" | "amber" | "neutral" {
    if (v === "match")   return "green";
    if (v === "diverge") return "red";
    if (v === "partial") return "amber";
    return "neutral";
  }

  function openReview(r: HermesReview) {
    setExpandedReview(r);
    setSelectedReviewId(r.id);
  }

  function formatAge(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity size={22} className="text-primary" />
            SMC Analysis
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Real-time Smart Money Concepts — structure, order blocks, levels.
            {fetchedAt && (
              <span className="ml-2 text-[11px] text-muted-foreground/60">
                Last updated: {formatAge(new Date(fetchedAt).toISOString())}
              </span>
            )}
          </p>
        </div>
        {/* Polling indicator */}
        {pollingId && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-[12px] text-primary font-medium">Hermes analyzing...</span>
          </div>
        )}
      </div>

      {/* ── Config ──────────────────────────────────────────────────── */}
      <Card title="Configuration">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1">Pair</label>
            <select
              className="w-full rounded-md border border-white/10 bg-background px-3 py-2 text-[13px]"
              value={pair}
              onChange={(e) => setPair(e.target.value)}
            >
              {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1">Timeframe</label>
            <select
              className="w-full rounded-md border border-white/10 bg-background px-3 py-2 text-[13px]"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TF)}
            >
              {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={load} disabled={loading} className="w-full justify-center">
              <BarChart3 size={12} />
              {loading ? "Analyzing…" : "Analyze Now"}
            </Button>
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => setShowHermesPanel(!showHermesPanel)}
              className="w-full justify-center"
              style={{ background: "oklch(0.55 0.18 280)", color: "#fff" }}
            >
              <Bot size={12} />
              Ask Hermes AI
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Hermes Submission Panel ─────────────────────────────────── */}
      {showHermesPanel && (
        <Card title="Ask Hermes — AI Chart Review" accent="primary">
          <div className="space-y-4">
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <p className="text-[12px] text-primary font-bold mb-1 flex items-center gap-1">
                <Zap size={11} /> How it works
              </p>
              <p className="text-[12px] text-muted-foreground">
                Hermes reads the live SMC data, your notes, and your chart image.
                It then applies the GizzyFx Channel Breakout Strategy and reports back
                with a verdict, entry/SL/TP levels, and accuracy grade — all saved here.
              </p>
            </div>

            <div>
              <label className="text-[12px] text-muted-foreground block mb-1">
                Your Analysis <span className="text-[11px] text-muted-foreground/60">(optional — your own bias, entry idea, or observations)</span>
              </label>
              <textarea
                className="w-full rounded-md border border-white/10 bg-background px-3 py-2 text-[13px] min-h-[90px] resize-none"
                placeholder="e.g. I see a bullish OB at 1.0850 with BOS confirmed. Planning to buy the retest with SL at 1.0820..."
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[12px] text-muted-foreground block mb-1">
                Upload Your Chart Screenshot <span className="text-[11px] text-muted-foreground/60">(optional, max 2MB)</span>
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="chart-upload" />
                <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={12} /> Choose Image
                </Button>
                {imagePreview && (
                  <div className="flex items-center gap-2">
                    <img src={imagePreview} alt="Preview" className="h-20 w-auto rounded border border-white/10 shadow" />
                    <Button variant="ghost" onClick={removeImage}>
                      <XCircle size={12} />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {data && (
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[12px] text-muted-foreground mb-1">SMC data Hermes will analyze:</p>
                <p className="text-[13px] text-foreground">
                  <span className="capitalize font-bold">{data.structure.bias}</span> bias ·{" "}
                  {data.structure.bos ? `BOS ${data.structure.bos}` : "No BOS"} ·{" "}
                  {data.structure.orderBlocks.length} order blocks · Last price{" "}
                  <span className="font-mono">{data.lastPrice.toFixed(5)}</span>
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={submitToHermes}
                disabled={submitting || !data}
                className="flex-1 justify-center"
                style={{ background: "oklch(0.55 0.18 280)", color: "#fff" }}
              >
                <Sparkles size={12} />
                {submitting ? "Sending to Hermes…" : "Submit for Analysis"}
              </Button>
              <Button variant="ghost" onClick={() => setShowHermesPanel(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Pending Reviews ─────────────────────────────────────────── */}
      {pendingReviews.length > 0 && (
        <Card title={`Hermes Inbox — ${pendingReviews.length} pending`}>
          <div className="space-y-2">
            {pendingReviews.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                  </span>
                  <span className="text-[13px] font-bold">{r.pair}</span>
                  <span className="text-[12px] text-muted-foreground">{r.timeframe}</span>
                  <Badge tone="amber">Awaiting Hermes</Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">{formatAge(r.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Fulfilled Reviews Feed ───────────────────────────────────── */}
      {fulfilledReviews.length > 0 && (
        <Card title={`Hermes Analysis History (${fulfilledReviews.length})`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] text-muted-foreground">Click a row to expand feedback</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => loadReviews()} disabled={loadingReviews}>
                <RefreshCw size={11} className={loadingReviews ? "animate-spin" : ""} />
                Refresh
              </Button>
              <Button
                variant="ghost"
                onClick={deleteAll}
                style={{ color: "var(--gz-neg, #ef4444)" }}
              >
                <Trash2 size={11} /> Clear All
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {fulfilledReviews.slice(0, 10).map((r) => {
              const isOpen = expandedReview?.id === r.id;
              return (
                <div key={r.id} className="rounded-md border border-white/10 overflow-hidden">
                  {/* Row header */}
                  <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
                  onClick={() => { openReview(r); if (isOpen) { setExpandedReview(null); setSelectedReviewId(null); } }}
                  >
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge tone={verdictTone(r.verdict)}>
                      {r.verdict?.toUpperCase() ?? "PENDING"}
                    </Badge>
                    {r.accuracy_grade && (
                      <Badge tone={r.accuracy_grade === "HIGH" ? "green" : "amber"}>
                        {r.accuracy_grade}
                      </Badge>
                    )}
                    {r.direction && (
                      <Badge tone={r.direction === "long" ? "green" : "red"}>
                        {r.direction.toUpperCase()}
                      </Badge>
                    )}
                    <span className="text-[13px] font-bold">{r.pair}</span>
                    <span className="text-[12px] text-muted-foreground">{r.timeframe}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground">{formatAge(r.created_at)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteReview(r.id); }}
                      style={{ color: "var(--gz-neg, #ef4444)", opacity: 0.6, padding: "2px 4px", borderRadius: 4 }}
                      title="Delete this review"
                      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                    >
                      <Trash2 size={13} />
                    </button>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-white/10 p-4 space-y-4 bg-white/[0.015]">
                      {/* Feedback */}
                      {r.feedback && (
                        <div>
                          <p className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1">
                            <MessageSquare size={11} /> Hermes Feedback
                          </p>
                          <div className="rounded-md border border-white/10 bg-background p-3">
                            <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{r.feedback}</p>
                          </div>
                        </div>
                      )}

                      {/* Strategy notes */}
                      {r.strategy_notes && (
                        <div>
                          <p className="text-[12px] text-muted-foreground mb-1">Strategy Analysis</p>
                          <div className="rounded-md border border-white/10 bg-background p-3">
                            <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{r.strategy_notes}</p>
                          </div>
                        </div>
                      )}

                      {/* Hermes levels */}
                      {(r.entry || r.stop_loss || r.take_profit_1) && (
                        <div>
                          <p className="text-[12px] text-muted-foreground mb-2">Hermes Suggested Levels</p>
                          <div className="grid gap-3 sm:grid-cols-4">
                            {r.entry && (
                              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                                <p className="text-[11px] text-muted-foreground">Entry</p>
                                <p className="text-[16px] font-bold font-mono text-emerald-400">{r.entry.toFixed(5)}</p>
                              </div>
                            )}
                            {r.stop_loss && (
                              <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-center">
                                <p className="text-[11px] text-muted-foreground">Stop Loss</p>
                                <p className="text-[16px] font-bold font-mono text-red-400">{r.stop_loss.toFixed(5)}</p>
                              </div>
                            )}
                            {r.take_profit_1 && (
                              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                                <p className="text-[11px] text-muted-foreground">TP1</p>
                                <p className="text-[16px] font-bold font-mono text-blue-400">{r.take_profit_1.toFixed(5)}</p>
                              </div>
                            )}
                            {r.take_profit_2 && (
                              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                                <p className="text-[11px] text-muted-foreground">TP2</p>
                                <p className="text-[16px] font-mono text-blue-400/80">{r.take_profit_2.toFixed(5)}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* User notes */}
                      {r.user_notes && (
                        <div>
                          <p className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1">
                            <MessageSquare size={11} /> Your Notes
                          </p>
                          <p className="text-[13px] text-muted-foreground italic leading-relaxed">{r.user_notes}</p>
                        </div>
                      )}

                      {/* User image */}
                      {r.user_image && (
                        <div>
                          <p className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1">
                            <Camera size={11} /> Your Chart
                          </p>
                          <img
                            src={r.user_image}
                            alt="User chart"
                            className="max-w-full rounded-md border border-white/10 shadow"
                          />
                        </div>
                      )}

                      <Button variant="ghost" onClick={() => { setExpandedReview(null); setSelectedReviewId(null); }} className="w-full">
                        Close
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && (
        <div className="alert alert-red">
          <p className="alert-title"><AlertTriangle size={13} /> Analysis Error</p>
          <p className="alert-body">{error} — <button onClick={load} className="underline">Retry</button></p>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 rounded-lg border border-white/10 bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {data && !loading && (
        <>
          {/* Trading Levels */}
          {data.levels && data.levels.direction !== "neutral" && (
            <Card title="Trading Levels" accent={data.levels.direction === "long" ? "pos" : "neg"}>
              <div className="flex items-center gap-4 mb-4">
                <Badge tone={verdictColor === "green" ? "green" : verdictColor === "red" ? "red" : "amber"}>
                  <Target size={12} />
                  {data.debate?.finalVerdict?.replace("_", " ") || "ANALYZING"}
                </Badge>
                <span className="text-[13px] text-muted-foreground">
                  Confidence: {((data.debate?.confidence ?? 0) * 100).toFixed(0)}% · R:R {data.levels.riskReward}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">Entry</p>
                  <p className="text-[18px] font-bold font-mono text-emerald-400">{data.levels.entry}</p>
                </div>
                <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">Stop Loss</p>
                  <p className="text-[18px] font-bold font-mono text-red-400">{data.levels.stopLoss}</p>
                </div>
                <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">TP1</p>
                  <p className="text-[18px] font-bold font-mono text-blue-400">{data.levels.takeProfit1}</p>
                </div>
                <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">TP2</p>
                  <p className="text-[16px] font-bold font-mono text-blue-400/80">{data.levels.takeProfit2}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Bull vs Bear */}
          {data.debate && (
            <Card title="Bull vs Bear Debate">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-[12px] font-bold text-emerald-400 mb-2">
                    BULL CASE ({(data.debate.bullCase.overallConfidence * 100).toFixed(0)}%)
                  </p>
                  <ul className="space-y-1 text-[12px]">
                    {data.debate.bullCase.points.map((p, i) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="text-foreground font-medium">{p.claim}</span>
                        {p.evidence && <span className="text-[11px] text-muted-foreground/70"> — {p.evidence}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-[12px] font-bold text-red-400 mb-2">
                    BEAR CASE ({(data.debate.bearCase.overallConfidence * 100).toFixed(0)}%)
                  </p>
                  <ul className="space-y-1 text-[12px]">
                    {data.debate.bearCase.points.map((p, i) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="text-foreground font-medium">{p.claim}</span>
                        {p.evidence && <span className="text-[11px] text-muted-foreground/70"> — {p.evidence}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock size={10} /> Debate Rounds
                </p>
                <div className="space-y-1 text-[11px] font-mono text-muted-foreground">
                  {data.debate.debateRounds.map((r, i) => (
                    <p key={i} className={r.includes("Synthesis") ? "text-foreground font-bold" : ""}>{r}</p>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Market Structure + Key Levels */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="Market Structure">
              <div className="flex items-center gap-3">
                {bias === "bullish" ? <TrendingUp size={22} className="text-emerald-400" /> :
                 bias === "bearish" ? <TrendingDown size={22} className="text-red-400" /> :
                 <BarChart3 size={22} className="text-amber-400" />}
                <div>
                  <p className="text-[16px] font-bold capitalize text-foreground">{bias}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {data.structure.bos ? `BOS ${data.structure.bos}` : "No BOS"} · {data.structure.highs}H / {data.structure.lows}L
                  </p>
                </div>
              </div>
            </Card>
            <Card title="Key Levels">
              <div className="grid gap-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resistance:</span>
                  <span className="font-mono text-red-400">{data.structure.lastSwingHigh.toFixed(5)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Support:</span>
                  <span className="font-mono text-emerald-400">{data.structure.lastSwingLow.toFixed(5)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Price:</span>
                  <span className="font-mono text-foreground">{data.lastPrice.toFixed(5)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Order Blocks */}
          {data.structure.orderBlocks.length > 0 && (
            <Card title={`Order Blocks (${data.structure.orderBlocks.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-muted-foreground">
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Low</th>
                      <th className="px-2 py-2">High</th>
                      <th className="px-2 py-2">Impulse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.structure.orderBlocks.slice(-8).map((ob, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-2 py-1.5">
                          <Badge tone={ob.kind === "bullish" ? "green" : "red"}>{ob.kind}</Badge>
                        </td>
                        <td className="px-2 py-1.5 font-mono">{ob.low.toFixed(5)}</td>
                        <td className="px-2 py-1.5 font-mono">{ob.high.toFixed(5)}</td>
                        <td className="px-2 py-1.5 font-mono text-amber-400">{ob.impulseMag.toFixed(1)}× ATR</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Pine Script */}
          <Card title="Pine Script Export">
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <Button variant="ghost" onClick={generatePine}>
                <BarChart3 size={12} /> Generate Pine Script
              </Button>
              {showPine && (
                <Button variant="ghost" onClick={() => navigator.clipboard.writeText(pineScript)}>
                  <CheckCircle2 size={12} /> Copy to Clipboard
                </Button>
              )}
            </div>
            {showPine && (
              <div className="rounded-md border border-white/10 bg-black/30 p-3">
                <pre className="text-[11px] font-mono text-emerald-400 whitespace-pre-wrap overflow-x-auto">{pineScript}</pre>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
