import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Thin MetaApi Cloud REST proxy.
 * The token is supplied by the browser on every call and is never persisted server-side.
 */

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

// In-process region cache: accountId → region string.
// Lives for the lifetime of the server process so repeated calls skip the provisioning round-trip.
const _regionCache = new Map<string, string>();

const credentials = z.object({
  token: z.string().min(10),
  accountId: z.string().min(3),
  /** Optional override — bypasses the provisioning region lookup entirely. */
  clientApiUrl: z.string().url().optional(),
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
  const cached = _regionCache.get(cred.accountId);
  if (cached) return cached;
  const res = await fetch(`${PROVISIONING}/users/current/accounts/${cred.accountId}`, {
    headers: { "auth-token": cred.token },
  });
  if (!res.ok) throw new Error(await readError(res));
  const acc = (await res.json()) as { region?: string };
  const region = acc.region || "new-york";
  _regionCache.set(cred.accountId, region);
  return region;
}

async function clientApi<T>(
  cred: Cred,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let host: string;
  if (cred.clientApiUrl) {
    host = cred.clientApiUrl.replace(/\/$/, "");
  } else {
    const region = await accountRegion(cred);
    host = `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
  }
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

/**
 * MetaApi answers a rejected trade with HTTP 200 and a retcode in the body,
 * so a broker refusal (market closed, no money, invalid stops) looks exactly
 * like a fill unless the code is inspected. Only these codes mean the order
 * actually reached the book.
 */
const TRADE_SUCCESS_CODES = new Set([
  "TRADE_RETCODE_DONE",         // executed
  "TRADE_RETCODE_PLACED",       // pending order placed
  "TRADE_RETCODE_DONE_PARTIAL", // partially filled
  "ERR_NO_ERROR",
  "OK",
]);

/** Broker rejections worth explaining in plain language. */
const RETCODE_MESSAGE: Record<string, string> = {
  TRADE_RETCODE_MARKET_CLOSED:
    "the market is closed. Forex trades from Sunday ~22:00 UTC to Friday ~22:00 UTC.",
  TRADE_RETCODE_NO_MONEY: "the account does not have enough free margin.",
  TRADE_RETCODE_TRADE_DISABLED: "trading is disabled on this account.",
  TRADE_RETCODE_INVALID_PRICE: "the entry price is invalid or too far from the market.",
  TRADE_RETCODE_INVALID_STOPS:
    "the stop loss or take profit is too close to the entry for this broker.",
  TRADE_RETCODE_INVALID_VOLUME: "the lot size is outside the broker's allowed range.",
  TRADE_RETCODE_REQUOTE: "the price moved before the order reached the broker.",
  TRADE_RETCODE_PRICE_OFF: "no price is currently available for this symbol.",
  TRADE_RETCODE_TOO_MANY_REQUESTS: "the broker is rate-limiting; retry shortly.",
  TRADE_RETCODE_LIMIT_ORDERS: "the account has reached its pending-order limit.",
  TRADE_RETCODE_ORDER_CHANGED: "the order changed before the request was processed.",
};

/**
 * Throw unless the broker actually accepted the order, so guard() turns a
 * rejection into { ok: false } instead of the caller treating it as filled.
 */
function assertTradeAccepted(response: Record<string, unknown>): void {
  const code = String(response["stringCode"] ?? response["description"] ?? "").toUpperCase();
  // Some deployments omit the code entirely on success; only reject a code we
  // actually received and do not recognise as successful.
  if (!code || TRADE_SUCCESS_CODES.has(code)) return;

  const explained = RETCODE_MESSAGE[code];
  const numeric = response["numericCode"];
  throw new Error(
    explained
      ? `Order rejected — ${explained} (${code})`
      : `Order rejected by the broker: ${code}${numeric != null ? ` (${numeric})` : ""}`,
  );
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  time?: string | undefined;
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
  broker?: string | undefined;
  currency?: string | undefined;
  server?: string | undefined;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage?: number | undefined;
  name?: string | undefined;
  login?: number | undefined;
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
  currentPrice?: number | undefined;
  stopLoss?: number | undefined;
  takeProfit?: number | undefined;
  profit: number;
  time?: string | undefined;
}

export interface OrderRow {
  id: string;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  stopLoss?: number | undefined;
  takeProfit?: number | undefined;
  time?: string | undefined;
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
  orderId?: string | undefined;
  positionId?: string | undefined;
  symbol: string;
  type: string;
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  time: string;
  entryType?: string | undefined;
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
    async ({ data }): Promise<ApiResult<{ orderId: string; positionId?: string | undefined; message?: string | undefined }>> =>
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
        assertTradeAccepted(response);
        return {
          orderId: String(response["orderId"] ?? response["order"] ?? ""),
          positionId: response["positionId"] as string | undefined,
          message: response["stringCode"] as string | undefined,
        };
      }),
  );

export const cancelPendingOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.extend({ orderId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<ApiResult<{ message?: string | undefined }>> =>
    guard(async () => {
      const response = await clientApi<Record<string, unknown>>(data, "/trade", {
        method: "POST",
        body: { actionType: "ORDER_CANCEL", orderId: data.orderId },
      });
      assertTradeAccepted(response);
      return { message: response["stringCode"] as string | undefined };
    }),
  );

export const closePosition = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.extend({ positionId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<ApiResult<{ message?: string | undefined }>> =>
    guard(async () => {
      const response = await clientApi<Record<string, unknown>>(data, "/trade", {
        method: "POST",
        body: { actionType: "POSITION_CLOSE_ID", positionId: data.positionId },
      });
      assertTradeAccepted(response);
      return { message: response["stringCode"] as string | undefined };
    }),
  );
