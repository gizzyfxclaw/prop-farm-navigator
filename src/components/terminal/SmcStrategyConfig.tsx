import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Alert, Badge, Button, Card, Field } from "@/components/terminal/ui";
import { Settings, Wand2, RotateCcw, Save, MessageSquare, Send, CheckCircle2 } from "lucide-react";

interface SmcConfig {
  atr_period: number;
  swing_window: number;
  ob_impulse_mult: number;
  ob_max_age: number;
  fvg_max_age: number;
  sweep_max_age: number;
  bos_min_bars: number;
  retest_min_touches: number;
  sl_pips: number;
  tp1_rr: number;
  tp2_rr: number;
  confluence_weights: Record<string, number>;
}

const DEFAULT_CONFIG: SmcConfig = {
  atr_period: 14,
  swing_window: 3,
  ob_impulse_mult: 1.5,
  ob_max_age: 60,
  fvg_max_age: 60,
  sweep_max_age: 30,
  bos_min_bars: 0,
  retest_min_touches: 2,
  sl_pips: 30,
  tp1_rr: 1.5,
  tp2_rr: 2.0,
  confluence_weights: {
    ob_retest: 2.0,
    sweep: 2.0,
    choch: 1.5,
    bos: 1.0,
    bias: 1.0,
    fvg: 0.5,
    zone: 0.5,
  },
};

const PARAM_META: Record<string, { label: string; min: number; max: number; step: number; description: string }> = {
  atr_period: { label: "ATR Period", min: 5, max: 50, step: 1, description: "ATR lookback period. Higher = smoother, less sensitive to recent volatility." },
  swing_window: { label: "Swing Window", min: 2, max: 10, step: 1, description: "Fractal pivot detection window. Higher = fewer but more significant swing points." },
  ob_impulse_mult: { label: "OB Impulse Multiplier", min: 0.5, max: 4.0, step: 0.1, description: "Order block impulse threshold in ATR multiples. Higher = only the strongest order blocks." },
  ob_max_age: { label: "OB Max Age", min: 20, max: 200, step: 5, description: "Maximum bars to look back for order blocks. Higher = more historical levels." },
  fvg_max_age: { label: "FVG Max Age", min: 20, max: 200, step: 5, description: "Maximum bars to look back for fair value gaps." },
  sweep_max_age: { label: "Sweep Max Age", min: 10, max: 100, step: 5, description: "Maximum bars to look back for liquidity sweeps." },
  bos_min_bars: { label: "BOS Min Bars", min: 0, max: 10, step: 1, description: "Minimum bars before confirming a break of structure." },
  retest_min_touches: { label: "Retest Min Touches", min: 1, max: 5, step: 1, description: "Minimum touches of breakout boundary for a valid channel." },
  sl_pips: { label: "Stop Loss (pips)", min: 10, max: 100, step: 1, description: "Default stop loss distance in pips." },
  tp1_rr: { label: "TP1 R:R", min: 1.0, max: 5.0, step: 0.1, description: "Take profit 1 risk:reward multiple." },
  tp2_rr: { label: "TP2 R:R", min: 1.0, max: 5.0, step: 0.1, description: "Take profit 2 risk:reward multiple." },
};

const WEIGHT_META: Record<string, string> = {
  ob_retest: "Order Block Retest",
  sweep: "Liquidity Sweep",
  choch: "Change of Character",
  bos: "Break of Structure",
  bias: "Trend Bias",
  fvg: "Fair Value Gap",
  zone: "Premium/Discount Zone",
};

function HermesUpgradeChat({
  currentConfig,
  onApply,
  onCancel,
}: {
  currentConfig: SmcConfig;
  onApply: (config: SmcConfig) => void;
  onCancel: () => void;
}) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string; timestamp?: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedConfig, setSuggestedConfig] = useState<SmcConfig | null>(null);
  const [discussionPhase, setDiscussionPhase] = useState<"initial" | "discussing" | "reviewing">("initial");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    // Start the conversation with Hermes
    const startChat = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/hermes/smc-upgrade-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_config: currentConfig,
            message: "start",
          }),
        });
        const data = await res.json();
        if (data.reply) {
          setMessages([{ role: "assistant", content: data.reply, timestamp: new Date().toISOString() }]);
          if (data.suggested_config) {
            setSuggestedConfig(data.suggested_config as SmcConfig);
          }
          setDiscussionPhase("discussing");
        }
      } catch {
        setMessages([{ role: "assistant", content: "Sorry, I'm having trouble connecting. Please try again.", timestamp: new Date().toISOString() }]);
      }
      setLoading(false);
    };
    startChat();
  }, [currentConfig]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);
    const userMsg = { role: "user", content: msg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const res = await fetch("/api/hermes/smc-upgrade-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_config: currentConfig,
          suggested_config: suggestedConfig,
          message: msg,
          chat_history: messages.slice(-10),
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply, timestamp: new Date().toISOString() }]);
      }
      if (data.suggested_config) {
        setSuggestedConfig(data.suggested_config as SmcConfig);
      }
      if (data.phase === "reviewing") {
        setDiscussionPhase("reviewing");
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again.", timestamp: new Date().toISOString() }]);
    }
    setLoading(false);
  };

  const applyUpgrade = () => {
    if (suggestedConfig) {
      onApply(suggestedConfig);
    }
  };

  const acceptAndApply = async () => {
    setLoading(true);
    setMessages(prev => [...prev, { role: "user", content: "Yes, apply the upgrade.", timestamp: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/hermes/smc-upgrade-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_config: currentConfig,
          suggested_config: suggestedConfig,
          message: "apply",
          chat_history: messages,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply, timestamp: new Date().toISOString() }]);
      }
      // Apply after a short delay so user sees the confirmation
      setTimeout(() => {
        if (suggestedConfig) onApply(suggestedConfig);
      }, 1500);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error applying upgrade. Please try Save Changes instead.", timestamp: new Date().toISOString() }]);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 size={14} className="text-purple-400" />
          <span className="text-[13px] font-semibold text-purple-300">Upgrade with Hermes</span>
          {discussionPhase === "reviewing" && suggestedConfig && (
            <Badge tone="green">Ready to apply</Badge>
          )}
        </div>
        <button onClick={onCancel} className="text-[12px] text-muted-foreground hover:text-foreground">
          ✕ Cancel
        </button>
      </div>

      <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
              m.role === "user"
                ? "bg-purple-500/20 text-purple-100"
                : "bg-white/5 text-foreground"
            }`}>
              {m.role === "assistant" && (
                <span className="text-[10px] text-purple-400 font-semibold block mb-0.5">Hermes</span>
              )}
              <span className="whitespace-pre-wrap">{m.content}</span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 rounded-lg px-3 py-2 text-[12px] text-muted-foreground">
              <span className="text-[10px] text-purple-400 font-semibold block mb-0.5">Hermes</span>
              <span className="inline-block animate-pulse">typing...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {discussionPhase === "reviewing" && suggestedConfig && (
        <div className="flex gap-2 pt-2 border-t border-purple-500/20">
          <Button variant="ghost" onClick={acceptAndApply} disabled={loading} className="flex-1 border border-emerald-500/30 bg-emerald-500/5">
            <CheckCircle2 size={12} /> Apply Upgrade
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Discard
          </Button>
        </div>
      )}

      {discussionPhase === "discussing" && (
        <div className="flex gap-2 pt-2 border-t border-purple-500/20">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
            placeholder="Discuss changes with Hermes..."
            className="flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-purple-500/50"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-purple-500/20 px-3 py-2 text-[12px] text-purple-300 hover:bg-purple-500/30 disabled:opacity-40 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function SmcStrategyConfig() {
  const [config, setConfig] = useState<SmcConfig>(DEFAULT_CONFIG);
  const [defaults, setDefaults] = useState<SmcConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showUpgradeChat, setShowUpgradeChat] = useState(false);

  useEffect(() => {
    fetch("/api/smc-strategy-config")
      .then(r => r.json())
      .then(d => {
        if (d.config) setConfig(d.config as SmcConfig);
        if (d.defaults) setDefaults(d.defaults as SmcConfig);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isModified = JSON.stringify(config) !== JSON.stringify(defaults);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await fetch("/api/smc-strategy-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setDefaults(config);
    } catch {}
    setSaving(false);
  };

  const resetDefaults = async () => {
    try {
      await fetch("/api/smc-strategy-config", { method: "DELETE" });
      setConfig(DEFAULT_CONFIG);
      setDefaults(DEFAULT_CONFIG);
    } catch {}
  };

  const applyUpgrade = async (newConfig: SmcConfig) => {
    setConfig(newConfig);
    setShowUpgradeChat(false);
    setSaving(true);
    try {
      await fetch("/api/smc-strategy-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      setDefaults(newConfig);
    } catch {}
    setSaving(false);
  };

  if (loading) {
    return (
      <Card title="SMC Strategy Configuration">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/5 rounded w-1/3" />
          <div className="h-8 bg-white/5 rounded" />
          <div className="h-8 bg-white/5 rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="SMC Strategy Configuration"
      badge={<Badge tone="neutral">Advanced</Badge>}
    >
      <div className="space-y-4">
        <Alert level="blue" title="How the SMC Strategy Works">
          <div className="text-[12px] space-y-2">
            <p>The SMC engine detects market structure through these steps:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li><strong>Swing Detection</strong> — Finds fractal pivot highs/lows using the Swing Window parameter</li>
              <li><strong>Structure Analysis</strong> — Classifies HH/HL/LH/LL patterns, detects BOS (break of structure) and CHoCH (change of character)</li>
              <li><strong>Order Blocks</strong> — Identifies the last opposite candle before an impulsive move (threshold = OB Impulse Multiplier × ATR)</li>
              <li><strong>Fair Value Gaps</strong> — Detects 3-candle imbalances</li>
              <li><strong>Liquidity Sweeps</strong> — Finds false breakouts of swing levels</li>
              <li><strong>Confluence Scoring</strong> — Weights each factor to produce a confidence score</li>
            </ol>
            <p className="mt-2">Tune these parameters manually or ask Hermes to suggest improvements through a discussion.</p>
          </div>
        </Alert>

        {showUpgradeChat ? (
          <HermesUpgradeChat
            currentConfig={config}
            onApply={applyUpgrade}
            onCancel={() => setShowUpgradeChat(false)}
          />
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={saveConfig} disabled={saving || !isModified}>
              <Save size={12} /> {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="ghost" onClick={resetDefaults} disabled={saving}>
              <RotateCcw size={12} /> Reset to Defaults
            </Button>
            <Button variant="ghost" onClick={() => setShowUpgradeChat(true)} disabled={saving}>
              <Wand2 size={12} /> Upgrade with Hermes
            </Button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(PARAM_META).map(([key, meta]) => (
            <Field key={key} label={meta.label} hint={meta.description}>
              <input
                type="number"
                min={meta.min}
                max={meta.max}
                step={meta.step}
                value={(config as unknown as Record<string, number>)[key] ?? 0}
                onChange={e => setConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                className="h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </Field>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-foreground flex items-center gap-2">
            <Settings size={14} /> Confluence Weights
          </p>
          <p className="text-[12px] text-muted-foreground">
            These weights control how much each SMC factor contributes to the confidence score.
          </p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(WEIGHT_META).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={config.confluence_weights?.[key] ?? 0}
                  onChange={e => setConfig(prev => ({
                    ...prev,
                    confluence_weights: { ...prev.confluence_weights, [key]: parseFloat(e.target.value) || 0 },
                  }))}
                  className="h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </Field>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default SmcStrategyConfig;
