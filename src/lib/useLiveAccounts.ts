import { useCallback, useEffect, useState } from "react";
import { fetchAccountInformation, type AccountSnapshot } from "./metaapi.functions";
import { useSelectedAccount, useStore } from "./store";

export interface LiveAccountState {
  snapshot: AccountSnapshot | null;
  error: string | null;
  accountId: string;
}

export interface LiveAccounts {
  exness: LiveAccountState;
  prop: LiveAccountState;
  loading: boolean;
  configured: boolean;
  refresh: () => Promise<void>;
  updatedAt: number | null;
}

const empty = (accountId: string): LiveAccountState => ({ snapshot: null, error: null, accountId });

/**
 * Polls MetaApi Cloud for the Exness fuel account and (when linked) the selected
 * prop account, so every balance shown in the terminal is derived from live MT5 data.
 */
export function useLiveAccounts(pollMs = 20_000): LiveAccounts {
  const { meta } = useStore();
  const account = useSelectedAccount();
  const propId = account.metaApiAccountId || meta.propAccountId || "";

  const [exness, setExness] = useState<LiveAccountState>(() => empty(meta.exnessAccountId));
  const [prop, setProp] = useState<LiveAccountState>(() => empty(propId));
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const token = meta.token;
  const exnessId = meta.exnessAccountId;
  const configured = Boolean(token && exnessId);

  const refresh = useCallback(async () => {
    if (!token || !exnessId) {
      setExness(empty(exnessId));
      setProp(empty(propId));
      return;
    }
    setLoading(true);
    const [ex, pr] = await Promise.all([
      fetchAccountInformation({ data: { token, accountId: exnessId } }),
      propId
        ? fetchAccountInformation({ data: { token, accountId: propId } })
        : Promise.resolve(null),
    ]);
    setLoading(false);
    setUpdatedAt(Date.now());
    setExness({
      accountId: exnessId,
      snapshot: ex.ok ? ex.data : null,
      error: ex.ok ? null : ex.error,
    });
    if (!pr) {
      setProp(empty(propId));
    } else {
      setProp({
        accountId: propId,
        snapshot: pr.ok ? pr.data : null,
        error: pr.ok ? null : pr.error,
      });
    }
  }, [token, exnessId, propId]);

  useEffect(() => {
    void refresh();
    if (!token || !exnessId || pollMs <= 0) return;
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [refresh, token, exnessId, pollMs]);

  return { exness, prop, loading, configured, refresh, updatedAt };
}
