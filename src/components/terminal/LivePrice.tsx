import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { fetchQuote } from "@/lib/metaapi.functions";
import { LiveDot, Skeleton, TickValue } from "./anim";

/** Feed is stale once the last successful poll is older than this. */
const STALE_AFTER_MS = 15_000;

export function LivePrice() {
  const { engine, meta } = useStore();
  const [price, setPrice] = useState<number | null>(null);
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const symbol = engine.pair + meta.exnessSymbolSuffix;
  const configured = Boolean(meta.token && meta.exnessAccountId);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    const fetchPrice = async () => {
      setLoading(true);
      const res = await fetchQuote({ data: { token: meta.token, accountId: meta.exnessAccountId, symbol } });
      if (cancelled) return;
      setLoading(false);
      setUpdatedAt(Date.now());
      if (res.ok) {
        setPrice(res.data.mid);
        setBid(res.data.bid);
        setAsk(res.data.ask);
        setError(null);
      } else {
        setError(res.error);
      }
    };

    fetchPrice();
    const id = setInterval(fetchPrice, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [configured, meta.token, meta.exnessAccountId, symbol]);

  const dec = engine.pair === "USDJPY" ? 3 : 5;

  if (!configured) {
    return (
      <div className="flex items-center gap-2" title="Add MetaApi credentials in Settings for live price">
        <span className="mono-cap c-mut">{engine.pair}</span>
        <span className="font-mono c-mut" style={{ fontSize: 12, fontWeight: 600 }}>
          —
        </span>
        <LiveDot state="dead" title="No credentials — feed offline" />
      </div>
    );
  }

  const age = updatedAt === null ? null : Date.now() - updatedAt;
  const feedState: "live" | "stale" | "dead" =
    error !== null ? "dead" : age === null || age > STALE_AFTER_MS ? "stale" : "live";
  const feedTitle =
    error !== null
      ? `Feed error: ${error}`
      : age === null
        ? "Waiting for first quote"
        : `Last update ${Math.floor(age / 1000)}s ago`;

  return (
    <div className="flex items-center gap-2.5" title={`Live ${engine.pair} from MetaApi`}>
      <span className="mono-cap" style={{ color: "oklch(var(--gz-h))" }}>
        {engine.pair}
      </span>

      <span
        className="font-mono"
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.01em",
          color: error !== null ? "oklch(var(--gz-neg))" : "oklch(var(--gz-txt))",
        }}
      >
        {loading && price === null ? (
          <Skeleton w={64} h={12} />
        ) : (
          <TickValue value={price} format={(v) => v.toFixed(dec)} showArrow />
        )}
      </span>

      {bid !== null && ask !== null && (
        <span
          className="font-mono c-mut hidden lg:inline"
          style={{ fontSize: 9.5, fontVariantNumeric: "tabular-nums slashed-zero" }}
          title="Bid / Ask"
        >
          {bid.toFixed(dec)} / {ask.toFixed(dec)}
        </span>
      )}

      <LiveDot state={feedState} title={feedTitle} />
    </div>
  );
}
