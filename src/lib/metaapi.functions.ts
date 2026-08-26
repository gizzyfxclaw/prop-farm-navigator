import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Thin MetaApi Cloud REST proxy.
 * The token is supplied by the browser on every call and is never persisted server-side.
 */

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

const credentials = z.object({
  token: z.string().min(10),
  accountId: z.string().min(3),
});

type Cred = z.infer<typeof credentials>;

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
export type ApiResult<T> = Ok<T> | Err;

async function readError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    detail = body.message || body.error || "";
  } catch {
    detail = await res.text().catch(() => "");
  }
  const clean = detail.slice(0, 400);
  return `MetaApi ${res.status}${clean ? `: ${clean}` : ""}`;
}

async function accountRegion(cred: Cred): Promise<string> {
  const res = await fetch(`${PROVISIONING}/users/current/accounts/${cred.accountId}`, {
    headers: { "auth-token": cred.token },
  });
  if (!res.ok) throw new Error(await readError(res));
  const acc = (await res.json()) as { region?: string };
  return acc.region || "new-york";
}

async function clientApi<T>(
  cred: Cred,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const region = await accountRegion(cred);
  const host = `https://mt-client-api-v1.${region}.agiliumtrade.agiliumtrade.ai`;
  const res = await fetch(`${host}/users/current/accounts/${cred.accountId}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "auth-token": cred.token,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

async function guard<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const message = e instanceof Error ? e.message : "MetaApi request failed";
    console.error("[metaapi]", message);
    return { ok: false, error: message };
  }
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  time?: string;
}

export const fetchQuote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    credentials.extend({ symbol: z.string().min(3) }).parse(input),
  )
  .handler(async ({ data }): Promise<ApiResult<Quote>> =>
    guard(async () => {
      const price = await clientApi<{ bid: number; ask: number; time?: string }>(
        data,
        `/symbols/${encodeURIComponent(data.symbol)}/current-price?keepSubscription=true`,
      );
      const bid = Number(price.bid);
      const ask = Number(price.ask);
      return { symbol: data.symbol, bid, ask, mid: (bid + ask) / 2, time: price.time };
    }),
  );

export interface AccountSnapshot {
  broker?: string;
  currency?: string;
  server?: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage?: number;
  name?: string;
  login?: number;
}

export const fetchAccountInformation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.parse(input))
  .handler(async ({ data }): Promise<ApiResult<AccountSnapshot>> =>
    guard(async () => {
      const info = await clientApi<Record<string, unknown>>(data, "/account-information");
      return {
        broker: info["broker"] as string | undefined,
        currency: info["currency"] as string | undefined,
        server: info["server"] as string | undefined,
        balance: Number(info["balance"] ?? 0),
        equity: Number(info["equity"] ?? 0),
        margin: Number(info["margin"] ?? 0),
        freeMargin: Number(info["freeMargin"] ?? 0),
        leverage: info["leverage"] as number | undefined,
        name: info["name"] as string | undefined,
        login: info["login"] as number | undefined,
      };
    }),
  );

export interface PositionRow {
  id: string;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  time?: string;
}

export interface OrderRow {
  id: string;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  time?: string;
}

export const fetchOpenState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.parse(input))
  .handler(
    async ({ data }): Promise<ApiResult<{ positions: PositionRow[]; orders: OrderRow[] }>> =>
      guard(async () => {
        const [positions, orders] = await Promise.all([
          clientApi<Record<string, unknown>[]>(data, "/positions"),
          clientApi<Record<string, unknown>[]>(data, "/orders"),
        ]);
        return {
          positions: (positions ?? []).map((p) => ({
            id: String(p["id"]),
            symbol: String(p["symbol"] ?? ""),
            type: String(p["type"] ?? ""),
            volume: Number(p["volume"] ?? 0),
            openPrice: Number(p["openPrice"] ?? 0),
            currentPrice: p["currentPrice"] as number | undefined,
            stopLoss: p["stopLoss"] as number | undefined,
            takeProfit: p["takeProfit"] as number | undefined,
            profit: Number(p["profit"] ?? 0),
            time: p["time"] as string | undefined,
          })),
          orders: (orders ?? []).map((o) => ({
            id: String(o["id"]),
            symbol: String(o["symbol"] ?? ""),
            type: String(o["type"] ?? ""),
            volume: Number(o["volume"] ?? o["currentVolume"] ?? 0),
            openPrice: Number(o["openPrice"] ?? 0),
            stopLoss: o["stopLoss"] as number | undefined,
            takeProfit: o["takeProfit"] as number | undefined,
            time: o["time"] as string | undefined,
          })),
        };
      }),
  );

export interface DealRow {
  id: string;
  orderId?: string;
  positionId?: string;
  symbol: string;
  type: string;
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  time: string;
  entryType?: string;
}

export const fetchHistoryDeals = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.extend({ days: z.number().min(1).max(180).default(30) }).parse(input))
  .handler(async ({ data }): Promise<ApiResult<DealRow[]>> =>
    guard(async () => {
      const end = new Date();
      const start = new Date(end.getTime() - data.days * 86_400_000);
      const deals = await clientApi<Record<string, unknown>[]>(
        data,
        `/history-deals/time/${start.toISOString()}/${end.toISOString()}`,
      );
      return (deals ?? [])
        .map((d) => ({
          id: String(d["id"]),
          orderId: d["orderId"] as string | undefined,
          positionId: d["positionId"] as string | undefined,
          symbol: String(d["symbol"] ?? ""),
          type: String(d["type"] ?? ""),
          volume: Number(d["volume"] ?? 0),
          price: Number(d["price"] ?? 0),
          profit: Number(d["profit"] ?? 0),
          commission: Number(d["commission"] ?? 0),
          swap: Number(d["swap"] ?? 0),
          time: String(d["time"] ?? ""),
          entryType: d["entryType"] as string | undefined,
        }))
        .sort((a, b) => (a.time < b.time ? 1 : -1));
    }),
  );

export const placePendingOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    credentials
      .extend({
        actionType: z.enum([
          "ORDER_TYPE_BUY_LIMIT",
          "ORDER_TYPE_BUY_STOP",
          "ORDER_TYPE_SELL_LIMIT",
          "ORDER_TYPE_SELL_STOP",
        ]),
        symbol: z.string().min(3),
        volume: z.number().positive(),
        openPrice: z.number().positive(),
        stopLoss: z.number().positive(),
        takeProfit: z.number().positive(),
        comment: z.string().max(24).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({ data }): Promise<ApiResult<{ orderId: string; positionId?: string; message?: string }>> =>
      guard(async () => {
        const response = await clientApi<Record<string, unknown>>(data, "/trade", {
          method: "POST",
          body: {
            actionType: data.actionType,
            symbol: data.symbol,
            volume: data.volume,
            openPrice: data.openPrice,
            stopLoss: data.stopLoss,
            takeProfit: data.takeProfit,
            comment: data.comment ?? "GizzyFx",
          },
        });
        return {
          orderId: String(response["orderId"] ?? response["order"] ?? ""),
          positionId: response["positionId"] as string | undefined,
          message: response["stringCode"] as string | undefined,
        };
      }),
  );

export const cancelPendingOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.extend({ orderId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<ApiResult<{ message?: string }>> =>
    guard(async () => {
      const response = await clientApi<Record<string, unknown>>(data, "/trade", {
        method: "POST",
        body: { actionType: "ORDER_CANCEL", orderId: data.orderId },
      });
      return { message: response["stringCode"] as string | undefined };
    }),
  );

export const closePosition = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.extend({ positionId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<ApiResult<{ message?: string }>> =>
    guard(async () => {
      const response = await clientApi<Record<string, unknown>>(data, "/trade", {
        method: "POST",
        body: { actionType: "POSITION_CLOSE_ID", positionId: data.positionId },
      });
      return { message: response["stringCode"] as string | undefined };
    }),
  );
