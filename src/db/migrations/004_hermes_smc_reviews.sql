CREATE TABLE IF NOT EXISTS hermes_smc_reviews (
  id TEXT PRIMARY KEY,
  pair TEXT NOT NULL,
  timeframe TEXT DEFAULT '1h',
  smc_data TEXT NOT NULL, -- JSON: full SMC analysis response
  user_notes TEXT, -- User's explanation of their own analysis
  user_image TEXT, -- Base64 data URL of user's chart screenshot
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'fulfilled')),
  verdict TEXT CHECK(verdict IN ('match', 'diverge', 'partial', 'neutral')),
  feedback TEXT, -- Hermes' detailed feedback
  strategy_notes TEXT, -- How it aligns with GizzyFx Channel Breakout
  entry REAL,
  stop_loss REAL,
  take_profit_1 REAL,
  take_profit_2 REAL,
  direction TEXT CHECK(direction IN ('long', 'short')),
  accuracy_grade TEXT CHECK(accuracy_grade IN ('HIGH', 'STANDARD', 'NONE')),
  created_at TEXT DEFAULT (datetime('now')),
  fulfilled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hermes_smc_reviews_status ON hermes_smc_reviews(status);
CREATE INDEX IF NOT EXISTS idx_hermes_smc_reviews_pair ON hermes_smc_reviews(pair);
