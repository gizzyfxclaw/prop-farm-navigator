import { useEffect, useRef, useState, useCallback } from "react";
import { X, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { chartTheme, onThemeChange } from "@/lib/chart-theme";
import { pairSpec } from "@/lib/engine/pairs";

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
  /** Persist the user's own hand-drawn tools under this key (e.g. the pair)
   *  so they survive navigating away and back, or a page reload. Omit to
   *  keep drawings in-memory only (cleared on unmount, as before). */
  storageKey?: string;
  /** Override pair for price formatting (defaults to storageKey). */
  pair?: string;
  /** Optional title to display in full screen mode */
  title?: string;
}

function loadStoredDrawings(storageKey: string | undefined): Drawing[] {
  if (!storageKey) return [];
  try {
    const raw = localStorage.getItem(`gizzyfx:chart-drawings:${storageKey}`);
    return raw ? (JSON.parse(raw) as Drawing[]) : [];
  } catch {
    return [];
  }
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
  dec: number,
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
        lineWidth: 1.5,
        lineStyle: lineStyleFromString(d.style),
        axisLabelVisible: true,
        title: d.label ? `${d.label} (${d.price.toFixed(dec)})` : d.price.toFixed(dec),
      });
    } else if (
      d.type === "trendline" &&
      d.p1time != null && d.p2time != null &&
      d.p1price != null && d.p2price != null
    ) {
      const tl = chart.addLineSeries({
        color,
        lineWidth: 2,
        lineStyle: lineStyleFromString(d.style),
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
        priceFormat: {
          type: "price",
          precision: dec,
          minMove: Math.pow(10, -dec),
        },
      });
      tl.setData([
        { time: d.p1time, value: d.p1price },
        { time: d.p2time, value: d.p2price },
      ]);
      if (d.label) {
        tl.setMarkers([
          { time: d.p1time, position: "inBar", color, shape: "circle", text: d.label },
        ]);
      }
      drawingSeriesRef.current.push(tl);
    } else if (d.type === "zone" && d.topPrice != null && d.bottomPrice != null) {
      // Subtle price lines for zones so they don't flood the right price axis tags
      freshSeries.createPriceLine({
        price: d.topPrice, color, lineWidth: 1, lineStyle: 1,
        axisLabelVisible: false, title: `▲ ${d.label ?? "OB"} (${d.topPrice.toFixed(dec)})`,
      });
      freshSeries.createPriceLine({
        price: d.bottomPrice, color, lineWidth: 1, lineStyle: 1,
        axisLabelVisible: false, title: `▼ ${d.label ?? "OB"} (${d.bottomPrice.toFixed(dec)})`,
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

  if (bars.length > 0) {
    try {
      chart.timeScale().fitContent();
    } catch {
      /* ignore */
    }
  }
}

export function LWChart({ bars, drawings = [], height = 480, loading, storageKey, pair, title }: Props) {
  const pairName = pair ?? storageKey ?? "EURUSD";
  const spec = pairSpec(pairName);
  const dec = spec.decimals;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawingSeriesRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drawing tool state
  const [activeTool, setActiveTool] = useState<DrawTool>("cursor");
  const [userDrawings, setUserDrawings] = useState<Drawing[]>(() => loadStoredDrawings(storageKey));
  const [pendingPoint, setPendingPoint] = useState<{ time: number; price: number } | null>(null);

  // storageKey changing (e.g. the pair) means the component didn't unmount —
  // swap in that key's saved drawings instead of the previous one's.
  useEffect(() => {
    setUserDrawings(loadStoredDrawings(storageKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist on every change
  useEffect(() => {
    if (!storageKey) return;
    const key = `gizzyfx:chart-drawings:${storageKey}`;
    try {
      if (userDrawings.length) localStorage.setItem(key, JSON.stringify(userDrawings));
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [userDrawings, storageKey]);

  // Tool label display on double-tap / hover
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

  // Fullscreen toggle handler
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        // Try native fullscreen if available
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

  // Listen for native escape / fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingPointRef.current) {
          setPendingPoint(null);
          setActiveTool("cursor");
        } else if (isFullscreen) {
          setIsFullscreen(false);
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          }
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

  // Fit content helper
  const fitContent = useCallback(() => {
    if (chartRef.current && bars.length) {
      try {
        chartRef.current.timeScale().fitContent();
      } catch {
        /* ignore */
      }
    }
  }, [bars]);

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
    const t = chartTheme();
    const chart = LW.createChart(container, {
      width: container.clientWidth || 600,
      height: isFullscreen ? container.clientHeight || window.innerHeight : (typeof height === "number" ? height : container.clientHeight || 480),
      layout: {
        background: { color: t.bg },
        textColor: t.text,
        fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      localization: {
        priceFormatter: (p: number) => (Number.isFinite(p) ? p.toFixed(dec) : ""),
      },
      grid: {
        vertLines: { color: t.grid, style: 0 },
        horzLines: { color: t.grid, style: 0 },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: t.crosshair, width: 1, style: 2, labelBackgroundColor: t.accent },
        horzLine: { color: t.crosshair, width: 1, style: 2, labelBackgroundColor: t.accent },
      },
      rightPriceScale: {
        borderColor: t.border,
        minimumWidth: 76,
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        alignLabels: true,
      },
      timeScale: {
        borderColor: t.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: 8,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: t.up, downColor: t.down,
      borderDownColor: t.down, borderUpColor: t.up,
      wickDownColor: t.wick, wickUpColor: t.wick,
      priceLineColor: t.accent,
      priceLineStyle: 2,
      priceFormat: {
        type: "price" as any,
        precision: dec,
        minMove: Math.pow(10, -dec),
      },
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
          { type: "hline", price, color: "#3b82f6", style: "solid", label: price.toFixed(dec) },
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
      if (!container || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
      if (bars.length) {
        chartRef.current.timeScale().fitContent();
      }
    });
    ro.observe(container);

    const offTheme = onThemeChange(() => {
      const n = chartTheme();
      chart.applyOptions({
        layout: { background: { color: n.bg }, textColor: n.text },
        grid: { vertLines: { color: n.grid }, horzLines: { color: n.grid } },
        crosshair: {
          vertLine: { color: n.crosshair, labelBackgroundColor: n.accent },
          horzLine: { color: n.crosshair, labelBackgroundColor: n.accent },
        },
        rightPriceScale: { borderColor: n.border },
        timeScale: { borderColor: n.border },
      });
      candleSeriesRef.current?.applyOptions({
        upColor: n.up, downColor: n.down,
        borderUpColor: n.up, borderDownColor: n.down,
        wickUpColor: n.wick, wickDownColor: n.wick,
        priceLineColor: n.accent,
      });
    });

    return () => {
      offTheme();
      ro.disconnect();
      drawingSeriesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dec]);

  // Adjust options when fullscreen toggles
  useEffect(() => {
    if (!chartRef.current || !containerRef.current) return;
    const timer = setTimeout(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        chartRef.current.timeScale().fitContent();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Re-render all drawings (agent + user) when either changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bars.length) return;

    const allDrawings = [...drawings, ...userDrawings];

    // Re-create candle series to reset price lines (v4 limitation)
    const oldSeries = candleSeriesRef.current;
    const ft = chartTheme();
    const freshSeries = chart.addCandlestickSeries({
      upColor: ft.up, downColor: ft.down,
      borderDownColor: ft.down, borderUpColor: ft.up,
      wickDownColor: ft.wick, wickUpColor: ft.wick,
      priceLineColor: ft.accent,
      priceLineStyle: 2,
      priceFormat: {
        type: "price" as any,
        precision: dec,
        minMove: Math.pow(10, -dec),
      },
    });
    if (oldSeries) {
      try { chart.removeSeries(oldSeries); } catch { /* ignore */ }
    }
    candleSeriesRef.current = freshSeries;

    applyDrawings(chart, freshSeries, bars, allDrawings, drawingSeriesRef, dec);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, userDrawings, ready, dec]);

  // Apply candles when bars change (without resetting drawings)
  useEffect(() => {
    const series = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!series || !bars.length) return;
    series.setData(
      bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
    );
    if (chart) {
      try {
        chart.timeScale().fitContent();
      } catch {
        /* ignore */
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, ready]);

  const cursorStyle =
    activeTool === "cursor" ? "default"
    : activeTool === "hline" ? "crosshair"
    : "crosshair";

  const latestBar = bars.length ? bars[bars.length - 1] : null;

  return (
    <div
      ref={wrapperRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-[9999] flex flex-col bg-background/98 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200"
          : "relative w-full rounded-lg overflow-hidden border border-border/40"
      }
      style={{ height: isFullscreen ? "100svh" : height }}
    >
      {/* Top Header bar in Fullscreen mode */}
      {isFullscreen && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-card/80 px-3 py-2 rounded-t-lg backdrop-blur mb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[14px] text-foreground font-mono">
              {spec.label}
            </span>
            {latestBar && (
              <span className={`font-mono text-[13px] font-semibold ${latestBar.close >= latestBar.open ? "text-emerald-400" : "text-red-400"}`}>
                {latestBar.close.toFixed(dec)}
              </span>
            )}
            {title && (
              <span className="hidden sm:inline-block text-[12px] text-muted-foreground border-l border-border/60 pl-2">
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={fitContent}
              title="Reset Zoom / Fit Content"
              className="flex items-center gap-1 h-7 rounded-md border border-border bg-card/80 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              <RotateCcw size={12} /> Fit View
            </button>
            <button
              onClick={toggleFullscreen}
              title="Exit Full Screen (Esc)"
              className="flex items-center gap-1 h-7 rounded-md border border-primary bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              <Minimize2 size={12} /> Exit Full Screen
            </button>
          </div>
        </div>
      )}

      {/* Top-Right Action Controls (when not fullscreen) */}
      {!isFullscreen && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          <button
            title="Reset Zoom / Fit Content"
            onClick={fitContent}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground hover:text-foreground hover:border-foreground/40 shadow-sm transition-colors"
          >
            <RotateCcw size={13} />
          </button>
          <button
            title="Full Screen View"
            onClick={toggleFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground hover:text-foreground hover:border-foreground/40 shadow-sm transition-colors"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      )}

      {/* Drawing toolbar — overlaid top-left */}
      <div className={`absolute ${isFullscreen ? "top-14" : "top-2"} left-2 z-10 flex flex-col gap-1`}>
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
            className={`flex h-7 w-7 items-center justify-center rounded-md border text-[13px] font-bold shadow-sm transition-colors ${
              activeTool === tool
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card/90 text-muted-foreground hover:text-foreground hover:border-foreground/40"
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
            className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/40 bg-card/90 text-red-400 hover:text-red-300 shadow-sm transition-colors"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Pending point indicator */}
      {pendingPoint && (
        <div
          className={`absolute ${isFullscreen ? "top-14" : "top-2"} right-12 z-10 rounded-md px-2.5 py-1 text-[11px] font-mono border border-primary/40 bg-card/95 text-primary shadow-md`}
        >
          Click second point… (Esc to cancel)
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full flex-1 min-h-0"
        style={{
          height: isFullscreen ? "calc(100% - 48px)" : "100%",
          cursor: cursorStyle,
          background: "oklch(var(--gz-bg))",
        }}
        tabIndex={0}
      />

      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center fx-scan"
          style={{ background: "oklch(var(--gz-bg) / 0.75)" }}
        >
          <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>Loading chart…</span>
        </div>
      )}
      {!loading && !bars.length && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "oklch(var(--gz-bg) / 0.65)" }}
        >
          <span className="mono-cap" style={{ color: "oklch(var(--gz-mut))" }}>No data</span>
        </div>
      )}
    </div>
  );
}
