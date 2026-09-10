-- Migration 007: SMC analysis cache to reduce tvremix API calls
-- Caches analysis results for 5 minutes to prevent rate limiting

CREATE TABLE IF NOT EXISTS smc_analysis_cache (
  id TEXT PRIMARY KEY,
  pair TEXT NOT NULL,
  interval TEXT NOT NULL,
  requested_count INTEGER NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS smc_cache_lookup ON smc_analysis_cache(pair, interval, requested_count, expires_at);
