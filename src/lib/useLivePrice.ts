import { useCallback, useEffect, useState } from "react";
import { fetchQuote } from "./metaapi.functions";
import { useStore } from "./store";

export interface LivePrice {
  price: number | null;
  bid: number | null;
  ask: number | null;
  error: string | null;
  loading: boolean;
  configured: boolean;
  refresh: () => Promise<void>;
  updatedAt: number | null;
}

/**
 * Polls MetaApi Cloud for the live quote of `symbol`, so the entry price
 * tracks the market without the user needing to click Fetch. Shorter
 * interval than useLiveAccounts's 20s — entry price is the one number that
 * actually needs to move tick-to-tick for sizing to stay accurate.
 */
export function useLivePrice(symbol: string, pollMs = 5_000): LivePrice {
  const { meta } = useStore();
  const token = meta.token;
  const accountId = meta.exnessAccountId;
  const configured = Boolean(token && accountId && symbol);

  const [price, setPrice] = useState<number | null>(null);
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !accountId || !symbol) return;
    setLoading(true);
    const res = await fetchQuote({ data: { token, accountId, symbol } });
    setLoading(false);
    setUpdatedAt(Date.now());
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setPrice(res.data.mid);
    setBid(res.data.bid);
    setAsk(res.data.ask);
  }, [token, accountId, symbol]);

  useEffect(() => {
    if (!token || !accountId || !symbol) {
      setPrice(null);
      setBid(null);
      setAsk(null);
      setError(null);
      return undefined;
    }
    void refresh();
    if (pollMs <= 0) return undefined;
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [refresh, token, accountId, symbol, pollMs]);

  return { price, bid, ask, error, loading, configured, refresh, updatedAt };
}
