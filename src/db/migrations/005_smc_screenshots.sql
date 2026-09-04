-- Migration 005: Add chart screenshots and analysis progress tracking
-- chart_screenshots: JSON array of base64 PNG screenshots from TradingView
-- analysis_steps: JSON array of step objects {step, label, summary, timestamp}
-- started_at: when Hermes started analyzing (for "analyzing..." indicator)

ALTER TABLE hermes_smc_reviews ADD COLUMN chart_screenshots TEXT; -- JSON array of base64 PNGs
ALTER TABLE hermes_smc_reviews ADD COLUMN analysis_steps TEXT;    -- JSON array of {step, label, summary, ts}
ALTER TABLE hermes_smc_reviews ADD COLUMN started_at TEXT;        -- ISO timestamp when cron picked it up

-- Also fix created_at to store UTC ISO format with Z suffix (not sqlite's local time)
-- New rows will use strftime('%Y-%m-%dT%H:%M:%SZ','now') for unambiguous UTC
