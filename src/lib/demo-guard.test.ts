import { describe, expect, it, vi, afterEach } from "vitest";
import { assertDemoAccountType, demoGuardError, isDemoAccountType } from "./demo-guard";

describe("demo guard — pure decision (audit §5.2)", () => {
  it("passes exactly 'demo', case-insensitive", () => {
    expect(isDemoAccountType("demo")).toBe(true);
    expect(isDemoAccountType("Demo")).toBe(true);
    expect(isDemoAccountType("DEMO")).toBe(true);
    expect(() => assertDemoAccountType("Demo")).not.toThrow();
  });

  it("blocks 'real' and 'live'", () => {
    expect(isDemoAccountType("real")).toBe(false);
    expect(isDemoAccountType("live")).toBe(false);
    expect(() => assertDemoAccountType("real")).toThrow(/only demo accounts are permitted/);
    expect(() => assertDemoAccountType("live")).toThrow(/only demo accounts are permitted/);
  });

  it("blocks missing / unknown accountType (fail-safe: assumed real)", () => {
    expect(isDemoAccountType(undefined)).toBe(false);
    expect(isDemoAccountType(null)).toBe(false);
    expect(isDemoAccountType("")).toBe(false);
    expect(() => assertDemoAccountType(undefined)).toThrow(/type="unknown"/);
  });

  it("error message names the reported type", () => {
    expect(demoGuardError("real").message).toMatch(/type="real"/);
  });
});

describe("assertDemoAccount — mocked provisioning fetch (audit §5.2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The real assertDemoAccount fetches fresh MetaApi provisioning metadata.
  // Here the fetch is stubbed so no network and no credentials are needed.
  // A LIVE rejection test against real MetaApi still needs demo credentials
  // and is NOT covered by this test — see engine-fixes-2026-11-11.md.
  async function loadAssert() {
    const mod = await import("./metaapi.functions");
    return mod.assertDemoAccount;
  }

  function stubFetch(accountType: string | undefined) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ accountType, name: "test", state: "DEPLOYED", platform: "mt5" }),
      })) as unknown as typeof fetch,
    );
  }

  it("passes a MetaApi demo account", async () => {
    stubFetch("demo");
    const assertDemoAccount = await loadAssert();
    await expect(assertDemoAccount("tok", "acc-1")).resolves.toBeUndefined();
  });

  it("rejects a MetaApi real account", async () => {
    stubFetch("real");
    const assertDemoAccount = await loadAssert();
    await expect(assertDemoAccount("tok", "acc-1")).rejects.toThrow(/only demo accounts are permitted/);
  });

  it("rejects an account with no accountType field (fail-safe)", async () => {
    stubFetch(undefined);
    const assertDemoAccount = await loadAssert();
    await expect(assertDemoAccount("tok", "acc-1")).rejects.toThrow(/only demo accounts are permitted/);
  });
});
