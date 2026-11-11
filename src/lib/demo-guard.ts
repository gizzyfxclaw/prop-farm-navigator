/**
 * Demo-account guard — the pure decision behind assertDemoAccount.
 *
 * Kept in its own module so it can be unit-tested without importing the
 * TanStack Start server functions in metaapi.functions.ts.
 *
 * Rule: ONLY exactly "demo" (case-insensitive) passes. Anything else —
 * "real", "live", missing, unknown — is blocked (fail-safe: an absent
 * accountType field is assumed real).
 */

/** True only when MetaApi reports the account type as exactly "demo". */
export function isDemoAccountType(accountType: string | undefined | null): boolean {
  return (accountType ?? "").toLowerCase() === "demo";
}

/** The error thrown when a non-demo account is blocked. */
export function demoGuardError(accountType: string | undefined | null): Error {
  return new Error(
    `Safety block: only demo accounts are permitted. This account reports type="${accountType ?? "unknown"}". ` +
      `Disconnect and connect a MetaApi demo account to proceed.`,
  );
}

/** Throw unless the account is a demo account. */
export function assertDemoAccountType(accountType: string | undefined | null): void {
  if (!isDemoAccountType(accountType)) throw demoGuardError(accountType);
}
