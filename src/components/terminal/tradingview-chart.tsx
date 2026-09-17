import { useEffect, useRef, useState, useCallback } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { chartTheme } from "@/lib/chart-theme";
import { pairSpec } from "@/lib/engine/pairs";

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(!lazy);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const spec = pairSpec(pair);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        if (wrapperRef.current && !document.fullscreenElement) {
          wrapperRef.current.requestFullscreen?.().catch(() => {});
        }
      } else {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

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
        className="relative flex items-center justify-center cursor-pointer fx-hover rounded-lg border border-border/40"
        style={{ height, background: "oklch(var(--gz-bg))" }}
        onClick={() => setActive(true)}
      >
        <div className="text-center">
          <p className="mono-cap" style={{ color: "oklch(var(--gz-p))" }}>
            Tap to load TradingView chart
          </p>
          <p className="mt-1 text-[10px]" style={{ color: "oklch(var(--gz-mut))" }}>
            {spec.label} · H1
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-[9999] flex flex-col bg-background/98 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200"
          : "relative w-full rounded-lg overflow-hidden border border-border/40"
      }
      style={{
        height: isFullscreen ? "100svh" : height,
        background: "oklch(var(--gz-bg))",
      }}
    >
      {/* Fullscreen header bar */}
      {isFullscreen && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-card/80 px-3 py-2 rounded-t-lg backdrop-blur mb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[14px] text-foreground font-mono">
              {spec.label}
            </span>
            <span className="text-[12px] text-muted-foreground border-l border-border/60 pl-2">
              TradingView Live Chart
            </span>
          </div>
          <button
            onClick={toggleFullscreen}
            title="Exit Full Screen (Esc)"
            className="flex items-center gap-1 h-7 rounded-md border border-primary bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
          >
            <Minimize2 size={12} /> Exit Full Screen
          </button>
        </div>
      )}

      {/* Floating Fullscreen button (when not in fullscreen) */}
      {!isFullscreen && (
        <button
          title="Full Screen View"
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground hover:text-foreground hover:border-foreground/40 shadow-sm transition-colors"
        >
          <Maximize2 size={13} />
        </button>
      )}

      <div className="tradingview-widget-container flex-1 w-full min-h-0" ref={containerRef}>
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
