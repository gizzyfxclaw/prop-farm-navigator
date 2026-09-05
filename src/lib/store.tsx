import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Direction, ExnessAccountType, PropAccount } from "./engine/calc";
import type { PairSymbol } from "./engine/pairs";
import {
  loadJournal,
  loadSettings,
  upsertTrade,
  deleteTradeServer,
  clearJournalServer,
  saveAccounts,
  saveEngine,
  saveMeta,
} from "./db.functions";

/**
 * Persistence layer.
 *
 * localStorage provides instant, offline-capable reads/writes.
 * Cloudflare D1 (journal) and KV (settings) back up all data server-side
 * so it persists across devices and browser clears.
 *
 * On mount: load from server, merge with localStorage (server wins on conflict).
 * On mutations: write to localStorage immediately, fire server write in background.
 */

export interface JournalTrade {
  id: string;
  date: string;
  time: string;
  pair: string;
  dir: Direction;
  result: "OPEN" | "WIN" | "LOSS";
  propPnl: number;
  exPnl: number;
  netPnl: number;
  ticket?: string;
  note?: string;
  details?: {
    entry: number;
    propSl: number;
    propTp: number;
    exSl: number;
    exTp: number;
    propLots: number;
    exLots: number;
    rr: number;
    phase: 1 | 2;
    /** Which side of the hedge this order was placed on. */
    leg?: "exness" | "prop";
    /** Base exnessWinTarget at the time this trade was logged (NOT martingale-bumped).
     *  Used by recovery.ts to compute correct slippage even after a phase change. */
    baseExnessWinTarget?: number;
    /** Prop risk per trade that was active when this trade was logged. */
    propRiskAtLog?: number;
  } | null;
}

export interface MetaApiSettings {
  token: string;
  exnessAccountId: string;
  propAccountId: string;
  exnessSymbolSuffix: string;
  /** Explicit client API base URL — set this to https://mt-client-api-v1.{region}.agiliumtrade.ai */
  clientApiUrl: string;
}

export type PendingOrderType = "BUY_LIMIT" | "BUY_STOP" | "SELL_LIMIT" | "SELL_STOP";

export function mirrorPendingOrder(order: PendingOrderType): PendingOrderType {
  const mirror: Record<PendingOrderType, PendingOrderType> = {
    BUY_LIMIT:  "SELL_STOP",
    BUY_STOP:   "SELL_LIMIT",
    SELL_LIMIT: "BUY_STOP",
    SELL_STOP:  "BUY_LIMIT",
  };
  return mirror[order];
}

export interface EngineSettings {
  selectedAccountId: string;
  phase: 1 | 2;
  propRiskUsd: number;
  rr: number;
  slPips: number;
  desiredProfit: number;
  bufferPct: number;
  pair: PairSymbol;
  direction: Direction;
  pendingOrderType: PendingOrderType;
  entryPrice: number;
  exnessAccountType: ExnessAccountType;
  /** Actual Exness account balance (user-entered or synced from MetaApi) */
  actualExnessBalance: number;
  carryPhase1TotalSpent: number | null;
  carryPhase1Leftover: number | null;
}

const KEYS = {
  accounts: "gizzyfx.accounts",
  journal: "gizzyfx.journal",
  meta: "gizzyfx.metaapi",
  engine: "gizzyfx.engine",
  /** Bump this when preset account specs change — forces preset refresh. */
  presetsVersion: "gizzyfx.presetsVersion",
} as const;

/** Current preset schema version — increment when PRESET_LADDER changes. */
const PRESETS_VERSION = "3";  // v1=9%/fee44, v2=6%/fee28.60, v3=force risk rescale

interface StorageAdapter {
  read<T>(key: string, fallback: T): T;
  write<T>(key: string, value: T): void;
}

export const browserStorage: StorageAdapter = {
  read<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write<T>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / private mode */
    }
  },
};

export const storage: StorageAdapter = browserStorage;

interface Preset {
  size: number;
  fee: number;
  targetPct: number;
  ddPct: number;
  dailyProfitCap?: number;
}

const PRESET_LADDER: Preset[] = [
  // E8 Markets One — Forex (2026 specs, 6% target / 6% DD / 80% payout)
  // User's verified setup: $5k = $300 target, $300 max DD, $28.60 fee
  // Daily profit cap enforces the E8 $100/day rule on the $5k account
  { size: 5000,   fee: 28.60, targetPct: 6, ddPct: 6, dailyProfitCap: 100 },
  { size: 10000,  fee: 55.00, targetPct: 6, ddPct: 6, dailyProfitCap: 200 },
  { size: 25000,  fee: 130.00, targetPct: 6, ddPct: 6, dailyProfitCap: 500 },
  { size: 50000,  fee: 245.00, targetPct: 6, ddPct: 6, dailyProfitCap: 1000 },
  { size: 100000, fee: 450.00, targetPct: 6, ddPct: 6, dailyProfitCap: 2000 },
  { size: 200000, fee: 720.00, targetPct: 6, ddPct: 6, dailyProfitCap: 4000 },
];

export const defaultAccounts = (): PropAccount[] =>
  PRESET_LADDER.map((p) => {
    const acc: PropAccount = {
      id: `preset-${p.size}`,
      firm: `E8 One $${(p.size / 1000).toFixed(0)}k`,
      size: p.size,
      fee: p.fee,
      targetPct: p.targetPct,
      ddPct: p.ddPct,
      ddType: "Static" as const,
      splitPct: 80,
    };
    if (p.dailyProfitCap != null) acc.dailyProfitCap = p.dailyProfitCap;
    return acc;
  });

const defaultEngine = (accountId: string): EngineSettings => ({
  selectedAccountId: accountId,
  phase: 1,
  propRiskUsd: 50,
  rr: 2,
  slPips: 30,
  desiredProfit: 0,
  bufferPct: 20,
  pair: "EURUSD",
  direction: "LONG",
  pendingOrderType: "BUY_STOP",
  entryPrice: 1.085,
  exnessAccountType: "Cent",
  actualExnessBalance: 0,
  carryPhase1TotalSpent: null,
  carryPhase1Leftover: null,
});

const defaultMeta = (): MetaApiSettings => ({
  token: "",
  exnessAccountId: "",
  propAccountId: "",
  exnessSymbolSuffix: "",
  clientApiUrl: "https://mt-client-api-v1.london.agiliumtrade.ai",
});

interface StoreValue {
  hydrated: boolean;
  accounts: PropAccount[];
  saveAccount: (account: PropAccount) => void;
  deleteAccount: (id: string) => void;
  engine: EngineSettings;
  setEngine: (patch: Partial<EngineSettings>) => void;
  meta: MetaApiSettings;
  setMeta: (patch: Partial<MetaApiSettings>) => void;
  journal: JournalTrade[];
  addTrade: (trade: JournalTrade) => void;
  updateTrade: (id: string, patch: Partial<JournalTrade>) => void;
  deleteTrade: (id: string) => void;
  clearJournal: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [accounts, setAccounts] = useState<PropAccount[]>(() => defaultAccounts());
  const [engine, setEngineState] = useState<EngineSettings>(() => defaultEngine("preset-5000"));
  const [meta, setMetaState] = useState<MetaApiSettings>(defaultMeta);
  const [journal, setJournal] = useState<JournalTrade[]>([]);

  useEffect(() => {
    // Step 1: hydrate from localStorage immediately for instant UI.
    const storedAccounts = storage.read<PropAccount[]>(KEYS.accounts, defaultAccounts());
    const storedPresetsVersion = storage.read<string>(KEYS.presetsVersion, "1");

    // ── Preset migration ──────────────────────────────────────────────────
    // When PRESET_LADDER changes (new fees, new percentages), old cached
    // preset accounts in localStorage will have stale numbers.
    // Strategy: replace stale presets with fresh ones, keep custom accounts.
    let localAccounts: PropAccount[];
    if (storedPresetsVersion !== PRESETS_VERSION) {
      // Refresh presets — keep any non-preset (custom) accounts the user added.
      const fresh = defaultAccounts();
      const freshIds = new Set(fresh.map((a) => a.id));
      const customAccounts = storedAccounts.filter((a) => !freshIds.has(a.id));
      localAccounts = [...fresh, ...customAccounts];
      storage.write(KEYS.accounts, localAccounts);
      storage.write(KEYS.presetsVersion, PRESETS_VERSION);
      // Also reset propRiskUsd to the correct default for the selected account
      // so the engine doesn't start with a stale risk value.
      const storedEngine = storage.read<Partial<EngineSettings>>(KEYS.engine, {});
      const selectedId = storedEngine.selectedAccountId ?? localAccounts[0]?.id ?? "preset-5000";
      const selectedAcct = localAccounts.find((a) => a.id === selectedId) ?? localAccounts[0];
      if (selectedAcct) {
        const baseSize = 5000;
        const baseRisk = 50;
        const scaledRisk = Math.round((baseRisk * selectedAcct.size / baseSize) * 100) / 100;
        // ALWAYS rescale risk during migration — stale $50 risk on a $50k
        // account is the core bug. The user can adjust after migration.
        storedEngine.propRiskUsd = scaledRisk;
        storage.write(KEYS.engine, { ...defaultEngine(selectedId), ...storedEngine });
      }
    } else {
      localAccounts = storedAccounts.length ? storedAccounts : defaultAccounts();
    }
    setAccounts(localAccounts);
    setEngineState({ ...defaultEngine(localAccounts[0]?.id ?? "preset-5000"), ...storage.read<Partial<EngineSettings>>(KEYS.engine, {}) });
    setMetaState({ ...defaultMeta(), ...storage.read<Partial<MetaApiSettings>>(KEYS.meta, {}) });
    setJournal(storage.read<JournalTrade[]>(KEYS.journal, []));
    setHydrated(true);

    // Step 2: fetch from server (D1 + KV) and replace if data exists there.
    Promise.all([loadJournal(), loadSettings()]).then(([serverJournal, serverSettings]) => {
      if (serverJournal.length > 0) {
        setJournal(serverJournal);
        storage.write(KEYS.journal, serverJournal);
      }
      if (serverSettings.accounts && serverSettings.accounts.length > 0) {
        // Migrate stale presets from server-stored accounts too.
        const fresh = defaultAccounts();
        const freshIds = new Set(fresh.map((a) => a.id));
        const customFromServer = serverSettings.accounts.filter((a: PropAccount) => !freshIds.has(a.id));
        const mergedAccounts: PropAccount[] = [...fresh, ...customFromServer];
        setAccounts(mergedAccounts);
        storage.write(KEYS.accounts, mergedAccounts);
      }
      if (serverSettings.engine) {
        setEngineState((prev) => {
          const next = { ...prev, ...serverSettings.engine };
          storage.write(KEYS.engine, next);
          return next;
        });
      }
      if (serverSettings.meta) {
        setMetaState((prev) => {
          const next = { ...prev, ...serverSettings.meta };
          storage.write(KEYS.meta, next);
          return next;
        });
      }
    }).catch(() => {
      // Server load failed — keep local data, no action needed.
    });
  }, []);

  const persistAccounts = useCallback((next: PropAccount[]) => {
    setAccounts(next);
    storage.write(KEYS.accounts, next);
    saveAccounts({ data: { accounts: JSON.stringify(next) } }).catch(() => {});
  }, []);

  const persistJournal = useCallback((next: JournalTrade[]) => {
    setJournal(next);
    storage.write(KEYS.journal, next);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      hydrated,
      accounts,
      saveAccount: (account) => {
        const exists = accounts.some((a) => a.id === account.id);
        persistAccounts(exists ? accounts.map((a) => (a.id === account.id ? account : a)) : [...accounts, account]);
      },
      deleteAccount: (id) => persistAccounts(accounts.filter((a) => a.id !== id)),
      engine,
      setEngine: (patch) => {
        setEngineState((prev) => {
          const next = { ...prev, ...patch };
          storage.write(KEYS.engine, next);
          saveEngine({ data: { engine: JSON.stringify(next) } }).catch(() => {});
          return next;
        });
      },
      meta,
      setMeta: (patch) => {
        setMetaState((prev) => {
          const next = { ...prev, ...patch };
          storage.write(KEYS.meta, next);
          saveMeta({ data: { meta: JSON.stringify(next) } }).catch(() => {});
          return next;
        });
      },
      journal,
      addTrade: (trade) => {
        persistJournal([...journal, trade]);
        upsertTrade({ data: trade }).catch(() => {});
      },
      updateTrade: (id, patch) => {
        const next = journal.map((t) => (t.id === id ? { ...t, ...patch } : t));
        persistJournal(next);
        const updated = next.find((t) => t.id === id);
        if (updated) upsertTrade({ data: updated }).catch(() => {});
      },
      deleteTrade: (id) => {
        persistJournal(journal.filter((t) => t.id !== id));
        deleteTradeServer({ data: { id } }).catch(() => {});
      },
      clearJournal: () => {
        persistJournal([]);
        clearJournalServer().catch(() => {});
      },
    }),
    [hydrated, accounts, engine, meta, journal, persistAccounts, persistJournal],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function useSelectedAccount(): PropAccount {
  const { accounts, engine } = useStore();
  return accounts.find((a) => a.id === engine.selectedAccountId) ?? accounts[0] ?? {
    id: "fallback",
    firm: "No account",
    size: 0,
    fee: 0,
    targetPct: 0,
    ddPct: 0,
    ddType: "Static",
    splitPct: 80,
  };
}
