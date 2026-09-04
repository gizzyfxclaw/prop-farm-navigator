import { useEffect, useRef, useState, type ReactNode } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   ANIMATED DATA PRIMITIVES
   ──────────────────────────────────────────────────────────────────────────
   Every component here animates values it is GIVEN. None of them invent,
   simulate or randomise data — if a prop is null they render an em-dash.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── TickValue ──────────────────────────────────────────────────────────
   Flashes green/red for ~750ms whenever the incoming value changes, the way
   a price cell does on a real terminal. Also renders a directional caret.
   ───────────────────────────────────────────────────────────────────────── */

export function TickValue({
  value,
  format,
  className,
  showArrow = true,
}: {
  value: number | null | undefined;
  format?: (v: number) => string;
  className?: string;
  showArrow?: boolean;
}) {
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const [seq, setSeq] = useState(0);
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;
    const before = prev.current;
    prev.current = value;
    if (before == null || before === value) return;
    setDir(value > before ? "up" : "down");
    setSeq((s) => s + 1);
    const id = window.setTimeout(() => setDir(null), 760);
    return () => window.clearTimeout(id);
  }, [value]);

  if (value == null || !Number.isFinite(value)) {
    return <span className={className} style={{ color: "oklch(var(--gz-mut))" }}>—</span>;
  }

  const text = format ? format(value) : String(value);
  const fx = dir === "up" ? "fx-tick-up" : dir === "down" ? "fx-tick-down" : "";

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <span key={seq} className={fx} style={{ fontVariantNumeric: "tabular-nums slashed-zero" }}>
        {text}
      </span>
      {showArrow && dir && (
        <span
          key={`a${seq}`}
          className={dir === "up" ? "fx-arrow-up" : "fx-arrow-down"}
          style={{
            fontSize: "0.72em",
            lineHeight: 1,
            color: dir === "up" ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))",
          }}
          aria-hidden
        >
          {dir === "up" ? "▲" : "▼"}
        </span>
      )}
    </span>
  );
}

/* ─── CountUp ────────────────────────────────────────────────────────────
   Eases from the previously rendered value to the new one over ~500ms.
   Interpolation is purely visual: the final frame is always the exact prop.
   ───────────────────────────────────────────────────────────────────────── */

export function CountUp({
  value,
  format,
  duration = 520,
  className,
}: {
  value: number | null | undefined;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const target = value != null && Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState<number | null>(target);
  const fromRef = useRef<number>(target ?? 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target == null) { setShown(null); return; }
    const from = fromRef.current;
    if (from === target) { setShown(target); return; }

    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { fromRef.current = target; setShown(target); return; }

    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      setShown(p >= 1 ? target : v);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  if (shown == null) {
    return <span className={className} style={{ color: "oklch(var(--gz-mut))" }}>—</span>;
  }
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums slashed-zero" }}>
      {format ? format(shown) : shown.toFixed(2)}
    </span>
  );
}

/* ─── LiveDot ────────────────────────────────────────────────────────────
   Emits an expanding ring while data is fresh; dims when stale/dead.
   ───────────────────────────────────────────────────────────────────────── */

export function LiveDot({
  state = "live",
  title,
}: {
  state?: "live" | "stale" | "dead";
  title?: string | undefined;
}) {
  const color =
    state === "live" ? "oklch(var(--gz-pos))"
    : state === "stale" ? "oklch(var(--gz-warn))"
    : "oklch(var(--gz-mut))";
  const cls = state === "stale" ? "is-stale" : state === "dead" ? "is-dead" : "";
  return <span className={`fx-live-dot ${cls}`} style={{ color }} title={title} aria-hidden />;
}

/* ─── Sparkline ──────────────────────────────────────────────────────────
   Draws the series it is handed. No data → nothing rendered.
   ───────────────────────────────────────────────────────────────────────── */

export function Sparkline({
  data,
  width = 84,
  height = 24,
  strokeWidth = 1.4,
  fill = true,
  animate = true,
  color,
}: {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
  animate?: boolean;
  color?: string;
}) {
  const clean = data.filter((n) => Number.isFinite(n));
  if (clean.length < 2) return null;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const pad = strokeWidth;
  const innerH = height - pad * 2;

  const pts = clean.map((v, i) => {
    const x = (i / (clean.length - 1)) * width;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  const first = clean[0]!;
  const last = clean[clean.length - 1]!;
  const stroke = color ?? (last >= first ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))");
  const uid = `sp${Math.abs(Math.round((first + last + clean.length) * 1000))}`;

  // Rough path length for the draw-on animation.
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!; const b = pts[i]!;
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`${uid}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && (
        <path d={area} fill={`url(#${uid}-f)`} className={animate ? "fx-area" : undefined} />
      )}
      <path
        d={line}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "fx-draw" : undefined}
        style={animate ? ({ ["--fx-len" as string]: len.toFixed(0) }) : undefined}
      />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={strokeWidth * 1.35} fill={stroke} />
    </svg>
  );
}

/* ─── Gauge ──────────────────────────────────────────────────────────────
   Ring meter for drawdown / target / risk utilisation. pct is 0..1.
   ───────────────────────────────────────────────────────────────────────── */

export function Gauge({
  pct,
  size = 56,
  thickness = 4,
  label,
  tone = "auto",
}: {
  pct: number;
  size?: number;
  thickness?: number;
  label?: ReactNode;
  tone?: "auto" | "pos" | "neg" | "warn" | "accent";
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - clamped);

  const color =
    tone === "pos" ? "oklch(var(--gz-pos))"
    : tone === "neg" ? "oklch(var(--gz-neg))"
    : tone === "warn" ? "oklch(var(--gz-warn))"
    : tone === "accent" ? "oklch(var(--gz-p))"
    : clamped >= 0.8 ? "oklch(var(--gz-neg))"
    : clamped >= 0.55 ? "oklch(var(--gz-warn))"
    : "oklch(var(--gz-pos))";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }} aria-hidden>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="oklch(var(--gz-txt) / 0.08)"
          strokeWidth={thickness}
          fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          className="fx-gauge"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{
            ["--fx-circ" as string]: circ.toFixed(2),
            ["--fx-target" as string]: offset.toFixed(2),
          }}
        />
      </svg>
      {label != null && (
        <div
          style={{
            position: "absolute", inset: 0,
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: size * 0.24,
            fontWeight: 700,
            color,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

/* ─── LedMeter ───────────────────────────────────────────────────────────
   Segmented bar — reads as hardware. pct is 0..1.
   ───────────────────────────────────────────────────────────────────────── */

export function LedMeter({
  pct,
  segments = 16,
  tone = "auto",
  height = 8,
}: {
  pct: number;
  segments?: number;
  tone?: "auto" | "pos" | "neg" | "warn" | "accent";
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  const lit = Math.round(clamped * segments);
  const color =
    tone === "pos" ? "oklch(var(--gz-pos))"
    : tone === "neg" ? "oklch(var(--gz-neg))"
    : tone === "warn" ? "oklch(var(--gz-warn))"
    : tone === "accent" ? "oklch(var(--gz-p))"
    : clamped >= 0.8 ? "oklch(var(--gz-neg))"
    : clamped >= 0.55 ? "oklch(var(--gz-warn))"
    : "oklch(var(--gz-pos))";

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", width: "100%" }} aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={i < lit ? "fx-led" : undefined}
          style={{
            flex: "1 1 0",
            height,
            borderRadius: 1,
            background: i < lit ? color : "oklch(var(--gz-txt) / 0.07)",
            boxShadow: i < lit ? `0 0 5px ${color}` : "none",
            animationDelay: `${i * 22}ms`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────
   Honest loading placeholder. Never a fake number.
   ───────────────────────────────────────────────────────────────────────── */

export function Skeleton({ w = "100%", h = 12 }: { w?: number | string; h?: number }) {
  return <span className="fx-skeleton" style={{ display: "inline-block", width: w, height: h }} aria-hidden />;
}

/* ─── LoadBar ────────────────────────────────────────────────────────────
   Indeterminate progress line for a panel that's fetching.
   ───────────────────────────────────────────────────────────────────────── */

export function LoadBar({ active }: { active: boolean }) {
  if (!active) return null;
  return <span className="fx-loadbar" aria-hidden />;
}
