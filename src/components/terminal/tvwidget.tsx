import { useEffect, useRef } from "react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TradingView: any;
  }
}

const TV_INTERVAL: Record<string, string> = {
  "5m": "5", "15m": "15", "30m": "30",
  "1h": "60", "4h": "240", "1d": "D", "1w": "W",
};

// All forex pairs use the FX: prefix on TradingView
function toTVSymbol(pair: string) {
  return `FX:${pair.replace("/", "")}`;
}

let scriptLoaded = false;
let scriptLoading = false;
const onLoadCallbacks: Array<() => void> = [];

function loadTVScript(cb: () => void) {
  if (scriptLoaded) { cb(); return; }
  onLoadCallbacks.push(cb);
  if (scriptLoading) return;
  scriptLoading = true;
  const s = document.createElement("script");
  s.src = "https://s3.tradingview.com/tv.js";
  s.async = true;
  s.onload = () => {
    scriptLoaded = true;
    onLoadCallbacks.forEach((fn) => fn());
    onLoadCallbacks.length = 0;
  };
  document.head.appendChild(s);
}

let widgetSeq = 0;

interface Props {
  pair: string;
  interval: string;
}

export function TradingViewWidget({ pair, interval }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<unknown>(null);
  const idRef = useRef(`tv_${++widgetSeq}`);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const symbol = toTVSymbol(pair);
    const tvInterval = TV_INTERVAL[interval] ?? "60";
    const containerId = idRef.current;

    // Clear previous widget
    container.innerHTML = `<div id="${containerId}" style="width:100%;height:100%"></div>`;
    widgetRef.current = null;

    loadTVScript(() => {
      if (!container.isConnected) return;
      if (!window.TradingView) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol,
        interval: tvInterval,
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0d0d0d",
        enable_publishing: false,
        allow_symbol_change: false,
        hide_side_toolbar: false,
        studies: [],
        container_id: containerId,
      });
    });

    return () => {
      container.innerHTML = "";
      widgetRef.current = null;
    };
  }, [pair, interval]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
      className="bg-[#0d0d0d]"
    />
  );
}
