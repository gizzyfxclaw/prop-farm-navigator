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

const FALLBACK: ChartTheme = {
  bg: "oklch(0.038 0.006 220)",
  text: "oklch(0.560 0.018 215)",
  muted: "oklch(0.560 0.018 215)",
  grid: "oklch(0.800 0.135 196 / 0.07)",
  border: "oklch(0.800 0.135 196 / 0.18)",
  accent: "oklch(0.800 0.135 196)",
  highlight: "oklch(0.868 0.140 182)",
  up: "oklch(0.735 0.185 148)",
  down: "oklch(0.640 0.222 25)",
  wick: "oklch(0.560 0.018 215)",
  crosshair: "oklch(0.868 0.140 182 / 0.55)",
  dpr: 1,
};

/** Reads one `--gz-*` triple and wraps it as a usable oklch() colour. */
function token(styles: CSSStyleDeclaration, name: string, alpha?: number): string | null {
  const raw = styles.getPropertyValue(name).trim();
  if (!raw) return null;
  return alpha == null ? `oklch(${raw})` : `oklch(${raw} / ${alpha})`;
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
