import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, Badge, Button, Card, Field, Row, Select } from "@/components/terminal/ui";
import { TradingViewChart } from "@/components/terminal/tradingview-chart";
import { PAIRS, PAIR_SPECS } from "@/lib/engine/pairs";
import { extractPdfText } from "@/lib/pdf-extract";
import {
  addHermesRequest,
  addKnowledgeDoc,
  deleteKnowledgeDoc,
  loadHermesNotes,
  loadHermesRequests,
  loadHermesSetups,
  loadHermesUnderstanding,
  loadKnowledgeDocs,
  type HermesNote,
  type HermesRequest,
  type HermesSetup,
  type HermesUnderstanding,
  type KnowledgeDoc,
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
  const [requests, setRequests] = useState<HermesRequest[]>([]);
  const [setups, setSetups] = useState<HermesSetup[]>([]);
  const [understanding, setUnderstanding] = useState<HermesUnderstanding | null>(null);
  const [chartPair, setChartPair] = useState<string>("EURUSD");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [askPair, setAskPair] = useState<string>("EURUSD");
  const [askNote, setAskNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [lastTaughtTitle, setLastTaughtTitle] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [d, n, r, s, u] = await Promise.all([
      loadKnowledgeDocs(),
      loadHermesNotes(),
      loadHermesRequests(),
      loadHermesSetups(),
      loadHermesUnderstanding(),
    ]);
    setDocs(d);
    setNotes(n);
    setRequests(r);
    setSetups(s);
    setUnderstanding(u);
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
    setLastTaughtTitle(title.trim());
    setTitle("");
    setContent("");
    toast.success("Added — Trading Agent will pick this up on its next check.");
    refresh();
  }

  async function handlePdfPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setExtracting(true);
    try {
      const text = await extractPdfText(file);
      if (!text) {
        toast.error("Couldn't find any text in that PDF (scanned/image-only PDFs aren't supported yet).");
        return;
      }
      setTitle((prev) => prev || file.name.replace(/\.pdf$/i, ""));
      setContent(text);
      toast.success(`Extracted ${text.length.toLocaleString()} characters — review below, then add it.`);
    } catch (err) {
      toast.error("Couldn't read that PDF. Is it a valid, unencrypted file?");
      console.error(err);
    } finally {
      setExtracting(false);
    }
  }

  function discussUrl(docTitle: string) {
    const prompt =
      `I just taught you a new strategy document titled "${docTitle}" via the Trading Agent knowledge base. ` +
      `Call get_knowledge_docs, read it in full, and then ask me clarifying questions one at a time until ` +
      `you're confident you understand how to apply it — then summarize what you learned back to me.`;
    return `https://hermes.gizzyfxstrategy.dpdns.org/?q=${encodeURIComponent(prompt)}`;
  }

  async function remove(id: string) {
    await deleteKnowledgeDoc({ data: { id } });
    refresh();
  }

  async function ask() {
    setAsking(true);
    await addHermesRequest({ data: { pair: askPair, note: askNote.trim() || undefined } });
    setAsking(false);
    setAskNote("");
    toast.success("Sent — the Trading Agent will pick this up on its next check.");
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
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

      <Card title="Ask the Trading Agent" badge={<Badge tone="blue">Analysis request</Badge>}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Field label="Pair">
              <Select value={askPair} onChange={(e) => setAskPair(e.target.value)} className="h-11 w-40">
                {PAIRS.map((p) => (
                  <option key={p} value={p}>
                    {PAIR_SPECS[p].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Note" hint="Optional — anything specific you want it to look at.">
            <input
              className="h-11 w-full rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              value={askNote}
              onChange={(e) => setAskNote(e.target.value)}
              placeholder="e.g. check for a 4H order block near current price"
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={ask} disabled={asking}>
              {asking ? "Sending..." : "Request analysis"}
            </Button>
          </div>
        </div>
      </Card>

      {requests.length > 0 && (
        <Card title="Requests" badge={<Badge tone="neutral">{requests.length}</Badge>}>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{r.pair}</Badge>
                  {r.note && <span className="text-[13px] text-foreground">{r.note}</span>}
                </div>
                <Badge tone={r.status === "pending" ? "amber" : "green"}>{r.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {setups.length > 0 && (
        <Card title="Trade setups" badge={<Badge tone="green">{setups.length}</Badge>}>
          <div className="space-y-3">
            {setups.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="blue">{s.pair}</Badge>
                    <Badge tone={s.direction === "long" ? "green" : "red"}>{s.direction.toUpperCase()}</Badge>
                    {s.order_type && <Badge tone="neutral">{s.order_type.replace(/_/g, " ")}</Badge>}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Row label="Entry" value={s.entry} />
                  <Row label="SL" value={s.sl} tone="neg" />
                  <Row label="TP1" value={s.tp1} tone="pos" />
                  {s.rr != null && <Row label="R:R" value={s.rr} />}
                  {s.tp2 != null && <Row label="TP2" value={s.tp2} tone="pos" />}
                  {s.tp3 != null && <Row label="TP3" value={s.tp3} tone="pos" />}
                </div>
                {s.rationale && <p className="mt-2 text-[13px] text-foreground">{s.rationale}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Teach Trading Agent" badge={<Badge tone="blue">Knowledge base</Badge>}>
        <div className="space-y-3">
          {lastTaughtTitle && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <span className="text-[13px] text-foreground">
                Taught <strong>{lastTaughtTitle}</strong>. Want it to actually learn it?
              </span>
              <a href={discussUrl(lastTaughtTitle)} target="_blank" rel="noreferrer">
                <Button variant="ghost" className="h-9 text-[12px]">
                  Discuss with Trading Agent ↗
                </Button>
              </a>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handlePdfPick}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={extracting}>
              {extracting ? "Extracting..." : "Upload a PDF"}
            </Button>
            <span className="text-[12px] text-muted-foreground">
              Text is extracted right in your browser — the file itself is never uploaded anywhere.
            </span>
          </div>
          <Field label="Title">
            <input
              className="h-11 w-full rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Order Blocks — Chapter 4"
            />
          </Field>
          <Field label="Content" hint="Paste text, or upload a PDF above to fill this in automatically.">
            <textarea
              className={textareaClass}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste strategy text here, or upload a PDF above..."
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving..." : "Add to knowledge base"}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Current understanding"
        badge={
          understanding ? (
            <Badge tone="neutral">
              synthesized from {understanding.doc_count} doc{understanding.doc_count === 1 ? "" : "s"}
            </Badge>
          ) : undefined
        }
      >
        {!understanding ? (
          <p className="text-[13px] text-muted-foreground">
            Not synthesized yet — the Trading Agent reviews the whole knowledge base on a
            schedule (not per-document) and writes its combined understanding here, flagging
            anything contradictory between docs.
          </p>
        ) : (
          <div className="space-y-3">
            {understanding.contradictions && (
              <Alert level="amber" title="Contradictions flagged">
                {understanding.contradictions}
              </Alert>
            )}
            <p className="whitespace-pre-wrap text-[13px] text-foreground">{understanding.summary}</p>
            <p className="text-[11px] text-muted-foreground">
              Last reviewed {new Date(understanding.created_at).toLocaleString()}
            </p>
          </div>
        )}
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
