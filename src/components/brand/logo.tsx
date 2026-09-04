/**
 * GizzyFx brand marks — PNG-based using the official logo asset.
 *
 * Using <img> instead of inline SVG so the real brand logo renders exactly
 * as designed, at native resolution, on all devices and screen densities.
 * The PNG has a transparent background so it works in both light and dark mode.
 */

/** Circular badge icon — the candlestick mark without the wordmark. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/favicon-64.png"
      width={size}
      height={size}
      alt="GizzyFX"
      style={{
        display: "block",
        flexShrink: 0,
        objectFit: "contain",
        imageRendering: "auto",
      }}
    />
  );
}

/** "GizzyFX" text logo — the text portion of the brand. */
export function LogoWordmark({ height = 36 }: { height?: number }) {
  // Aspect ratio of the text crop is ~67:36 ≈ 1.86:1
  const width = Math.round(height * 1.86);
  return (
    <img
      src="/gizzyfx-nav.png"
      width={width}
      height={height}
      alt="GizzyFX"
      style={{
        display: "block",
        objectFit: "contain",
        flexShrink: 0,
        imageRendering: "auto",
      }}
    />
  );
}

/** Full brand including both mark and text — for large display. */
export function LogoFull({ height = 60 }: { height?: number }) {
  const width = Math.round(height * (941 / 1672));
  return (
    <img
      src="/gizzyfx-brand.png"
      width={width}
      height={height}
      alt="GizzyFX"
      style={{
        display: "block",
        objectFit: "contain",
        flexShrink: 0,
        imageRendering: "auto",
      }}
    />
  );
}

/**
 * Large faded watermark — the full GizzyFX brand behind the page.
 * Positioned fixed so it doesn't scroll.
 */
export function LogoWatermark() {
  return (
    <div
      aria-hidden
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
      <img
        src="/gizzyfx-watermark.png"
        alt=""
        style={{
          width: "min(75vw, 560px)",
          height: "auto",
          opacity: 0.085,
          userSelect: "none",
          display: "block",
          objectFit: "contain",
          filter: "var(--gz-watermark-filter, none)",
        }}
      />
    </div>
  );
}
