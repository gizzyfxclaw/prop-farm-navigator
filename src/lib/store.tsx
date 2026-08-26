import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Direction, ExnessAccountType, PropAccount } from "./engine/calc";
import type { PairSymbol } from "./engine/pairs";

/**
 * Local persistence layer.
 *
 * All reads/writes funnel through `journalStorage` / `keyValueStorage`, so swapping
 * the browser adapter for a Cloudflare-backed adapter later is a single change here.
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
  } | null;
}

export interface MetaApiSettings {
  token: string;
  exnessAccountId: string;
  propAccountId: string;
  exnessSymbolSuffix: string;
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
  entryPrice: number;
  exnessAccountType: ExnessAccountType;
  carryPhase1TotalSpent: number | null;
  carryPhase1Leftover: number | null;
}

const KEYS = {
  accounts: "gizzyfx.accounts",
  journal: "gizzyfx.journal",
  meta: "gizzyfx.metaapi",
  engine: "gizzyfx.engine",
  unlocked: "gizzyfx.unlocked",
} as const;

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

/** Swap this to a Cloudflare-backed adapter to sync across devices. */
export const storage: StorageAdapter = browserStorage;

const PRESET_LADDER: { size: number; fee: number; targetPct: number; ddPct: number }[] = [
  { size: 50, fee: 4.99, targetPct: 10, ddPct: 5 },
  { size: 100, fee: 9.99, targetPct: 10, ddPct: 5 },
  { size: 200, fee: 19.99, targetPct: 10, ddPct: 5 },
  { size: 500, fee: 34.99, targetPct: 10, ddPct: 5 },
  { size: 1000, fee: 59, targetPct: 10, ddPct: 5 },
  { size: 2500, fee: 135, targetPct: 10, ddPct: 5 },
  { size: 5000, fee: 28.6, targetPct: 6, ddPct: 6 },
  { size: 10000, fee: 28.6, targetPct: 6, ddPct: 6 },
  { size: 25000, fee: 28.6, targetPct: 6, ddPct: 6 },
  { size: 50000, fee: 28.6, targetPct: 6, ddPct: 6 },
  { size: 100000, fee: 28.6, targetPct: 6, ddPct: 6 },
  { size: 200000, fee: 28.6, targetPct: 6, ddPct: 6 },
];

export const defaultAccounts = (): PropAccount[] =>
  PRESET_LADDER.map((p) => ({
    id: `preset-${p.size}`,
    firm: `Prop $${p.size.toLocaleString()}`,
    size: p.size,
    fee: p.fee,
    targetPct: p.targetPct,
    ddPct: p.ddPct,
    ddType: "Static" as const,
    splitPct: 80,
  }));

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
  entryPrice: 1.085,
  exnessAccountType: "Cent",
  carryPhase1TotalSpent: null,
  carryPhase1Leftover: null,
});

const defaultMeta = (): MetaApiSettings => ({
  token: "",
  exnessAccountId: "",
  propAccountId: "",
  exnessSymbolSuffix: "",
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
    const storedAccounts = storage.read<PropAccount[]>(KEYS.accounts, defaultAccounts());
    const list = storedAccounts.length ? storedAccounts : defaultAccounts();
    setAccounts(list);
    setEngineState({ ...defaultEngine(list[0]?.id ?? "preset-5000"), ...storage.read<Partial<EngineSettings>>(KEYS.engine, {}) });
    setMetaState({ ...defaultMeta(), ...storage.read<Partial<MetaApiSettings>>(KEYS.meta, {}) });
    setJournal(storage.read<JournalTrade[]>(KEYS.journal, []));
    setHydrated(true);
  }, []);

  const persistAccounts = useCallback((next: PropAccount[]) => {
    setAccounts(next);
    storage.write(KEYS.accounts, next);
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
          return next;
        });
      },
      meta,
      setMeta: (patch) => {
        setMetaState((prev) => {
          const next = { ...prev, ...patch };
          storage.write(KEYS.meta, next);
          return next;
        });
      },
      journal,
      addTrade: (trade) => persistJournal([...journal, trade]),
      updateTrade: (id, patch) => persistJournal(journal.map((t) => (t.id === id ? { ...t, ...patch } : t))),
      deleteTrade: (id) => persistJournal(journal.filter((t) => t.id !== id)),
      clearJournal: () => persistJournal([]),
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
