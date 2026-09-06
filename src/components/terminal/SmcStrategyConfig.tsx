import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Alert, Badge, Button, Card, Field } from "@/components/terminal/ui";
import { Settings, Wand2, RotateCcw, Save, MessageSquare, Send, CheckCircle2, ImagePlus, X } from "lucide-react";

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

function GizzyFxCopilotChat({
  currentConfig,
  onApply,
  onCancel,
}: {
  currentConfig: SmcConfig;
  onApply: (config: SmcConfig) => void;
  onCancel: () => void;
}) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string; image?: string; timestamp?: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedConfig, setSuggestedConfig] = useState<SmcConfig | null>(null);
  const [discussionPhase, setDiscussionPhase] = useState<"initial" | "discussing" | "reviewing">("initial");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const startChat = async () => {
      setLoading(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        const res = await fetch("/api/hermes/smc-upgrade-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_config: currentConfig,
            message: "start",
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4_000_000) { alert("Image too large. Max 4MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setUploadedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendMessage = async () => {
    const msg = input.trim();
    if ((!msg && !uploadedImage) || loading) return;
    setInput("");
    setLoading(true);
    const userMsg: { role: string; content: string; image?: string; timestamp: string } = {
      role: "user",
      content: msg || "See attached image",
      timestamp: new Date().toISOString(),
    };
    if (uploadedImage) userMsg.image = uploadedImage;
    setMessages(prev => [...prev, userMsg]);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      const res = await fetch("/api/hermes/smc-upgrade-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_config: currentConfig,
          suggested_config: suggestedConfig,
          message: msg,
          chat_history: messages.slice(-10),
          image: uploadedImage,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
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
    setUploadedImage(null);
    setLoading(false);
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
      setTimeout(() => {
        if (suggestedConfig) onApply(suggestedConfig);
      }, 1500);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error applying upgrade. Please try Save Changes instead.", timestamp: new Date().toISOString() }]);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "oklch(var(--gz-p) / 0.2)", background: "oklch(var(--gz-s1) / 0.5)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 size={14} style={{ color: "oklch(var(--gz-p))" }} />
          <span className="text-[13px] font-semibold" style={{ color: "oklch(var(--gz-p))" }}>Upgrade with GizzyFx Co-Pilot</span>
          {discussionPhase === "reviewing" && suggestedConfig && (
            <Badge tone="green">Ready to apply</Badge>
          )}
        </div>
        <button onClick={onCancel} className="text-[12px] text-muted-foreground hover:text-foreground">
          ✕ Cancel
        </button>
      </div>

      <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1 scrollbar-institutional">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[90%] rounded-lg px-3 py-2 text-[12px] leading-relaxed" style={{
              background: m.role === "user" ? "oklch(var(--gz-p) / 0.15)" : "oklch(var(--gz-s2) / 0.5)",
              color: m.role === "user" ? "oklch(var(--gz-txt))" : "oklch(var(--gz-txt))",
            }}>
              {m.role === "assistant" && (
                <span className="text-[10px] font-semibold block mb-0.5" style={{ color: "oklch(var(--gz-p))" }}>GizzyFx Co-Pilot</span>
              )}
              {m.image && (
                <img src={m.image} alt="Uploaded" className="max-w-full rounded mb-2 max-h-40 object-contain" />
              )}
              <span className="whitespace-pre-wrap">{m.content}</span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 text-[12px] text-muted-foreground" style={{ background: "oklch(var(--gz-s2) / 0.5)" }}>
              <span className="text-[10px] font-semibold block mb-0.5" style={{ color: "oklch(var(--gz-p))" }}>GizzyFx Co-Pilot</span>
              <span className="inline-block animate-pulse">analyzing...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {discussionPhase === "discussing" && suggestedConfig && (
        <div className="rounded border p-2 space-y-1" style={{ borderColor: "oklch(var(--gz-p) / 0.15)", background: "oklch(var(--gz-s1) / 0.3)" }}>
          <p className="text-[10px] font-semibold" style={{ color: "oklch(var(--gz-p))" }}>Suggested Changes</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {Object.entries(PARAM_META).map(([key, meta]) => {
              const current = (currentConfig as unknown as Record<string, number>)[key];
              const suggested = (suggestedConfig as unknown as Record<string, number>)[key];
              if (current === suggested) return null;
              return (
                <div key={key} className="flex justify-between gap-1">
                  <span className="text-muted-foreground truncate">{meta.label}</span>
                  <span className="font-mono">
                    <span style={{ color: "oklch(var(--gz-neg))" }}>{current}</span>
                    <span className="text-muted-foreground">→</span>
                    <span style={{ color: "oklch(var(--gz-pos))" }}>{suggested}</span>
                  </span>
                </div>
              );
            })}
            {Object.entries(WEIGHT_META).map(([key, label]) => {
              const current = currentConfig.confluence_weights?.[key] ?? 0;
              const suggested = suggestedConfig.confluence_weights?.[key] ?? 0;
              if (current === suggested) return null;
              return (
                <div key={`w_${key}`} className="flex justify-between gap-1">
                  <span className="text-muted-foreground truncate">{label}</span>
                  <span className="font-mono">
                    <span style={{ color: "oklch(var(--gz-neg))" }}>{current}</span>
                    <span className="text-muted-foreground">→</span>
                    <span style={{ color: "oklch(var(--gz-pos))" }}>{suggested}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {discussionPhase === "discussing" && (
        <div className="space-y-2">
          {uploadedImage && (
            <div className="relative inline-block">
              <img src={uploadedImage} alt="Preview" className="max-h-24 rounded border" style={{ borderColor: "oklch(var(--gz-p) / 0.2)" }} />
              <button onClick={removeImage} className="absolute -top-1 -right-1 rounded-full p-0.5" style={{ background: "oklch(var(--gz-neg))", color: "#fff" }}>
                <X size={10} />
              </button>
            </div>
          )}
          <div className="flex gap-2 pt-2" style={{ borderTop: "1px solid oklch(var(--gz-p) / 0.1)" }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
              placeholder="Discuss changes or upload a chart image..."
              className="flex-1 rounded-lg border px-3 py-2 text-[12px] outline-none"
              style={{
                borderColor: "oklch(var(--gz-p) / 0.14)",
                background: "oklch(var(--gz-inp))",
                color: "oklch(var(--gz-txt))",
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg px-3 py-2 text-[12px] transition-colors"
              style={{ background: "oklch(var(--gz-s2) / 0.5)", color: "oklch(var(--gz-mut))" }}
              title="Upload chart image"
            >
              <ImagePlus size={14} />
            </button>
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && !uploadedImage)}
              className="rounded-lg px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
              style={{ background: "oklch(var(--gz-p) / 0.15)", color: "oklch(var(--gz-p))" }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {discussionPhase === "discussing" && suggestedConfig && (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={acceptAndApply} disabled={loading} className="flex-1" style={{ borderColor: "oklch(var(--gz-pos) / 0.3)", background: "oklch(var(--gz-pos) / 0.05)", color: "oklch(var(--gz-pos))" }}>
            <CheckCircle2 size={12} /> Apply Upgrade
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Discard
          </Button>
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
            <p className="mt-2">Tune these parameters manually or ask GizzyFx Co-Pilot to suggest improvements through a discussion.</p>
          </div>
        </Alert>

        {showUpgradeChat ? (
          <GizzyFxCopilotChat
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
              <Wand2 size={12} /> Upgrade with GizzyFx Co-Pilot
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