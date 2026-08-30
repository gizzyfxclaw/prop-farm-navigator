import { useEffect, useRef, useState } from "react";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    // onload only fires once the script file itself has run (it builds the
    // iframe internally) — not once TradingView's own page has painted, but
    // it's the earliest signal we get and matches the LWChart loading pattern.
    script.onload = () => setLoading(false);
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
    <div className="relative bg-[#0d0d0d]" style={{ height }}>
      {/* containerRef's contents are wiped/rebuilt imperatively on every
          pair change — the loading overlay below must stay OUTSIDE it, or
          it gets torn out by container.innerHTML = "" along with everything else. */}
      <div className="tradingview-widget-container h-full w-full" ref={containerRef}>
        <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }} />
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]">
          <span className="text-[13px] text-muted-foreground animate-pulse">Loading chart…</span>
        </div>
      )}
    </div>
  );
}
