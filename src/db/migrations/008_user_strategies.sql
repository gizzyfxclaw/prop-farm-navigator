-- Migration 008: User-saved strategies from Strategy Builder
CREATE TABLE IF NOT EXISTS user_strategies (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  family TEXT DEFAULT 'custom',
  -- Entry conditions (JSON array of conditions)
  entry_conditions TEXT NOT NULL DEFAULT '[]',
  -- Exit/stop configuration
  sl_type TEXT NOT NULL DEFAULT 'fixed_pips', -- fixed_pips, atr_multiple, structure
  sl_value REAL NOT NULL DEFAULT 20,
  tp_type TEXT NOT NULL DEFAULT 'rr_multiple', -- rr_multiple, fixed_pips, atr_multiple
  tp_value REAL NOT NULL DEFAULT 2.5,
  -- Filters
  session_filter TEXT DEFAULT 'all', -- all, london, ny, london_ny, asia
  trend_filter INTEGER DEFAULT 0, -- 0=off, 1=on
  trend_ema_length INTEGER DEFAULT 200,
  -- Position sizing
  risk_per_trade REAL DEFAULT 1.0, -- percentage of account
  -- Timeframe
  default_timeframe TEXT DEFAULT '1h',
  -- Pine Script (optional, for reference)
  pine_script TEXT,
  -- Metadata
  backtest_stats TEXT, -- JSON: {total, winRate, expectancy, totalPips}
  is_active INTEGER DEFAULT 1,
  is_public INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_user_strategies_email ON user_strategies(user_email);
CREATE INDEX IF NOT EXISTS idx_user_strategies_active ON user_strategies(is_active);
