import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LightweightCharts: any;
  }
}

export interface OHLCBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Drawing {
  type: "hline" | "trendline" | "zone" | "marker";
  price?: number;
  label?: string;
  color?: string;
  style?: "solid" | "dashed" | "dotted";
  p1time?: number;
  p1price?: number;
  p2time?: number;
  p2price?: number;
  topPrice?: number;
  bottomPrice?: number;
  time?: number;
  position?: "aboveBar" | "belowBar";
  markerType?: "arrowUp" | "arrowDown" | "circle";
}

interface Props {
  bars: OHLCBar[];
  drawings?: Drawing[];
  height?: number | string;
  loading?: boolean;
}

const LW_CDN =
  "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js";

function lineStyleFromString(s?: string) {
  if (s === "dashed") return 1;
  if (s === "dotted") return 2;
  return 0;
}

export function LWChart({ bars, drawings = [], height = 480, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawingSeriesRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  // Load CDN script once
  useEffect(() => {
    if (window.LightweightCharts) {
      setReady(true);
      return;
    }
    const existing = document.getElementById("__lw_charts__");
    if (!existing) {
      const s = document.createElement("script");
      s.id = "__lw_charts__";
      s.src = LW_CDN;
      s.onload = () => setReady(true);
      document.head.appendChild(s);
    } else {
      // Script tag exists but may still be loading — poll
      const id = setInterval(() => {
        if (window.LightweightCharts) {
          setReady(true);
          clearInterval(id);
        }
      }, 50);
      return () => clearInterval(id);
    }
  }, []);

  // Create chart once LW is ready
  useEffect(() => {
    if (!ready) return;
    const container = containerRef.current;
    if (!container) return;

    const LW = window.LightweightCharts;
    const chart = LW.createChart(container, {
      width: container.clientWidth,
      height: typeof height === "number" ? height : container.clientHeight || 480,
      layout: {
        background: { color: "#0d0d0d" },
        textColor: "#9ca3af",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1a1f2e" },
        horzLines: { color: "#1a1f2e" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#1e293b", minimumWidth: 64 },
      timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#6b7280",
      wickUpColor: "#6b7280",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      drawingSeriesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [ready]);

  // Apply candles
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || !bars.length) return;
    series.setData(
      bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
    );
  }, [bars, ready]);

  // Apply drawings (re-runs any time drawings array changes)
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;

    // Remove old extra line series
    for (const s of drawingSeriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // ignore
      }
    }
    drawingSeriesRef.current = [];

    // Re-create candle series so price lines reset (price lines can't be individually removed in v4)
    const existingData = bars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    const freshSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#6b7280",
      wickUpColor: "#6b7280",
    });
    try {
      chart.removeSeries(series);
    } catch {
      // ignore
    }
    freshSeries.setData(existingData);
    candleSeriesRef.current = freshSeries;

    const markers: unknown[] = [];

    for (const d of drawings) {
      const color = d.color ?? "#f59e0b";

      if (d.type === "hline" && d.price != null) {
        freshSeries.createPriceLine({
          price: d.price,
          color,
          lineWidth: 1,
          lineStyle: lineStyleFromString(d.style),
          axisLabelVisible: true,
          title: d.label ?? "",
        });
      } else if (
        d.type === "trendline" &&
        d.p1time != null &&
        d.p2time != null &&
        d.p1price != null &&
        d.p2price != null
      ) {
        const tl = chart.addLineSeries({
          color,
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        tl.setData([
          { time: d.p1time, value: d.p1price },
          { time: d.p2time, value: d.p2price },
        ]);
        if (d.label) {
          tl.setMarkers([
            { time: d.p2time, position: "aboveBar", color, shape: "circle", text: d.label },
          ]);
        }
        drawingSeriesRef.current.push(tl);
      } else if (d.type === "zone" && d.topPrice != null && d.bottomPrice != null) {
        freshSeries.createPriceLine({
          price: d.topPrice,
          color,
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: `▲ ${d.label ?? "Zone"}`,
        });
        freshSeries.createPriceLine({
          price: d.bottomPrice,
          color,
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: `▼ ${d.label ?? "Zone"}`,
        });
      } else if (d.type === "marker" && d.time != null) {
        markers.push({
          time: d.time,
          position: d.position ?? "aboveBar",
          color,
          shape:
            d.markerType === "arrowUp"
              ? "arrowUp"
              : d.markerType === "arrowDown"
                ? "arrowDown"
                : "circle",
          text: d.label ?? "",
          size: 1,
        });
      }
    }

    if (markers.length) freshSeries.setMarkers(markers);
  }, [drawings, ready]);

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} className="bg-[#0d0d0d]" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/70">
          <span className="text-[13px] text-muted-foreground animate-pulse">Loading chart…</span>
        </div>
      )}
      {!loading && !bars.length && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/60">
          <span className="text-[13px] text-muted-foreground">No data</span>
        </div>
      )}
    </div>
  );
}
