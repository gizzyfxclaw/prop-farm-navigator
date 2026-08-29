/**
 * Per-request Cloudflare environment store.
 *
 * AsyncLocalStorage is initialised once in server.ts (the outermost fetch
 * handler) so every createServerFn handler in the same request can read
 * D1/KV bindings via getCFEnv() without any dependency on TanStack Start
 * or h3 internals.
 *
 * Requires the `nodejs_compat` compatibility flag (already set in wrangler.toml).
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface CFEnv {
  DB: {
    prepare: (sql: string) => {
      bind: (...params: unknown[]) => {
        run: () => Promise<unknown>;
        all: <T = unknown>() => Promise<{ results: T[] }>;
        first: <T = unknown>() => Promise<T | null>;
      };
    };
    exec: (sql: string) => Promise<unknown>;
  };
  KV: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  /** Set via `wrangler secret put AUTH_EMAIL` */
  AUTH_EMAIL?: string;
  /** Set via `wrangler secret put AUTH_PASSWORD` */
  AUTH_PASSWORD?: string;
  /** Random 32-char string — set via `wrangler secret put AUTH_SECRET` */
  AUTH_SECRET?: string;
}

export const envStorage = new AsyncLocalStorage<CFEnv>();

export function getCFEnv(): CFEnv | null {
  return envStorage.getStore() ?? null;
}
