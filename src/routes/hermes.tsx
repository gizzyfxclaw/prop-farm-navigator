import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Row } from "@/components/terminal/ui";
import {
  addKnowledgeDoc,
  deleteKnowledgeDoc,
  loadHermesNotes,
  loadKnowledgeDocs,
  type HermesNote,
  type KnowledgeDoc,
} from "@/lib/hermes-db.functions";

const HERMES_CONSOLE_URL = "https://hermes.gizzyfxstrategy.dpdns.org";

export const Route = createFileRoute("/hermes")({
  head: () => ({
    meta: [
      { title: "Hermes — GizzyFx" },
      {
        name: "description",
        content: "Teach Hermes strategy material and review its market analysis log.",
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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [d, n] = await Promise.all([loadKnowledgeDocs(), loadHermesNotes()]);
    setDocs(d);
    setNotes(n);
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
    toast.success("Added — Hermes will pick this up on its next check.");
    refresh();
  }

  async function remove(id: string) {
    await deleteKnowledgeDoc({ data: { id } });
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Hermes</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Strategy material you teach it, and its market analysis log. Hermes reads from here —
            it never places trades.
          </p>
        </div>
        <a href={HERMES_CONSOLE_URL} target="_blank" rel="noreferrer">
          <Button variant="ghost">Open Hermes Console ↗</Button>
        </a>
      </div>

      <Card title="Teach Hermes" badge={<Badge tone="blue">Knowledge base</Badge>}>
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

      <Card title="Hermes analysis log" badge={<Badge tone="green">{notes.length} notes</Badge>}>
        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading...</p>
        ) : notes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No analysis yet — Hermes writes here after reviewing charts via tvremix.
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
