import { useEffect, useRef } from "react";

interface Props {
  pair: string;
  /** Height of the chart container — px number or CSS string like "100%" (default 480). */
  height?: number | string;
}

/**
 * Embeds TradingView's Advanced Chart widget for the given forex pair.
 * Automatically re-mounts when the pair changes.
 */
export function TradingViewChart({ pair, height = 480 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
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
      container.innerHTML = "";
    };
  }, [pair]);

  return (
    <div className="tradingview-widget-container" ref={containerRef} style={{ height }}>
      <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
