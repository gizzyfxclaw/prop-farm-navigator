import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Row, Select } from "@/components/terminal/ui";
import { TradingViewChart } from "@/components/terminal/tradingview-chart";
import { PAIRS, PAIR_SPECS } from "@/lib/engine/pairs";
import {
  addKnowledgeDoc,
  deleteKnowledgeDoc,
  loadHermesNotes,
  loadKnowledgeDocs,
  loadAnalysisRequests,
  requestAnalysis,
  type HermesNote,
  type KnowledgeDoc,
  type AnalysisRequest,
} from "@/lib/hermes-db.functions";

const HERMES_CONSOLE_URL = "https://hermes.gizzyfxstrategy.dpdns.org";

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
  "w-full min-h-[160px] rounded-xl border border-border bg-input px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30";

function HermesPage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [notes, setNotes] = useState<HermesNote[]>([]);
  const [requests, setRequests] = useState<AnalysisRequest[]>([]);
  const [chartPair, setChartPair] = useState<string>("EURUSD");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [reqPair, setReqPair] = useState<string>("EURUSD");
  const [reqNote, setReqNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reqBusy, setReqBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [d, n, r] = await Promise.all([loadKnowledgeDocs(), loadHermesNotes(), loadAnalysisRequests()]);
    setDocs(d);
    setNotes(n);
    setRequests(r);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

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
    setReqBusy(false);
    setReqNote("");
    toast.success(`Analysis request for ${reqPair} queued — the Trading Agent will pick it up shortly.`);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground mb-1">
            ← Engine
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Trading Agent</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Strategy material you teach it, and its market analysis log. The agent reads from here —
            it never places trades.
          </p>
        </div>
        <a href={HERMES_CONSOLE_URL} target="_blank" rel="noreferrer">
          <Button variant="ghost">Open Agent Console ↗</Button>
        </a>
      </div>

      {/* Live chart — full-bleed inside card, tall on all screens */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Live Chart
          </span>
          <Select
            value={chartPair}
            onChange={(e) => setChartPair(e.target.value)}
            className="h-9 w-36"
          >
            {PAIRS.map((p) => (
              <option key={p} value={p}>
                {PAIR_SPECS[p].label}
              </option>
            ))}
          </Select>
        </div>
        {/* Chart fills viewport height minus header/nav/padding on mobile */}
        <div className="h-[calc(100svh-220px)] min-h-[360px] max-h-[680px]">
          <TradingViewChart pair={chartPair} height="100%" />
        </div>
        <p className="px-5 py-3 text-[12px] text-muted-foreground border-t border-border">
          Full drawing toolbar — mark up levels directly here. Same data the Trading Agent pulls
          when it writes an analysis note below.
        </p>
      </section>

      {/* Request Analysis */}
      <Card title="Request Analysis" badge={<Badge tone="green">Ask the agent</Badge>}>
        <p className="mb-3 text-[13px] text-muted-foreground">
          Pick a pair and optionally add a note. The Trading Agent will pick up your request, analyse
          the chart, and post a note to the log below.
        </p>
        <div className="space-y-3">
          <Field label="Pair">
            <Select value={reqPair} onChange={(e) => setReqPair(e.target.value)} className="h-11 w-full">
              {PAIRS.map((p) => (
                <option key={p} value={p}>{PAIR_SPECS[p].label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Instruction (optional)" hint="e.g. 'Check for order blocks on H4' or leave blank.">
            <textarea
              className={textareaClass}
              style={{ minHeight: "80px" }}
              value={reqNote}
              onChange={(e) => setReqNote(e.target.value)}
              placeholder="Any specific focus for the analysis..."
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={submitRequest} disabled={reqBusy}>
              {reqBusy ? "Sending..." : "Request Analysis"}
            </Button>
          </div>
        </div>
        {requests.length > 0 && (
          <div className="mt-4 border-t border-border pt-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recent requests</p>
            {requests.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-[12px]">
                <Badge tone={r.status === "pending" ? "blue" : "neutral"}>{r.status}</Badge>
                <span className="font-mono font-medium text-foreground">{r.pair}</span>
                {r.note && <span className="text-muted-foreground truncate max-w-[200px]">{r.note}</span>}
                <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

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
          <Field label="Content" hint="Paste the text (from a PDF, notes, a strategy writeup, anything).">
            <textarea
              className={textareaClass}
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
                    <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">{d.content}</p>
                  </div>
                  <Button variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => remove(d.id)}>
                    Remove
                  </Button>
                </div>
                <Row label="Added" value={new Date(d.created_at).toLocaleString()} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Agent analysis log" badge={<Badge tone="green">{notes.length} notes</Badge>}>
        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading...</p>
        ) : notes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No analysis yet — the Trading Agent writes here after reviewing charts via tvremix.
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
