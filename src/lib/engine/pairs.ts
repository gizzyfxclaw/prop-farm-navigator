export type PairSymbol = "EURUSD" | "GBPUSD" | "USDJPY";

export const PAIRS: PairSymbol[] = ["EURUSD", "GBPUSD", "USDJPY"];

export interface PairSpec {
  symbol: PairSymbol;
  label: string;
  /**
   * USD value of 1 pip per 1.00 standard lot, AT A REFERENCE RATE — exact
   * and rate-independent when USD is the quote currency (EURUSD, GBPUSD:
   * pipSize × 100,000 units never changes), but only a rough approximation
   * for pairs where USD is the base currency (USDJPY), where the true pip
   * value moves with the exchange rate. Use `livePipValue` for sizing math;
   * this field is only a reasonable fallback/display default before a live
   * rate is available.
   */
  pipValue: number;
  pipSize: number;
  decimals: number;
  /** True when USD is the quote currency (EURUSD, GBPUSD) — pipValue is then
   *  exact and doesn't depend on the live rate. False means USD is the base
   *  currency (USDJPY) and livePipValue must be used for accurate sizing. */
  quoteCurrencyIsUsd: boolean;
}

export const PAIR_SPECS: Record<PairSymbol, PairSpec> = {
  EURUSD: { symbol: "EURUSD", label: "EUR/USD", pipValue: 10, pipSize: 0.0001, decimals: 5, quoteCurrencyIsUsd: true },
  GBPUSD: { symbol: "GBPUSD", label: "GBP/USD", pipValue: 10, pipSize: 0.0001, decimals: 5, quoteCurrencyIsUsd: true },
  USDJPY: { symbol: "USDJPY", label: "USD/JPY", pipValue: 9, pipSize: 0.01, decimals: 3, quoteCurrencyIsUsd: false },
};

export function pairSpec(symbol: string): PairSpec {
  const key = symbol.replace(/[^A-Za-z]/g, "").toUpperCase();
  const normalized = (["EURUSD", "GBPUSD", "USDJPY"] as const).find((p) => key.startsWith(p));
  return PAIR_SPECS[(normalized ?? "EURUSD") as PairSymbol];
}

/**
 * The pip value actually used for lot sizing. Exact for USD-quote pairs
 * regardless of rate; for USD-base pairs (USDJPY) it's derived from the
 * live entry price instead of the static `pipValue` approximation, since
 * that constant drifts as the real rate moves away from whatever level it
 * was set at (e.g. $9 assumes ~111, but at 150 the real value is ~$6.67 —
 * a ~25% sizing error if left static).
 */
export function livePipValue(symbol: string, rate: number): number {
  const spec = pairSpec(symbol);
  if (spec.quoteCurrencyIsUsd) return spec.pipValue;
  if (!Number.isFinite(rate) || rate <= 0) return spec.pipValue; // no live rate yet — fall back
  const STANDARD_LOT_UNITS = 100_000;
  return (spec.pipSize * STANDARD_LOT_UNITS) / rate;
}

export function roundPrice(price: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(price * f) / f;
}

export function formatPrice(price: number, decimals: number): string {
  return Number.isFinite(price) ? price.toFixed(decimals) : (0).toFixed(decimals);
}
