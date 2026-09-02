import { useEffect, useRef, useState } from "react";

interface Props {
  pair: string;
  /** Height of the chart container — px number or CSS string like "100%" (default 480). */
  height?: number | string;
  /** If true, the chart won't load until the user explicitly requests it. */
  lazy?: boolean;
}

/**
 * Embeds TradingView's Advanced Chart widget for the given forex pair.
 * Automatically re-mounts when the pair changes.
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
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.onload = () => setLoading(false);
    script.onerror = () => {
      setLoading(false);
      setError(true);
    };
    // Timeout fallback in case the script hangs
    const timeout = setTimeout(() => {
      if (loading) setLoading(false);
    }, 8000);
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `FX:${pair}`,
      interval: "H1",
      timezone: "Etc/UTC",
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
        className="relative flex items-center justify-center bg-[#0d0d0d] cursor-pointer hover:bg-[#1a1a1a] transition-colors"
        style={{ height }}
        onClick={() => setActive(true)}
      >
        <span className="text-[13px] text-muted-foreground animate-pulse">Tap to load TradingView chart…</span>
      </div>
    );
  }

  return (
    <div className="relative bg-[#0d0d0d]" style={{ height }}>
      <div className="tradingview-widget-container h-full w-full" ref={containerRef}>
        <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }} />
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]">
          <span className="text-[13px] text-muted-foreground animate-pulse">Loading chart…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]">
          <span className="text-[13px] text-red-400">Failed to load chart. Try Analysis view instead.</span>
        </div>
      )}
    </div>
  );
}
