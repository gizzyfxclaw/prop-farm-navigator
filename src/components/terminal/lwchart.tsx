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

type DrawTool = "cursor" | "hline" | "trendline" | "zone";

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

const TOOL_ICONS: Record<DrawTool, string> = {
  cursor: "↖",
  hline: "─",
  trendline: "╱",
  zone: "▭",
};
const TOOL_LABELS: Record<DrawTool, string> = {
  cursor: "Pan / zoom",
  hline: "Horizontal line",
  trendline: "Trend line",
  zone: "Zone",
};

function applyDrawings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chart: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  freshSeries: any,
  bars: OHLCBar[],
  drawings: Drawing[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawingSeriesRef: React.MutableRefObject<any[]>,
) {
  // Remove old trendline/zone series
  for (const s of drawingSeriesRef.current) {
    try { chart.removeSeries(s); } catch { /* ignore */ }
  }
  drawingSeriesRef.current = [];

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
      d.p1time != null && d.p2time != null &&
      d.p1price != null && d.p2price != null
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
        price: d.topPrice, color, lineWidth: 1, lineStyle: 1,
        axisLabelVisible: true, title: `▲ ${d.label ?? "Zone"}`,
      });
      freshSeries.createPriceLine({
        price: d.bottomPrice, color, lineWidth: 1, lineStyle: 1,
        axisLabelVisible: true, title: `▼ ${d.label ?? "Zone"}`,
      });
    } else if (d.type === "marker" && d.time != null) {
      markers.push({
        time: d.time,
        position: d.position ?? "aboveBar",
        color,
        shape:
          d.markerType === "arrowUp" ? "arrowUp"
          : d.markerType === "arrowDown" ? "arrowDown"
          : "circle",
        text: d.label ?? "",
        size: 1,
      });
    }
  }

  if (markers.length) freshSeries.setMarkers(markers);

  // Rebuild candle data (price lines can't be individually removed in v4)
  freshSeries.setData(
    bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
  );
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

  // Drawing tool state
  const [activeTool, setActiveTool] = useState<DrawTool>("cursor");
  const [userDrawings, setUserDrawings] = useState<Drawing[]>([]);
  const [pendingPoint, setPendingPoint] = useState<{ time: number; price: number } | null>(null);
  // The `title` attribute only shows on mouse hover — touch has no hover, so
  // double-tapping a tool button surfaces its label here instead.
  const [labelTool, setLabelTool] = useState<DrawTool | null>(null);
  const labelTimeoutRef = useRef<number | null>(null);

  function showToolLabel(tool: DrawTool) {
    setLabelTool(tool);
    if (labelTimeoutRef.current != null) window.clearTimeout(labelTimeoutRef.current);
    labelTimeoutRef.current = window.setTimeout(() => setLabelTool(null), 2000);
  }

  useEffect(() => {
    return () => {
      if (labelTimeoutRef.current != null) window.clearTimeout(labelTimeoutRef.current);
    };
  }, []);

  // Refs to avoid stale closures in event handlers
  const activeToolRef = useRef<DrawTool>("cursor");
  const pendingPointRef = useRef<{ time: number; price: number } | null>(null);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { pendingPointRef.current = pendingPoint; }, [pendingPoint]);

  // Load CDN script once
  useEffect(() => {
    if (window.LightweightCharts) {
      setReady(true);
      return undefined;
    }
    const existing = document.getElementById("__lw_charts__");
    if (!existing) {
      const s = document.createElement("script");
      s.id = "__lw_charts__";
      s.src = LW_CDN;
      s.onload = () => setReady(true);
      document.head.appendChild(s);
      return undefined;
    }
    // Script tag exists but may still be loading — poll for the global
    const id = setInterval(() => {
      if (window.LightweightCharts) {
        setReady(true);
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
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
      grid: { vertLines: { color: "#1a1f2e" }, horzLines: { color: "#1a1f2e" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#1e293b", minimumWidth: 64 },
      timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderDownColor: "#ef4444", borderUpColor: "#22c55e",
      wickDownColor: "#6b7280", wickUpColor: "#6b7280",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Click handler for drawing tools
    chart.subscribeClick((param: any) => {
      if (!param.point || activeToolRef.current === "cursor") return;
      const series = candleSeriesRef.current;
      if (!series) return;
      const price: number | null = series.coordinateToPrice(param.point.y);
      const time = chart.timeScale().coordinateToTime(param.point.x);
      if (price == null || time == null) return;

      const tool = activeToolRef.current;

      if (tool === "hline") {
        setUserDrawings((prev) => [
          ...prev,
          { type: "hline", price, color: "#3b82f6", style: "solid", label: price.toFixed(5) },
        ]);
      } else if (tool === "trendline") {
        if (!pendingPointRef.current) {
          setPendingPoint({ time: time as number, price });
        } else {
          const p1 = pendingPointRef.current;
          setUserDrawings((prev) => [
            ...prev,
            { type: "trendline", p1time: p1.time, p1price: p1.price, p2time: time as number, p2price: price, color: "#3b82f6" },
          ]);
          setPendingPoint(null);
        }
      } else if (tool === "zone") {
        if (!pendingPointRef.current) {
          setPendingPoint({ time: time as number, price });
        } else {
          const p1 = pendingPointRef.current;
          setUserDrawings((prev) => [
            ...prev,
            {
              type: "zone",
              topPrice: Math.max(p1.price, price),
              bottomPrice: Math.min(p1.price, price),
              color: "#8b5cf6", label: "Zone",
            },
          ]);
          setPendingPoint(null);
        }
      }
    });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-render all drawings (agent + user) when either changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bars.length) return;

    const allDrawings = [...drawings, ...userDrawings];

    // Re-create candle series to reset price lines (v4 limitation)
    const oldSeries = candleSeriesRef.current;
    const freshSeries = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderDownColor: "#ef4444", borderUpColor: "#22c55e",
      wickDownColor: "#6b7280", wickUpColor: "#6b7280",
    });
    if (oldSeries) {
      try { chart.removeSeries(oldSeries); } catch { /* ignore */ }
    }
    candleSeriesRef.current = freshSeries;

    applyDrawings(chart, freshSeries, bars, allDrawings, drawingSeriesRef);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, userDrawings, ready]);

  // Apply candles when bars change (without resetting drawings)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || !bars.length) return;
    series.setData(
      bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, ready]);

  const cursorStyle =
    activeTool === "cursor" ? "default"
    : activeTool === "hline" ? "crosshair"
    : "crosshair";

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      {/* Drawing toolbar — overlaid top-left */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        {(["cursor", "hline", "trendline", "zone"] as DrawTool[]).map((tool) => (
          <button
            key={tool}
            title={TOOL_LABELS[tool]}
            onClick={() => {
              setActiveTool(tool);
              setPendingPoint(null);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              showToolLabel(tool);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-md border text-[13px] font-bold transition-colors ${
              activeTool === tool
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card/80 text-muted-foreground hover:text-foreground hover:border-foreground/40"
            }`}
          >
            {TOOL_ICONS[tool]}
          </button>
        ))}
        {labelTool && (
          <div className="absolute left-full top-0 ml-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground shadow-md">
            {TOOL_LABELS[labelTool]}
          </div>
        )}
        {/* Clear user drawings */}
        {userDrawings.length > 0 && (
          <button
            title="Clear my drawings"
            onClick={() => { setUserDrawings([]); setPendingPoint(null); }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/40 bg-card/80 text-[11px] font-bold text-red-400 hover:bg-red-500/10 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Pending point indicator */}
      {pendingPoint && (
        <div className="absolute top-2 right-2 z-10 rounded-md border border-primary/40 bg-card/90 px-2 py-1 text-[11px] text-primary">
          Click second point… (or press Esc)
        </div>
      )}

      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", cursor: cursorStyle }}
        className="bg-[#0d0d0d]"
        onKeyDown={(e) => { if (e.key === "Escape") { setPendingPoint(null); setActiveTool("cursor"); } }}
        tabIndex={0}
      />

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
