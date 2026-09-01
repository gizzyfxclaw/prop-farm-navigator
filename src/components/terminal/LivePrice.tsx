import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { fetchQuote } from "@/lib/metaapi.functions";

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
        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "oklch(var(--gz-mut))" }}>
          {engine.pair}
        </span>
        <span className="font-mono text-[12px] font-semibold" style={{ color: "oklch(var(--gz-mut))" }}>
          —
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3" title={`Live ${engine.pair} from MetaApi`}>
      <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "oklch(var(--gz-mut))" }}>
        {engine.pair}
      </span>
      <span
        className="font-mono text-[12px] font-semibold"
        style={{ color: error ? "oklch(0.637 0.208 25.3)" : "oklch(var(--gz-txt))" }}
      >
        {loading && price === null ? "…" : price !== null ? price.toFixed(dec) : "—"}
      </span>
      {bid !== null && ask !== null && (
        <span className="font-mono text-[9px]" style={{ color: "oklch(var(--gz-mut))" }}>
          {bid.toFixed(dec)} / {ask.toFixed(dec)}
        </span>
      )}
      {updatedAt !== null && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: error ? "oklch(0.637 0.208 25.3)" : "oklch(0.720 0.190 148)",
            boxShadow: error ? "none" : "0 0 4px oklch(0.720 0.190 148)",
            animation: "gz-pulse 2s ease-in-out infinite",
          }}
          title={error ? `Error: ${error}` : `Live — updated ${Math.floor((Date.now() - updatedAt) / 1000)}s ago`}
        />
      )}
    </div>
  );
}
