/**
 * Theme bridge for canvas-based chart libraries.
 *
 * Lightweight Charts (and any canvas renderer) can't consume CSS custom
 * properties — it needs concrete colour strings. This resolves the live
 * `--gz-*` OKLCH palette from the document at call time, so the chart
 * repaints in whichever of the six themes is active instead of being
 * hardcoded to one dark blue.
 */

export interface ChartTheme {
  bg: string;
  text: string;
  muted: string;
  grid: string;
  border: string;
  accent: string;
  highlight: string;
  up: string;
  down: string;
  wick: string;
  crosshair: string;
  /** Device pixel ratio, so the canvas renders at native resolution. */
  dpr: number;
}

/**
 * Converts a CSS OKLCH triple ("L C H", hue in degrees) + optional alpha
 * into an rgb()/rgba() string. Lightweight Charts parses colours with its
 * own regex-based helper that only understands rgb/rgba/hex/hsl/named
 * formats — handing it `oklch(...)` throws "Cannot parse color: ...", so
 * every colour crossing into the chart must be converted here first.
 */
function oklchToRgb(raw: string, alpha?: number): string {
  const [lStr = "0", cStr = "0", hStr = "0"] = raw.split(/\s+/);
  const L = parseFloat(lStr);
  const C = parseFloat(cStr);
  const H = (parseFloat(hStr) || 0) * (Math.PI / 180);

  const a = C * Math.cos(H);
  const b = C * Math.sin(H);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const gamma = (v: number) => {
    const c = Math.min(Math.max(v, 0), 1);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  const [r255, g255, b255] = [r, g, bl].map((v) => Math.round(gamma(v) * 255));

  return alpha == null ? `rgb(${r255}, ${g255}, ${b255})` : `rgba(${r255}, ${g255}, ${b255}, ${alpha})`;
}

const FALLBACK: ChartTheme = {
  bg: oklchToRgb("0.038 0.006 220"),
  text: oklchToRgb("0.560 0.018 215", 0.82),
  muted: oklchToRgb("0.560 0.018 215"),
  grid: oklchToRgb("0.800 0.135 196", 0.07),
  border: oklchToRgb("0.800 0.135 196", 0.18),
  accent: oklchToRgb("0.800 0.135 196"),
  highlight: oklchToRgb("0.868 0.140 182"),
  up: oklchToRgb("0.735 0.185 148"),
  down: oklchToRgb("0.640 0.222 25"),
  wick: oklchToRgb("0.560 0.018 215"),
  crosshair: oklchToRgb("0.868 0.140 182", 0.55),
  dpr: 1,
};

/** Reads one `--gz-*` triple and converts it to a chart-safe colour string. */
function token(styles: CSSStyleDeclaration, name: string, alpha?: number): string | null {
  const raw = styles.getPropertyValue(name).trim();
  if (!raw) return null;
  return oklchToRgb(raw, alpha);
}

/**
 * Resolves the active palette. Safe to call during SSR — returns the
 * fallback when `document` isn't available.
 */
export function chartTheme(): ChartTheme {
  if (typeof window === "undefined" || typeof document === "undefined") return FALLBACK;

  const styles = getComputedStyle(document.documentElement);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  return {
    bg:        token(styles, "--gz-bg")  ?? FALLBACK.bg,
    text:      token(styles, "--gz-txt", 0.82) ?? FALLBACK.text,
    muted:     token(styles, "--gz-mut") ?? FALLBACK.muted,
    grid:      token(styles, "--gz-p", 0.07) ?? FALLBACK.grid,
    border:    token(styles, "--gz-p", 0.18) ?? FALLBACK.border,
    accent:    token(styles, "--gz-p")   ?? FALLBACK.accent,
    highlight: token(styles, "--gz-h")   ?? FALLBACK.highlight,
    up:        token(styles, "--gz-pos") ?? FALLBACK.up,
    down:      token(styles, "--gz-neg") ?? FALLBACK.down,
    wick:      token(styles, "--gz-mut") ?? FALLBACK.wick,
    crosshair: token(styles, "--gz-h", 0.55) ?? FALLBACK.crosshair,
    dpr,
  };
}

/**
 * Subscribes to theme changes (the switcher sets `data-theme` on <html>)
 * and invokes the callback so a chart can repaint. Returns an unsubscribe.
 */
export function onThemeChange(fn: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const obs = new MutationObserver(fn);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
