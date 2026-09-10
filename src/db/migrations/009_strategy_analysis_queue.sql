-- Migration 009: Strategy Analysis Queue
CREATE TABLE IF NOT EXISTS strategy_analysis_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'strategy_analysis',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'fulfilled', 'failed')),
  strategy_id TEXT,
  pine_script TEXT,
  pair TEXT NOT NULL DEFAULT 'EURUSD',
  interval TEXT NOT NULL DEFAULT '1h',
  bar_limit INTEGER DEFAULT 500,
  params TEXT DEFAULT '{}',
  use_pending_order INTEGER DEFAULT 1,
  entry_gap_pips REAL DEFAULT 5,
  result TEXT,
  error TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  started_at TEXT,
  fulfilled_at TEXT,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_strategy_analysis_queue_status ON strategy_analysis_queue(status);
CREATE INDEX IF NOT EXISTS idx_strategy_analysis_queue_type ON strategy_analysis_queue(type);
