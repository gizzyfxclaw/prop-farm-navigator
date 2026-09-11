CREATE TABLE IF NOT EXISTS hermes_news_analysis (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  impact TEXT NOT NULL,
  analysis TEXT NOT NULL,
  direction TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  affected_pairs TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hermes_news_event_id ON hermes_news_analysis(event_id);
