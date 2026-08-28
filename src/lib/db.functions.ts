/**
 * Cloudflare D1 + KV server functions.
 *
 * D1 stores journal trades (rows). KV stores settings blobs (accounts, engine,
 * meta) under fixed keys. The client store calls these on mount (load) and
 * after every mutation (fire-and-forget).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCFEnv } from "./cloudflare-env";
import type { JournalTrade, MetaApiSettings, EngineSettings } from "./store";
import type { PropAccount } from "./engine/calc";

// ---------------------------------------------------------------------------
// KV keys
// ---------------------------------------------------------------------------

const KV_ACCOUNTS = "gizzyfx.accounts";
const KV_ENGINE = "gizzyfx.engine";
const KV_META = "gizzyfx.meta";

// ---------------------------------------------------------------------------
// Journal (D1)
// ---------------------------------------------------------------------------

interface DbRow {
  id: string;
  date: string;
  time: string;
  pair: string;
  dir: string;
  result: string;
  prop_pnl: number;
  ex_pnl: number;
  net_pnl: number;
  ticket: string | null;
  note: string | null;
  details: string | null;
}

function rowToTrade(row: DbRow): JournalTrade {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    pair: row.pair,
    dir: row.dir as JournalTrade["dir"],
    result: row.result as JournalTrade["result"],
    propPnl: row.prop_pnl,
    exPnl: row.ex_pnl,
    netPnl: row.net_pnl,
    ticket: row.ticket ?? undefined,
    note: row.note ?? undefined,
    details: row.details ? JSON.parse(row.details) : null,
  };
}

export const loadJournal = createServerFn({ method: "GET" }).handler(async (): Promise<JournalTrade[]> => {
  const env = getCFEnv();
  if (!env) return [];
  const { results } = await env.DB.prepare(
    "SELECT * FROM journal_trades ORDER BY created_at ASC",
  )
    .bind()
    .all<DbRow>();
  return results.map(rowToTrade);
});

const tradeInput = z.object({
  id: z.string(),
  date: z.string(),
  time: z.string(),
  pair: z.string(),
  dir: z.enum(["LONG", "SHORT"]),
  result: z.enum(["OPEN", "WIN", "LOSS"]),
  propPnl: z.number(),
  exPnl: z.number(),
  netPnl: z.number(),
  ticket: z.string().optional(),
  note: z.string().optional(),
  details: z.unknown().optional(),
});

export const upsertTrade = createServerFn({ method: "POST" })
  .validator(tradeInput)
  .handler(async ({ data: t }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare(
      `INSERT INTO journal_trades (id, date, time, pair, dir, result, prop_pnl, ex_pnl, net_pnl, ticket, note, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         date=excluded.date, time=excluded.time, pair=excluded.pair, dir=excluded.dir,
         result=excluded.result, prop_pnl=excluded.prop_pnl, ex_pnl=excluded.ex_pnl,
         net_pnl=excluded.net_pnl, ticket=excluded.ticket, note=excluded.note,
         details=excluded.details`,
    )
      .bind(
        t.id, t.date, t.time, t.pair, t.dir, t.result,
        t.propPnl, t.exPnl, t.netPnl,
        t.ticket ?? null, t.note ?? null,
        t.details != null ? JSON.stringify(t.details) : null,
      )
      .run();
  });

export const deleteTradeServer = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.DB.prepare("DELETE FROM journal_trades WHERE id = ?").bind(data.id).run();
  });

export const clearJournalServer = createServerFn({ method: "POST" }).handler(async () => {
  const env = getCFEnv();
  if (!env) return;
  await env.DB.prepare("DELETE FROM journal_trades").bind().run();
});

// ---------------------------------------------------------------------------
// Settings (KV)
// ---------------------------------------------------------------------------

export const loadSettings = createServerFn({ method: "GET" }).handler(async () => {
  const env = getCFEnv();
  if (!env) return { accounts: null, engine: null, meta: null };
  const [a, e, m] = await Promise.all([
    env.KV.get(KV_ACCOUNTS),
    env.KV.get(KV_ENGINE),
    env.KV.get(KV_META),
  ]);
  return {
    accounts: a ? (JSON.parse(a) as PropAccount[]) : null,
    engine: e ? (JSON.parse(e) as Partial<EngineSettings>) : null,
    meta: m ? (JSON.parse(m) as Partial<MetaApiSettings>) : null,
  };
});

export const saveAccounts = createServerFn({ method: "POST" })
  .validator(z.object({ accounts: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.KV.put(KV_ACCOUNTS, data.accounts);
  });

export const saveEngine = createServerFn({ method: "POST" })
  .validator(z.object({ engine: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.KV.put(KV_ENGINE, data.engine);
  });

export const saveMeta = createServerFn({ method: "POST" })
  .validator(z.object({ meta: z.string() }))
  .handler(async ({ data }) => {
    const env = getCFEnv();
    if (!env) return;
    await env.KV.put(KV_META, data.meta);
  });
