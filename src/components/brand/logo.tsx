/**
 * GizzyFx brand marks.
 *
 * Vector-only so they stay razor-sharp at any DPR — a 3x phone, a 4K panel,
 * or a print export all rasterise from the same paths.
 *
 * Colour comes from the live `--gz-*` theme tokens rather than baked-in
 * green/chrome, so the mark belongs to whichever palette is active instead
 * of clashing with it. The candles keep semantic P&L colours (--gz-pos /
 * --gz-neg) because that meaning shouldn't drift with the theme.
 */

let gradSeq = 0;

/** Circular badge — candlestick cluster inside a precision ring. */
export function LogoMark({ size = 32 }: { size?: number }) {
  const uid = `lm${++gradSeq}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      style={{ display: "block", flexShrink: 0, shapeRendering: "geometricPrecision" }}
    >
      <defs>
        <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="oklch(var(--gz-h))" />
          <stop offset="55%"  stopColor="oklch(var(--gz-p))" />
          <stop offset="100%" stopColor="oklch(var(--gz-p) / 0.35)" />
        </linearGradient>
        <linearGradient id={`${uid}-sweep`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"   stopColor="oklch(var(--gz-p) / 0.55)" />
          <stop offset="100%" stopColor="oklch(var(--gz-h))" />
        </linearGradient>
      </defs>

      {/* Instrument face */}
      <circle cx="50" cy="50" r="46" fill="oklch(var(--gz-bg))" />
      <circle cx="50" cy="50" r="46" fill="oklch(var(--gz-p) / 0.05)" />

      {/* Precision bezel: outer ring + inner hairline */}
      <circle cx="50" cy="50" r="45" stroke={`url(#${uid}-ring)`} strokeWidth="3.5" />
      <circle cx="50" cy="50" r="39.5" stroke="oklch(var(--gz-p) / 0.16)" strokeWidth="1" />

      {/* Chart gridlines behind the candles */}
      <g stroke="oklch(var(--gz-p) / 0.10)" strokeWidth="1">
        <line x1="18" y1="38" x2="82" y2="38" />
        <line x1="18" y1="52" x2="82" y2="52" />
        <line x1="18" y1="66" x2="82" y2="66" />
      </g>

      {/* Candlestick cluster — semantic P&L colours */}
      <g strokeLinecap="round">
        <line x1="29" y1="34" x2="29" y2="60" stroke="oklch(var(--gz-pos))" strokeWidth="1.8" />
        <rect x="26" y="40" width="6" height="14" rx="0.5" fill="oklch(var(--gz-pos))" />

        <line x1="41" y1="27" x2="41" y2="55" stroke="oklch(var(--gz-neg))" strokeWidth="1.8" />
        <rect x="38" y="32" width="6" height="16" rx="0.5" fill="oklch(var(--gz-neg))" />

        <line x1="53" y1="23" x2="53" y2="52" stroke="oklch(var(--gz-pos))" strokeWidth="1.8" />
        <rect x="50" y="28" width="6" height="18" rx="0.5" fill="oklch(var(--gz-pos))" />

        <line x1="65" y1="29" x2="65" y2="54" stroke="oklch(var(--gz-neg))" strokeWidth="1.8" />
        <rect x="62" y="34" width="6" height="13" rx="0.5" fill="oklch(var(--gz-neg))" />
      </g>

      {/* Trend sweep + arrowhead */}
      <path
        d="M22 74 C 40 74, 58 68, 72 44"
        stroke={`url(#${uid}-sweep)`}
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M67 33 L79 46 L61 47 Z" fill="oklch(var(--gz-h))" transform="rotate(20 70 42)" />
    </svg>
  );
}

/** "GizzyFX" wordmark — text in the sans face, "FX" in the accent. */
export function LogoWordmark({ height = 18 }: { height?: number }) {
  const uid = `lw${++gradSeq}`;
  const w = height * 4.6;
  return (
    <svg
      height={height}
      width={w}
      viewBox="0 0 230 50"
      fill="none"
      aria-label="GizzyFX"
      role="img"
      style={{ display: "block", overflow: "visible", shapeRendering: "geometricPrecision" }}
    >
      <defs>
        <linearGradient id={`${uid}-accent`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="oklch(var(--gz-h))" />
          <stop offset="100%" stopColor="oklch(var(--gz-p))" />
        </linearGradient>
      </defs>

      <g fontFamily="'Inter', system-ui, sans-serif" fontSize="38" fontWeight="800">
        <text x="2" y="36" fill="oklch(var(--gz-txt))" letterSpacing="-1.2">
          Gizzy
        </text>
        <text x="140" y="36" fill={`url(#${uid}-accent)`} letterSpacing="0.5">
          FX
        </text>
      </g>

      {/* Baseline rule — the terminal's hairline signature */}
      <path
        d="M3 44 L214 44"
        stroke="oklch(var(--gz-p) / 0.35)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M140 44 L214 44"
        stroke="oklch(var(--gz-h))"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
