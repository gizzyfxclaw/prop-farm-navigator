export type PairSymbol = "EURUSD" | "GBPUSD" | "USDJPY";

export const PAIRS: PairSymbol[] = ["EURUSD", "GBPUSD", "USDJPY"];

export interface PairSpec {
  symbol: PairSymbol;
  label: string;
  /** USD value of 1 pip per 1.00 standard lot */
  pipValue: number;
  pipSize: number;
  decimals: number;
}

export const PAIR_SPECS: Record<PairSymbol, PairSpec> = {
  EURUSD: { symbol: "EURUSD", label: "EUR/USD", pipValue: 10, pipSize: 0.0001, decimals: 5 },
  GBPUSD: { symbol: "GBPUSD", label: "GBP/USD", pipValue: 10, pipSize: 0.0001, decimals: 5 },
  USDJPY: { symbol: "USDJPY", label: "USD/JPY", pipValue: 9, pipSize: 0.01, decimals: 3 },
};

export function pairSpec(symbol: string): PairSpec {
  const key = symbol.replace(/[^A-Za-z]/g, "").toUpperCase();
  const normalized = (["EURUSD", "GBPUSD", "USDJPY"] as const).find((p) => key.startsWith(p));
  return PAIR_SPECS[(normalized ?? "EURUSD") as PairSymbol];
}

export function roundPrice(price: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(price * f) / f;
}

export function formatPrice(price: number, decimals: number): string {
  return Number.isFinite(price) ? price.toFixed(decimals) : (0).toFixed(decimals);
}
