import { useEffect, useRef, useState } from "react";
import { chartTheme } from "@/lib/chart-theme";

interface Props {
  pair: string;
  /** Height of the chart container — px number or CSS string like "100%" (default 480). */
  height?: number | string;
  /** If true, the chart won't load until the user explicitly requests it. */
  lazy?: boolean;
}

/**
 * Embeds TradingView's Advanced Chart widget for the given forex pair.
 * Re-mounts when the pair changes.
 *
 * The widget's own palette is driven from the site's active `--gz-*` theme
 * (resolved to concrete colours by chartTheme(), since the iframe can't read
 * our CSS variables), so it stops looking like a bolted-on third-party frame
 * and reads as part of the terminal.
 */
export function TradingViewChart({ pair, height = 480, lazy = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(!lazy);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(false);
    container.innerHTML = "";

    const t = chartTheme();
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.onload = () => setLoading(false);
    script.onerror = () => {
      setLoading(false);
      setError(true);
    };
    // Timeout fallback in case the script hangs
    const timeout = setTimeout(() => setLoading(false), 8000);

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `FX:${pair}`,
      interval: "H1",
      timezone: "Africa/Lagos",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
      withdateranges: true,
      allow_symbol_change: true,
      /* Match the terminal's palette. TradingView expects hex/rgba strings
         for these overrides, so pass through the resolved oklch() values —
         modern Chrome accepts them in the widget's CSS layer. */
      backgroundColor: t.bg,
      gridColor: t.grid,
      overrides: {
        "paneProperties.background": t.bg,
        "paneProperties.backgroundType": "solid",
        "paneProperties.vertGridProperties.color": t.grid,
        "paneProperties.horzGridProperties.color": t.grid,
        "scalesProperties.textColor": t.text,
        "scalesProperties.lineColor": t.border,
        "mainSeriesProperties.candleStyle.upColor": t.up,
        "mainSeriesProperties.candleStyle.downColor": t.down,
        "mainSeriesProperties.candleStyle.borderUpColor": t.up,
        "mainSeriesProperties.candleStyle.borderDownColor": t.down,
        "mainSeriesProperties.candleStyle.wickUpColor": t.wick,
        "mainSeriesProperties.candleStyle.wickDownColor": t.wick,
      },
    });

    container.appendChild(script);

    return () => {
      clearTimeout(timeout);
      container.innerHTML = "";
    };
  }, [pair, active]);

  // Placeholder when lazy and not yet requested
  if (!active) {
    return (
      <div
        className="relative flex items-center justify-center cursor-pointer fx-hover"
        style={{ height, background: "oklch(var(--gz-bg))" }}
        onClick={() => setActive(true)}
      >
        <div className="text-center">
          <p className="mono-cap" style={{ color: "oklch(var(--gz-p))" }}>
            Tap to load TradingView chart
          </p>
          <p className="mt-1 text-[10px]" style={{ color: "oklch(var(--gz-mut))" }}>
            {pair} · H1
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height, background: "oklch(var(--gz-bg))" }}>
      <div className="tradingview-widget-container h-full w-full" ref={containerRef}>
        <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }} />
      </div>
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center fx-scan"
          style={{ background: "oklch(var(--gz-bg))" }}
        >
          <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>Loading chart…</span>
        </div>
      )}
      {error && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "oklch(var(--gz-bg))" }}
        >
          <div className="alert alert-red" style={{ maxWidth: 320 }}>
            <p className="alert-title">Chart unavailable</p>
            <p className="alert-body">
              TradingView's embed failed to load. Use the Analysis view for the local chart instead.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
