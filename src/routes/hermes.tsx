import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Row, Select } from "@/components/terminal/ui";
import { LWChart, type Drawing, type OHLCBar } from "@/components/terminal/lwchart";
import { PAIRS, PAIR_SPECS } from "@/lib/engine/pairs";
import {
  addKnowledgeDoc,
  deleteKnowledgeDoc,
  loadHermesNotes,
  loadKnowledgeDocs,
  loadAnalysisRequests,
  loadAnalysisSteps,
  loadTradeSetups,
  requestAnalysis,
  type AnalysisRequest,
  type AnalysisStep,
  type HermesNote,
  type KnowledgeDoc,
  type TradeSetup,
} from "@/lib/hermes-db.functions";

const HERMES_CONSOLE_URL = "https://hermes.gizzyfxstrategy.dpdns.org";
const POLL_INTERVAL_MS = 3000;

export const Route = createFileRoute("/hermes")({
  head: () => ({
    meta: [
      { title: "Trading Agent — GizzyFx" },
      {
        name: "description",
        content: "Teach the Trading Agent strategy material and review its market analysis log.",
      },
    ],
  }),
  component: HermesPage,
});

const textareaClass =
  "w-full min-h-[80px] rounded-xl border border-border bg-input px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30";

/** Merge drawings from all steps (later steps can add more drawings). */
function mergeDrawings(steps: AnalysisStep[], setup: TradeSetup | null): Drawing[] {
  const all: Drawing[] = [];
  for (const s of steps) {
    try {
      const arr = JSON.parse(s.drawings) as Drawing[];
      all.push(...arr);
    } catch {
      // ignore malformed JSON
    }
  }
  // Auto-draw trade setup levels on top of analysis drawings
  if (setup) {
    all.push({ type: "hline", price: setup.entry, label: `Entry ${setup.direction.toUpperCase()}`, color: "#f59e0b", style: "solid" });
    all.push({ type: "hline", price: setup.sl, label: "SL", color: "#ef4444", style: "dashed" });
    all.push({ type: "hline", price: setup.tp1, label: "TP1", color: "#22c55e", style: "dashed" });
    if (setup.tp2) all.push({ type: "hline", price: setup.tp2, label: "TP2", color: "#86efac", style: "dotted" });
    if (setup.tp3) all.push({ type: "hline", price: setup.tp3, label: "TP3", color: "#bbf7d0", style: "dotted" });
  }
  return all;
}

function HermesPage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [notes, setNotes] = useState<HermesNote[]>([]);
  const [requests, setRequests] = useState<AnalysisRequest[]>([]);
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [setups, setSetups] = useState<TradeSetup[]>([]);

  // Chart
  const [chartPair, setChartPair] = useState<string>("EURUSD");
  const [chartInterval, setChartInterval] = useState<string>("1h");
  const [bars, setBars] = useState<OHLCBar[]>([]);
  const [barsLoading, setBarsLoading] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  // Teach KB
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Request analysis
  const [reqPair, setReqPair] = useState<string>("EURUSD");
  const [reqNote, setReqNote] = useState("");

  // Busy states
  const [busy, setBusy] = useState(false);
  const [reqBusy, setReqBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Polling
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- data loading ----------

  async function refresh() {
    const [d, n, r, s] = await Promise.all([
      loadKnowledgeDocs(),
      loadHermesNotes(),
      loadAnalysisRequests(),
      loadTradeSetups(),
    ]);
    setDocs(d);
    setNotes(n);
    setRequests(r);
    setSetups(s);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  // Fetch OHLCV bars whenever pair or interval changes
  useEffect(() => {
    let cancelled = false;
    setBarsLoading(true);
    setBars([]);
    fetch(`/api/ohlcv?pair=${chartPair}&interval=${chartInterval}`)
      .then((r) => r.json())
      .then((data: { bars?: OHLCBar[] }) => {
        if (!cancelled) setBars(data.bars ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load chart data.");
      })
      .finally(() => {
        if (!cancelled) setBarsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chartPair, chartInterval]);

  // ---------- analysis polling ----------

  async function pollSteps(requestId: string) {
    const [fresh, freshRequests, freshSetups] = await Promise.all([
      loadAnalysisSteps({ data: { requestId } }),
      loadAnalysisRequests(),
      loadTradeSetups(),
    ]);
    setSteps(fresh);
    setRequests(freshRequests);
    setSetups(freshSetups);

    // Use the most recent setup for the active pair
    const latestSetup = freshSetups.find((s) => s.request_id === requestId) ?? null;
    setDrawings(mergeDrawings(fresh, latestSetup));

    const req = freshRequests.find((r) => r.id === requestId);

    if (req && req.status === "pending") {
      pollTimerRef.current = setTimeout(() => pollSteps(requestId), POLL_INTERVAL_MS);
    } else {
      setAnalyzing(false);
      if (req?.status === "fulfilled") {
        toast.success("Analysis complete — trade setup and drawings are live on the chart.");
        refresh();
      }
    }
  }

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // ---------- actions ----------

  async function submit() {
    if (!title.trim() || !content.trim()) {
      toast.error("Give it a title and some content first.");
      return;
    }
    setBusy(true);
    await addKnowledgeDoc({ data: { title: title.trim(), content: content.trim() } });
    setBusy(false);
    setTitle("");
    setContent("");
    toast.success("Added — Trading Agent will pick this up on its next check.");
    refresh();
  }

  async function remove(id: string) {
    await deleteKnowledgeDoc({ data: { id } });
    refresh();
  }

  async function submitRequest() {
    setReqBusy(true);
    await requestAnalysis({ data: { pair: reqPair, note: reqNote.trim() || undefined } });

    // Load the just-created request to get its id
    const freshRequests = await loadAnalysisRequests();
    setRequests(freshRequests);
    const newest = freshRequests[0];

    setReqBusy(false);
    setReqNote("");

    if (newest) {
      setActiveRequestId(newest.id);
      setSteps([]);
      setDrawings([]);
      setAnalyzing(true);
      setChartPair(reqPair); // switch chart to requested pair
      toast.success(
        `Analysis request for ${reqPair} sent — watch the chart as the agent works.`,
      );
      // Start polling
      pollTimerRef.current = setTimeout(() => pollSteps(newest.id), POLL_INTERVAL_MS);
    }
  }

  const activeRequest = requests.find((r) => r.id === activeRequestId);
  const latestStepLabel = steps.length ? steps[steps.length - 1].step_label : null;
  const latestSummary = steps.find((s) => s.summary)?.summary ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground mb-1"
          >
            ← Engine
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Trading Agent</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Strategy material you teach it, and its market analysis log. The agent reads from here
            — it never places trades.
          </p>
        </div>
        <a href={HERMES_CONSOLE_URL} target="_blank" rel="noreferrer">
          <Button variant="ghost">Open Agent Console ↗</Button>
        </a>
      </div>

      {/* Live chart */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
        {/* Chart header — pair + timeframe controls */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border">
          {/* Pair selector */}
          <Select
            value={chartPair}
            onChange={(e) => {
              setChartPair(e.target.value);
              setDrawings([]);
            }}
            className="h-8 w-32 text-[12px]"
          >
            {PAIRS.map((p) => (
              <option key={p} value={p}>
                {PAIR_SPECS[p].label}
              </option>
            ))}
          </Select>

          {/* Timeframe buttons */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background/60 p-0.5">
            {(["1h", "4h", "1d", "1w"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setChartInterval(tf)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  chartInterval === tf
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Analysing badge */}
          {analyzing && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary ml-auto">
              <span className="block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {latestStepLabel ?? "Analysing…"}
            </span>
          )}
        </div>

        {/* Chart fills remaining viewport height */}
        <div className="h-[calc(100svh-240px)] min-h-[320px] max-h-[620px]">
          <LWChart bars={bars} drawings={drawings} height="100%" loading={barsLoading} />
        </div>

        {/* Analysis step log — shows live as agent works */}
        {steps.length > 0 && (
          <div className="border-t border-border px-5 py-3 space-y-1.5 max-h-40 overflow-y-auto">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-start gap-2 text-[12px]">
                <span className="mt-0.5 shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-foreground">{s.step_label ?? "Step"}</span>
                {s.summary && (
                  <span className="text-muted-foreground">— {s.summary}</span>
                )}
                {(() => {
                  try {
                    const arr = JSON.parse(s.drawings) as Drawing[];
                    return arr.length ? (
                      <Badge tone="blue" className="ml-auto shrink-0">
                        {arr.length} drawing{arr.length > 1 ? "s" : ""}
                      </Badge>
                    ) : null;
                  } catch {
                    return null;
                  }
                })()}
              </div>
            ))}
          </div>
        )}

        <p className="px-5 py-3 text-[12px] text-muted-foreground border-t border-border">
          {drawings.length > 0
            ? `${drawings.length} drawing${drawings.length > 1 ? "s" : ""} from agent analysis are shown on this chart.`
            : "Request an analysis below — the agent's drawings will appear on this chart in real time."}
        </p>
      </section>

      {/* Request Analysis */}
      <Card
        title="Request Analysis"
        badge={
          <Badge tone={analyzing ? "green" : "blue"}>
            {analyzing ? "Analysing…" : "Ask the agent"}
          </Badge>
        }
      >
        <p className="mb-3 text-[13px] text-muted-foreground">
          Pick a pair and optionally add a focus note. The Trading Agent will analyse the chart
          using your strategy material and draw its findings live above.
        </p>
        <div className="space-y-3">
          <Field label="Pair">
            <Select
              value={reqPair}
              onChange={(e) => setReqPair(e.target.value)}
              className="h-11 w-full"
            >
              {PAIRS.map((p) => (
                <option key={p} value={p}>
                  {PAIR_SPECS[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Instruction (optional)"
            hint="e.g. 'Check for order blocks on H4' or leave blank."
          >
            <textarea
              className={textareaClass}
              value={reqNote}
              onChange={(e) => setReqNote(e.target.value)}
              placeholder="Any specific focus for the analysis..."
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={submitRequest} disabled={reqBusy || analyzing}>
              {reqBusy ? "Sending…" : analyzing ? "Analysing…" : "Request Analysis"}
            </Button>
          </div>
        </div>

        {/* Recent requests mini-log */}
        {requests.length > 0 && (
          <div className="mt-4 border-t border-border pt-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Recent requests
            </p>
            {requests.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-[12px]">
                <Badge tone={r.status === "pending" ? "blue" : "neutral"}>{r.status}</Badge>
                <span className="font-mono font-medium text-foreground">{r.pair}</span>
                {r.note && (
                  <span className="text-muted-foreground truncate max-w-[220px]">{r.note}</span>
                )}
                <span className="ml-auto text-muted-foreground shrink-0">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Show latest summary if available */}
        {latestSummary && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-[12px] font-semibold text-primary mb-1">Agent summary</p>
            <p className="text-[13px] text-foreground">{latestSummary}</p>
          </div>
        )}
      </Card>

      {/* Trade Setups */}
      <Card
        title="Trade Setups"
        badge={<Badge tone={setups.length > 0 ? "green" : "neutral"}>{setups.length} setups</Badge>}
      >
        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading...</p>
        ) : setups.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No setups yet — the Trading Agent will post entry, SL, and TP levels here after analysis.
          </p>
        ) : (
          <div className="space-y-3">
            {setups.map((s) => {
              const isLong = s.direction === "long";
              const rrLabel = s.rr ? `${s.rr.toFixed(2)}R` : null;
              return (
                <div key={s.id} className="rounded-xl border border-border p-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Badge tone="blue">{s.pair}</Badge>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${
                          isLong
                            ? "bg-green-500/10 text-green-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {isLong ? "▲ LONG" : "▼ SHORT"}
                      </span>
                      {rrLabel && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {rrLabel}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Price levels grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-center">
                      <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-0.5">Entry</p>
                      <p className="font-mono text-[13px] font-bold text-amber-300">{s.entry.toFixed(5)}</p>
                    </div>
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-center">
                      <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-0.5">Stop Loss</p>
                      <p className="font-mono text-[13px] font-bold text-red-300">{s.sl.toFixed(5)}</p>
                    </div>
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2 text-center">
                      <p className="text-[10px] text-green-400 font-semibold uppercase tracking-wider mb-0.5">TP 1</p>
                      <p className="font-mono text-[13px] font-bold text-green-300">{s.tp1.toFixed(5)}</p>
                    </div>
                  </div>

                  {/* TP2 / TP3 */}
                  {(s.tp2 || s.tp3) && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {s.tp2 && (
                        <div className="rounded-lg bg-green-500/5 border border-green-500/10 p-2 text-center">
                          <p className="text-[10px] text-green-500 font-semibold uppercase tracking-wider mb-0.5">TP 2</p>
                          <p className="font-mono text-[12px] text-green-400">{s.tp2.toFixed(5)}</p>
                        </div>
                      )}
                      {s.tp3 && (
                        <div className="rounded-lg bg-green-500/5 border border-green-500/10 p-2 text-center">
                          <p className="text-[10px] text-green-500 font-semibold uppercase tracking-wider mb-0.5">TP 3</p>
                          <p className="font-mono text-[12px] text-green-400">{s.tp3.toFixed(5)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rationale */}
                  {s.rationale && (
                    <p className="text-[12px] text-muted-foreground border-t border-border pt-2 mt-2">
                      {s.rationale}
                    </p>
                  )}

                  {/* Load onto chart button */}
                  <div className="flex justify-end mt-2">
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        setChartPair(s.pair);
                        setDrawings(mergeDrawings(steps, s));
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Load on chart ↑
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Teach KB */}
      <Card title="Teach Trading Agent" badge={<Badge tone="blue">Knowledge base</Badge>}>
        <div className="space-y-3">
          <Field label="Title">
            <input
              className="h-11 w-full rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Order Blocks — Chapter 4"
            />
          </Field>
          <Field
            label="Content"
            hint="Paste the text (from a PDF, notes, a strategy writeup, anything)."
          >
            <textarea
              className={`${textareaClass} min-h-[160px]`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste strategy text here..."
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving..." : "Add to knowledge base"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Knowledge base list */}
      <Card title="Knowledge base" badge={<Badge tone="neutral">{docs.length} docs</Badge>}>
        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading...</p>
        ) : docs.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nothing taught yet.</p>
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <div key={d.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{d.title}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">
                      {d.content}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-8 px-2 text-[11px]"
                    onClick={() => remove(d.id)}
                  >
                    Remove
                  </Button>
                </div>
                <Row label="Added" value={new Date(d.created_at).toLocaleString()} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Agent analysis log */}
      <Card title="Agent analysis log" badge={<Badge tone="green">{notes.length} notes</Badge>}>
        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading...</p>
        ) : notes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No analysis yet — the Trading Agent writes here after reviewing charts.
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  {n.pair && <Badge tone="blue">{n.pair}</Badge>}
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-[13px] text-foreground">{n.summary}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
