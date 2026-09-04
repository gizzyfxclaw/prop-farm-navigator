import { useEffect, useState } from "react";
import { PAIRS, PAIR_SPECS, type PairSymbol } from "@/lib/engine/pairs";
import { TickValue } from "./anim";

/* ══════════════════════════════════════════════════════════════════════════
   MARKET TAPE — scrolling quote strip
   ──────────────────────────────────────────────────────────────────────────
   REAL DATA ONLY. Every figure comes from GET /api/ohlcv, which is backed by
   tvremix (TradingView) with a Yahoo Finance fallback — the same feed the
   charts and the agent's analysis use. There is no simulated price path here:
   if the fetch fails the tape shows the pair with an em-dash and a dead dot.
   ══════════════════════════════════════════════════════════════════════════ */

interface TapeRow {
  pair: PairSymbol;
  last: number | null;
  changePct: number | null;
  /** Day range from the real session bars. */
  low: number | null;
  high: number | null;
  ok: boolean;
}

const POLL_MS = 60_000;

async function loadPair(pair: PairSymbol): Promise<TapeRow> {
  const empty: TapeRow = { pair, last: null, changePct: null, low: null, high: null, ok: false };
  try {
    const res = await fetch(`/api/ohlcv?pair=${pair}&interval=1h&limit=26`);
    if (!res.ok) return empty;
    const json = (await res.json()) as { bars?: Array<{ high: number; low: number; close: number }> };
    const bars = json.bars ?? [];
    if (bars.length < 2) return empty;

    const last = bars[bars.length - 1]!.close;
    // 24 hourly bars back = a true 24h change, not an invented baseline.
    const refIdx = Math.max(0, bars.length - 25);
    const ref = bars[refIdx]!.close;
    const changePct = ref > 0 ? ((last - ref) / ref) * 100 : null;

    const window = bars.slice(refIdx);
    const low = Math.min(...window.map((b) => b.low));
    const high = Math.max(...window.map((b) => b.high));

    return { pair, last, changePct, low, high, ok: true };
  } catch {
    return empty;
  }
}

export function MarketTape() {
  const [rows, setRows] = useState<TapeRow[]>(
    PAIRS.map((p) => ({ pair: p, last: null, changePct: null, low: null, high: null, ok: false })),
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next = await Promise.all(PAIRS.map(loadPair));
      if (!cancelled) setRows(next);
    };
    void run();
    const id = window.setInterval(() => void run(), POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Duplicated once so the -50% marquee translate loops seamlessly.
  const track = [...rows, ...rows];

  return (
    <div className="fx-tape" role="marquee" aria-label="Live market quotes">
      <div className="fx-tape-track" style={{ ["--fx-tape-dur" as string]: "52s" }}>
        {track.map((r, i) => {
          const dec = PAIR_SPECS[r.pair].decimals;
          const up = (r.changePct ?? 0) >= 0;
          const chgColor = r.changePct == null
            ? "oklch(var(--gz-mut))"
            : up ? "oklch(var(--gz-pos))" : "oklch(var(--gz-neg))";
          return (
            <span className="tape-item" key={`${r.pair}-${i}`}>
              <span
                className="fx-live-dot"
                style={{
                  color: r.ok ? "oklch(var(--gz-pos))" : "oklch(var(--gz-mut))",
                  width: 5, height: 5,
                  ...(r.ok ? {} : { boxShadow: "none", opacity: 0.4 }),
                }}
                aria-hidden
              />
              <span className="tape-sym">{PAIR_SPECS[r.pair].label}</span>
              <span className="tape-px">
                <TickValue value={r.last} format={(v) => v.toFixed(dec)} showArrow={false} />
              </span>
              <span className="tape-chg" style={{ color: chgColor }}>
                {r.changePct == null ? "—" : `${up ? "+" : ""}${r.changePct.toFixed(2)}%`}
              </span>
              {r.low != null && r.high != null && (
                <span style={{ color: "oklch(var(--gz-mut) / 0.8)", fontSize: "0.88em" }}>
                  {r.low.toFixed(dec)}–{r.high.toFixed(dec)}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
