/**
 * GizzyFx brand marks.
 *
 * Vector recreations of the GizzyFx identity: candlestick cluster, chrome
 * swoosh, angular monogram and rising arrow. Rendered as inline SVG so they
 * stay crisp at every size and pick up the page's Rajdhani display face.
 *
 * If you later drop raster versions into `public/` (logo-mark.png,
 * logo-full.png), swap <LogoMark/> for an <img> — the layout sizes are the same.
 */

let gradSeq = 0;

/** Circular badge icon — candlesticks, swoosh and arrow inside a neon ring. */
export function LogoMark({ size = 34 }: { size?: number }) {
  const uid = `lm${++gradSeq}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5cff9d" />
          <stop offset="45%" stopColor="#12e065" />
          <stop offset="100%" stopColor="#0a8f3f" />
        </linearGradient>
        <linearGradient id={`${uid}-chrome`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#c8d2d8" />
          <stop offset="65%" stopColor="#8b979e" />
          <stop offset="100%" stopColor="#e8eef1" />
        </linearGradient>
        <linearGradient id={`${uid}-green`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#0fbf52" />
          <stop offset="100%" stopColor="#5cff9d" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="70%" stopColor="#0a1f12" stopOpacity="0" />
          <stop offset="100%" stopColor="#12e065" stopOpacity="0.35" />
        </radialGradient>
      </defs>

      {/* Ring + dark field */}
      <circle cx="50" cy="50" r="46" fill="#050807" />
      <circle cx="50" cy="50" r="46" fill={`url(#${uid}-glow)`} />
      <circle
        cx="50" cy="50" r="45.5"
        stroke={`url(#${uid}-ring)`}
        strokeWidth="4.5"
      />

      {/* Candlestick cluster */}
      <g strokeLinecap="round">
        {/* green */}
        <line x1="27" y1="34" x2="27" y2="58" stroke="#17c95c" strokeWidth="2" />
        <rect x="24" y="39" width="6" height="13" rx="1" fill="#17c95c" />
        {/* red */}
        <line x1="37" y1="26" x2="37" y2="53" stroke="#e8433f" strokeWidth="2" />
        <rect x="34" y="31" width="6" height="15" rx="1" fill="#e8433f" />
        {/* green tall */}
        <line x1="47" y1="22" x2="47" y2="50" stroke="#17c95c" strokeWidth="2" />
        <rect x="44" y="27" width="6" height="17" rx="1" fill="#17c95c" />
        {/* red short */}
        <line x1="57" y1="28" x2="57" y2="52" stroke="#e8433f" strokeWidth="2" />
        <rect x="54" y="33" width="6" height="12" rx="1" fill="#e8433f" />
      </g>

      {/* Chrome swoosh */}
      <path
        d="M17 68 C 30 55, 44 63, 56 64 C 68 65, 74 54, 80 40"
        stroke={`url(#${uid}-chrome)`}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Rising arrow */}
      <path
        d="M24 74 C 42 74, 60 68, 72 44"
        stroke={`url(#${uid}-green)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M69 32 L79 47 L62 47 Z"
        fill="#5cff9d"
        transform="rotate(18 70 42)"
      />
    </svg>
  );
}

/** "GizzyFx" wordmark — chrome "Gizzy", neon "Fx". Uses the Rajdhani face. */
export function LogoWordmark({ height = 22 }: { height?: number }) {
  const uid = `lw${++gradSeq}`;
  const w = height * 4.4;
  return (
    <svg
      height={height}
      width={w}
      viewBox="0 0 220 50"
      fill="none"
      aria-label="GizzyFx"
      role="img"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`${uid}-chrome`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="42%" stopColor="#dfe7eb" />
          <stop offset="55%" stopColor="#8d999f" />
          <stop offset="72%" stopColor="#ced8dd" />
          <stop offset="100%" stopColor="#f4f8fa" />
        </linearGradient>
        <linearGradient id={`${uid}-green`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dffb4" />
          <stop offset="45%" stopColor="#1fe268" />
          <stop offset="100%" stopColor="#0b9a43" />
        </linearGradient>
      </defs>

      <g
        fontFamily="'Rajdhani', sans-serif"
        fontWeight="700"
        fontSize="44"
        transform="skewX(-8)"
      >
        <text x="6" y="38" fill={`url(#${uid}-chrome)`} letterSpacing="0.5">
          Gizzy
        </text>
        <text x="128" y="38" fill={`url(#${uid}-green)`} letterSpacing="1">
          FX
        </text>
      </g>

      {/* underline flick, echoing the logo's swoosh */}
      <path
        d="M8 45 L206 45"
        stroke={`url(#${uid}-green)`}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

/**
 * Oversized faded mark behind the page — the brand equivalent of the
 * figure standing behind the UI in the reference screens.
 */
export function LogoWatermark() {
  return (
    <div
      aria-hidden
      className="brand-watermark"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          placeItems: "center",
          gap: "3vh",
          opacity: 0.055,
        }}
      >
        <LogoMark size={340} />
        <LogoWordmark height={64} />
      </div>
    </div>
  );
}
