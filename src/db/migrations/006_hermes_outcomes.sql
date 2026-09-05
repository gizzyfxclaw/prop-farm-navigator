-- Durable, queryable record of each analyzed setup's real outcome, so a
-- win-rate can be computed across all history instead of re-derived from a
-- rolling 2-hour window and thrown away (see scripts/self_learn.py).
CREATE TABLE IF NOT EXISTS hermes_outcomes (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE,
  pair TEXT NOT NULL,
  timeframe TEXT,
  direction TEXT CHECK(direction IN ('long', 'short')),
  entry REAL,
  stop_loss REAL,
  take_profit REAL,
  accuracy_grade TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('WIN', 'LOSS', 'PENDING')),
  pips_moved REAL,
  sl_pips REAL,
  evaluated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_hermes_outcomes_outcome ON hermes_outcomes(outcome);
CREATE INDEX IF NOT EXISTS idx_hermes_outcomes_pair ON hermes_outcomes(pair);
