CREATE TABLE IF NOT EXISTS economic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  country TEXT,
  currency TEXT,
  event_time TEXT,
  impact TEXT CHECK(impact IN ('low', 'medium', 'high')),
  actual TEXT,
  estimate TEXT,
  previous TEXT,
  pairs TEXT, -- JSON array of affected pairs (e.g., '["EURUSD","USDJPY","GBPUSD"]')
  source TEXT DEFAULT 'finnhub',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(event_name, event_time, country)
);

CREATE INDEX IF NOT EXISTS idx_economic_events_time ON economic_events(event_time);
CREATE INDEX IF NOT EXISTS idx_economic_events_impact ON economic_events(impact);
CREATE INDEX IF NOT EXISTS idx_economic_events_currency ON economic_events(currency);
