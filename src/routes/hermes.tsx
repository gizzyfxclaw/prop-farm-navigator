import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, Badge, Button, Card, Field, Row, Select, Stat } from "@/components/terminal/ui";
import { TradingViewChart } from "@/components/terminal/tradingview-chart";
import { PAIRS, PAIR_SPECS } from "@/lib/engine/pairs";
import { extractPdfText } from "@/lib/pdf-extract";
import { resizeImageToDataUrl } from "@/lib/image-resize";
import {
  addHermesRequest,
  addKnowledgeDoc,
  addStrategyRule,
  deleteHermesNote,
  deleteHermesRequest,
  deleteHermesSetup,
  deleteKnowledgeDoc,
  deleteStrategyRule,
  loadHermesBacktests,
  loadHermesNotes,
  loadHermesRequests,
  loadHermesSetups,
  loadHermesUnderstanding,
  loadKnowledgeDocs,
  loadStrategyRules,
  setStrategyRuleActive,
  type HermesBacktest,
  type HermesNote,
  type HermesRequest,
  type HermesSetup,
  type HermesUnderstanding,
  type KnowledgeDoc,
  type StrategyRule,
} from "@/lib/hermes-db.functions";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"];

const ENTRY_TYPE_LABEL: Record<StrategyRule["entry_type"], string> = {
  sma_cross: "SMA crossover",
  ema_cross: "EMA crossover",
  rsi: "RSI overbought/oversold",
  breakout: "N-bar breakout",
  custom: "Custom (Hermes judgment)",
};

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
  const [backtests, setBacktests] = useState<HermesBacktest[]>([]);
  const [understanding, setUnderstanding] = useState<HermesUnderstanding | null>(null);
  const [chartPair, setChartPair] = useState<string>("EURUSD");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [askPair, setAskPair] = useState<string>("EURUSD");
  const [askNote, setAskNote] = useState("");
  const [askAnalysis, setAskAnalysis] = useState("");
  const [askImage, setAskImage] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [resizingImage, setResizingImage] = useState(false);
  const [lastTaughtTitle, setLastTaughtTitle] = useState<string | null>(null);
  const [btPair, setBtPair] = useState<string>("EURUSD");
  const [btNote, setBtNote] = useState("");
  const [btRuleId, setBtRuleId] = useState<string>("");
  const [btTimeframe, setBtTimeframe] = useState<string>("1h");
  const [requestingBacktest, setRequestingBacktest] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chartInputRef = useRef<HTMLInputElement>(null);

  const [rules, setRules] = useState<StrategyRule[]>([]);
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDocId, setRuleDocId] = useState<string>("");
  const [ruleDirection, setRuleDirection] = useState<"long" | "short" | "both">("both");
  const [ruleEntryType, setRuleEntryType] = useState<StrategyRule["entry_type"]>("sma_cross");
  const [ruleFast, setRuleFast] = useState("10");
  const [ruleSlow, setRuleSlow] = useState("50");
  const [ruleRsiPeriod, setRuleRsiPeriod] = useState("14");
  const [ruleOversold, setRuleOversold] = useState("30");
  const [ruleOverbought, setRuleOverbought] = useState("70");
  const [ruleLookback, setRuleLookback] = useState("20");
  const [ruleCustomText, setRuleCustomText] = useState("");
  const [ruleSlType, setRuleSlType] = useState<"atr" | "fixed_pips">("atr");
  const [ruleSlValue, setRuleSlValue] = useState("2");
  const [ruleTpType, setRuleTpType] = useState<"rr_multiple" | "fixed_pips">("rr_multiple");
  const [ruleTpValue, setRuleTpValue] = useState("2");
  const [ruleTimeframe, setRuleTimeframe] = useState("1h");
  const [addingRule, setAddingRule] = useState(false);

  async function refresh() {
    const [d, n, r, s, u, b, sr] = await Promise.all([
      loadKnowledgeDocs(),
      loadHermesNotes(),
      loadHermesRequests(),
      loadHermesSetups(),
      loadHermesUnderstanding(),
      loadHermesBacktests(),
      loadStrategyRules(),
    ]);
    setDocs(d);
    setNotes(n);
    setRequests(r);
    setSetups(s);
    setUnderstanding(u);
    setBacktests(b);
    setRules(sr);
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
      `you're confident you understand how to apply it. Once you do, use honcho_conclude (peer: "ai") to ` +
      `save a durable one-line takeaway so you recall this in future sessions too, then summarize what you learned back to me.`;
    return `https://hermes.gizzyfxstrategy.dpdns.org/?q=${encodeURIComponent(prompt)}`;
  }

  async function remove(id: string) {
    await deleteKnowledgeDoc({ data: { id } });
    refresh();
  }

  async function removeRequest(id: string) {
    await deleteHermesRequest({ data: { id } });
    refresh();
  }

  async function removeNote(id: string) {
    await deleteHermesNote({ data: { id } });
    refresh();
  }

  async function removeSetup(id: string) {
    await deleteHermesSetup({ data: { id } });
    refresh();
  }

  async function requestBacktest() {
    setRequestingBacktest(true);
    await addHermesRequest({
      data: {
        pair: btPair,
        note: btNote.trim() || undefined,
        request_type: "backtest",
        rule_id: btRuleId || undefined,
        timeframe: btTimeframe,
      },
    });
    setRequestingBacktest(false);
    setBtNote("");
    toast.success(
      btRuleId
        ? "Sent — the deterministic backtest engine picks these up every few minutes."
        : "Sent — results will appear below once the Trading Agent works through it.",
    );
    refresh();
  }

  function entryParamsForForm(): Record<string, number> {
    switch (ruleEntryType) {
      case "sma_cross":
      case "ema_cross":
        return { fast: Number(ruleFast), slow: Number(ruleSlow) };
      case "rsi":
        return { period: Number(ruleRsiPeriod), oversold: Number(ruleOversold), overbought: Number(ruleOverbought) };
      case "breakout":
        return { lookback: Number(ruleLookback) };
      case "custom":
        return {};
    }
  }

  async function submitRule() {
    if (!ruleTitle.trim()) {
      toast.error("Give the strategy a title first.");
      return;
    }
    if (ruleEntryType === "custom" && !ruleCustomText.trim()) {
      toast.error("Describe the entry/exit conditions for a custom strategy first.");
      return;
    }
    setAddingRule(true);
    await addStrategyRule({
      data: {
        knowledge_doc_id: ruleDocId || undefined,
        title: ruleTitle.trim(),
        direction: ruleDirection,
        entry_type: ruleEntryType,
        entry_params: entryParamsForForm(),
        custom_rules: ruleEntryType === "custom" ? ruleCustomText.trim() : undefined,
        sl_type: ruleSlType,
        sl_value: Number(ruleSlValue),
        tp_type: ruleTpType,
        tp_value: Number(ruleTpValue),
        default_timeframe: ruleTimeframe,
      },
    });
    setAddingRule(false);
    setRuleTitle("");
    setRuleCustomText("");
    toast.success(
      ruleEntryType === "custom"
        ? "Strategy saved — Hermes will apply this judgment-per-trade over real history when you request a backtest."
        : "Strategy saved — pick it from the backtest panel to run a real simulation.",
    );
    refresh();
  }

  async function removeRule(id: string) {
    await deleteStrategyRule({ data: { id } });
    if (btRuleId === id) setBtRuleId("");
    refresh();
  }

  async function toggleRule(rule: StrategyRule) {
    await setStrategyRuleActive({ data: { id: rule.id, active: !rule.active } });
    refresh();
  }

  async function handleChartPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResizingImage(true);
    try {
      setAskImage(await resizeImageToDataUrl(file));
    } catch (err) {
      toast.error("Couldn't read that image.");
      console.error(err);
    } finally {
      setResizingImage(false);
    }
  }

  async function ask() {
    setAsking(true);
    await addHermesRequest({
      data: {
        pair: askPair,
        note: askNote.trim() || undefined,
        user_analysis: askAnalysis.trim() || undefined,
        chart_image: askImage ?? undefined,
      },
    });
    setAsking(false);
    setAskNote("");
    setAskAnalysis("");
    setAskImage(null);
    toast.success("Sent — the Trading Agent will pick this up on its next check.");
    refresh();
  }

  const verdictTone: Record<string, "green" | "red" | "amber"> = {
    match: "green",
    diverge: "red",
    partial: "amber",
  };
  const verdictLabel: Record<string, string> = {
    match: "Matches strategy",
    diverge: "Diverges from strategy",
    partial: "Partially matches",
  };

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
          <Field
            label="Your analysis"
            hint="Optional — what you think is happening. The agent checks it against the taught strategy and tells you if it agrees."
          >
            <textarea
              className={textareaClass}
              style={{ minHeight: 100 }}
              value={askAnalysis}
              onChange={(e) => setAskAnalysis(e.target.value)}
              placeholder="e.g. I think price is forming a double top at 1.0920, expecting a reversal down to the 1.0850 order block..."
            />
          </Field>
          <input
            ref={chartInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleChartPick}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => chartInputRef.current?.click()}
              disabled={resizingImage}
            >
              {resizingImage ? "Processing..." : askImage ? "Replace chart image" : "Attach chart image"}
            </Button>
            {askImage && (
              <>
                <img src={askImage} alt="Attached chart" className="h-11 w-16 rounded-lg object-cover" />
                <Button variant="ghost" className="h-9 text-[12px]" onClick={() => setAskImage(null)}>
                  Remove
                </Button>
              </>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={ask} disabled={asking}>
              {asking ? "Sending..." : "Request analysis"}
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Strategy Rules" badge={<Badge tone="neutral">{rules.length}</Badge>}>
        <div className="space-y-4">
          <p className="text-[12px] text-muted-foreground">
            Codify a taught strategy as executable rules so it can be backtested for real —
            candle-by-candle, over actual TradingView history — instead of narrated by the agent.
            Only mechanical strategies (moving averages, RSI, breakouts) can be expressed this
            way; pure price-action/discretionary strategies stay in the free-form knowledge base.
          </p>

          {rules.length > 0 && (
            <div className="space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{r.title}</p>
                      <Badge tone={r.active ? "green" : "neutral"}>{r.active ? "active" : "inactive"}</Badge>
                      {r.entry_type === "custom" ? (
                        <Badge tone="amber">Judgment</Badge>
                      ) : (
                        <Badge tone="green">Deterministic</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {ENTRY_TYPE_LABEL[r.entry_type]} · {r.direction} · default {r.default_timeframe} · SL{" "}
                      {r.sl_type === "atr" ? `${r.sl_value}x ATR` : `${r.sl_value} pips`} · TP{" "}
                      {r.tp_type === "rr_multiple" ? `${r.tp_value}R` : `${r.tp_value} pips`}
                    </p>
                    {r.entry_type === "custom" && r.custom_rules && (
                      <p className="mt-1 text-[12px] text-foreground line-clamp-2">{r.custom_rules}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => toggleRule(r)}>
                      {r.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => removeRule(r.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex flex-wrap gap-3">
              <Field label="Title" hint="Shown in the backtest strategy picker.">
                <input
                  className="h-11 w-64 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  placeholder="e.g. 50/200 EMA trend cross"
                />
              </Field>
              <Field label="Linked doc" hint="Optional — the taught strategy this encodes.">
                <Select value={ruleDocId} onChange={(e) => setRuleDocId(e.target.value)} className="h-11 w-56">
                  <option value="">(none)</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Direction">
                <Select
                  value={ruleDirection}
                  onChange={(e) => setRuleDirection(e.target.value as typeof ruleDirection)}
                  className="h-11 w-32"
                >
                  <option value="both">Both</option>
                  <option value="long">Long only</option>
                  <option value="short">Short only</option>
                </Select>
              </Field>
              <Field label="Default timeframe">
                <Select value={ruleTimeframe} onChange={(e) => setRuleTimeframe(e.target.value)} className="h-11 w-28">
                  {TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Field label="Entry rule">
                <Select
                  value={ruleEntryType}
                  onChange={(e) => setRuleEntryType(e.target.value as StrategyRule["entry_type"])}
                  className="h-11 w-52"
                >
                  <option value="sma_cross">SMA crossover</option>
                  <option value="ema_cross">EMA crossover</option>
                  <option value="rsi">RSI overbought/oversold</option>
                  <option value="breakout">N-bar breakout</option>
                  <option value="custom">Custom (Hermes judgment)</option>
                </Select>
              </Field>
              {(ruleEntryType === "sma_cross" || ruleEntryType === "ema_cross") && (
                <>
                  <Field label="Fast period">
                    <input
                      type="number"
                      className="h-11 w-24 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                      value={ruleFast}
                      onChange={(e) => setRuleFast(e.target.value)}
                    />
                  </Field>
                  <Field label="Slow period">
                    <input
                      type="number"
                      className="h-11 w-24 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                      value={ruleSlow}
                      onChange={(e) => setRuleSlow(e.target.value)}
                    />
                  </Field>
                </>
              )}
              {ruleEntryType === "rsi" && (
                <>
                  <Field label="Period">
                    <input
                      type="number"
                      className="h-11 w-24 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                      value={ruleRsiPeriod}
                      onChange={(e) => setRuleRsiPeriod(e.target.value)}
                    />
                  </Field>
                  <Field label="Oversold">
                    <input
                      type="number"
                      className="h-11 w-24 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                      value={ruleOversold}
                      onChange={(e) => setRuleOversold(e.target.value)}
                    />
                  </Field>
                  <Field label="Overbought">
                    <input
                      type="number"
                      className="h-11 w-24 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                      value={ruleOverbought}
                      onChange={(e) => setRuleOverbought(e.target.value)}
                    />
                  </Field>
                </>
              )}
              {ruleEntryType === "breakout" && (
                <Field label="Lookback (bars)">
                  <input
                    type="number"
                    className="h-11 w-24 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    value={ruleLookback}
                    onChange={(e) => setRuleLookback(e.target.value)}
                  />
                </Field>
              )}
            </div>

            {ruleEntryType === "custom" && (
              <div className="space-y-2">
                <Alert level="amber" title="Judgment, not mechanics">
                  A custom strategy isn't run by the deterministic engine — Hermes reads this
                  description and applies it per trade over real tvremix history. Real data, but
                  still an LLM judgment call, so results stay approximate/non-reproducible like
                  the free-form flow, just tied to this named strategy and a real price history
                  instead of guessed from a knowledge doc.
                </Alert>
                <Field
                  label="Entry / exit rules"
                  hint="Describe conditions in your own words — indicators, price action, confluence, whatever the strategy actually uses."
                >
                  <textarea
                    className={textareaClass}
                    style={{ minHeight: 120 }}
                    value={ruleCustomText}
                    onChange={(e) => setRuleCustomText(e.target.value)}
                    placeholder="e.g. Enter long when price rejects a 4H bullish order block with a bullish engulfing candle on the 15m, only during London/NY session overlap..."
                  />
                </Field>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <Field label="Stop loss">
                <Select value={ruleSlType} onChange={(e) => setRuleSlType(e.target.value as typeof ruleSlType)} className="h-11 w-36">
                  <option value="atr">ATR multiple</option>
                  <option value="fixed_pips">Fixed pips</option>
                </Select>
              </Field>
              <input
                type="number"
                step="0.1"
                className="h-11 w-24 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                value={ruleSlValue}
                onChange={(e) => setRuleSlValue(e.target.value)}
              />
              <Field label="Take profit">
                <Select value={ruleTpType} onChange={(e) => setRuleTpType(e.target.value as typeof ruleTpType)} className="h-11 w-36">
                  <option value="rr_multiple">R:R multiple</option>
                  <option value="fixed_pips">Fixed pips</option>
                </Select>
              </Field>
              <input
                type="number"
                step="0.1"
                className="h-11 w-24 rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                value={ruleTpValue}
                onChange={(e) => setRuleTpValue(e.target.value)}
              />
              <div className="flex-1" />
              <Button onClick={submitRule} disabled={addingRule}>
                {addingRule ? "Saving..." : "Add strategy rule"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {(() => {
        const selectedRule = rules.find((r) => r.id === btRuleId);
        const isDeterministic = !!selectedRule && selectedRule.entry_type !== "custom";
        const isCustomJudgment = !!selectedRule && selectedRule.entry_type === "custom";
        return (
      <Card
        title="Request a Backtest"
        badge={
          isDeterministic ? (
            <Badge tone="green">Deterministic</Badge>
          ) : isCustomJudgment ? (
            <Badge tone="amber">Judgment (real data)</Badge>
          ) : (
            <Badge tone="amber">Approximate</Badge>
          )
        }
      >
        <div className="space-y-3">
          {isDeterministic && (
            <Alert level="green" title="Real simulation">
              This strategy is defined as executable rules — the backtest engine walks every
              candle in the chosen timeframe's TradingView history mechanically and computes a
              real win rate, R:R, and max drawdown. No LLM judgment involved.
            </Alert>
          )}
          {isCustomJudgment && (
            <Alert level="amber" title="Hermes judgment, real history">
              This strategy is free-text, so Hermes reads it and applies judgment per trade over
              real TradingView history at the chosen timeframe — real data, but still not a
              mechanical simulation, so the win rate stays approximate.
            </Alert>
          )}
          {!selectedRule && (
            <Alert level="amber" title="Not a rigorous backtest">
              No strategy selected below, so this falls back to the Trading Agent narrating a
              judgment call over a bounded recent window of candles — not a deterministic
              simulation over years of history. Define a strategy in Strategy Rules above to get
              a real backtest instead.
            </Alert>
          )}
          <div className="flex flex-wrap gap-3">
            <Field label="Pair">
              <Select value={btPair} onChange={(e) => setBtPair(e.target.value)} className="h-11 w-40">
                {PAIRS.map((p) => (
                  <option key={p} value={p}>
                    {PAIR_SPECS[p].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Strategy" hint="Switch which taught strategy to test.">
              <Select
                value={btRuleId}
                onChange={(e) => setBtRuleId(e.target.value)}
                className="h-11 w-56"
              >
                <option value="">Free-form (agent judgment)</option>
                {rules
                  .filter((r) => r.active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Timeframe">
              <Select
                value={btTimeframe}
                onChange={(e) => setBtTimeframe(e.target.value)}
                className="h-11 w-28"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Note" hint="Optional — anything specific to focus on.">
            <input
              className="h-11 w-full rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              value={btNote}
              onChange={(e) => setBtNote(e.target.value)}
              placeholder="e.g. test the order-block strategy on 1H over the last couple weeks"
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={requestBacktest} disabled={requestingBacktest}>
              {requestingBacktest ? "Sending..." : "Request backtest"}
            </Button>
          </div>
        </div>
      </Card>
        );
      })()}

      {backtests.length > 0 && (
        <Card title="Backtest results" badge={<Badge tone="neutral">{backtests.length}</Badge>}>
          <div className="space-y-3">
            {backtests.map((b) => (
              <div key={b.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="blue">{b.pair}</Badge>
                    {b.timeframe && <Badge tone="neutral">{b.timeframe}</Badge>}
                    {b.deterministic ? (
                      <Badge tone="green">Deterministic</Badge>
                    ) : (
                      <Badge tone="amber">Approximate</Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(b.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">{b.period_description}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <Stat label="Win rate" value={`${Math.round(b.win_rate * 100)}%`} />
                  <Stat label="Trades" value={b.trades_analyzed} />
                  <Stat label="W / L" value={`${b.wins} / ${b.losses}`} />
                  {b.avg_rr != null && <Stat label="Avg R:R" value={b.avg_rr.toFixed(2)} />}
                  {b.max_drawdown_pct != null && (
                    <Stat label="Max drawdown" value={`${b.max_drawdown_pct.toFixed(1)}%`} />
                  )}
                  {b.bars_used != null && <Stat label="Bars used" value={b.bars_used} />}
                </div>
                <p className="mt-2 text-[13px] text-foreground">{b.narrative}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {requests.length > 0 && (
        <Card title="Requests" badge={<Badge tone="neutral">{requests.length}</Badge>}>
          <div className="space-y-3">
            {requests.map((r) => {
              const replies = notes.filter((n) => n.request_id === r.id);
              return (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge tone="blue">{r.pair}</Badge>
                      {r.request_type === "backtest" && <Badge tone="amber">Backtest</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                      <Badge tone={r.status === "pending" ? "amber" : "green"}>{r.status}</Badge>
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => removeRequest(r.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  {r.note && <p className="mt-2 text-[13px] text-foreground">{r.note}</p>}
                  {r.user_analysis && (
                    <div className="mt-2 rounded-lg bg-muted/50 p-2.5">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Your analysis
                      </p>
                      <p className="mt-1 text-[13px] text-foreground">{r.user_analysis}</p>
                    </div>
                  )}
                  {r.chart_image && (
                    <img
                      src={r.chart_image}
                      alt="Attached chart"
                      className="mt-2 max-h-64 w-full rounded-lg border border-border object-contain"
                    />
                  )}
                  {replies.map((n) => (
                    <div key={n.id} className="mt-2 border-l-2 border-primary/40 pl-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Trading Agent
                        </span>
                        {n.verdict && (
                          <Badge tone={verdictTone[n.verdict]}>{verdictLabel[n.verdict]}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-[13px] text-foreground">{n.summary}</p>
                    </div>
                  ))}
                </div>
              );
            })}
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
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                    <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => removeSetup(s.id)}>
                      Remove
                    </Button>
                  </div>
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

      <Card
        title="Agent analysis log"
        badge={<Badge tone="green">{notes.filter((n) => !n.request_id).length} notes</Badge>}
      >
        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading...</p>
        ) : notes.filter((n) => !n.request_id).length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No ambient analysis yet — replies to your requests appear threaded above instead.
          </p>
        ) : (
          <div className="space-y-3">
            {notes
              .filter((n) => !n.request_id)
              .map((n) => (
              <div key={n.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  {n.pair && <Badge tone="blue">{n.pair}</Badge>}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                    <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => removeNote(n.id)}>
                      Remove
                    </Button>
                  </div>
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
