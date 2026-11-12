CREATE TABLE IF NOT EXISTS earnings_lock (
  name TEXT PRIMARY KEY,
  token TEXT NOT NULL DEFAULT '',
  expires INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS earnings_calls (
  id TEXT PRIMARY KEY,
  session TEXT NOT NULL,
  ticker TEXT NOT NULL,
  rank INTEGER NOT NULL,
  published_at TEXT NOT NULL,
  hash TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS earnings_calls_session ON earnings_calls(session);

CREATE TABLE IF NOT EXISTS earnings_grades (
  call_id TEXT PRIMARY KEY REFERENCES earnings_calls(id),
  status TEXT NOT NULL CHECK(status IN ('graded','void')),
  void_reason TEXT,
  graded_at TEXT NOT NULL,
  body TEXT
);

CREATE TABLE IF NOT EXISTS earnings_skips (
  session TEXT NOT NULL,
  ticker TEXT NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY(session, ticker)
);

CREATE TABLE IF NOT EXISTS earnings_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT,
  ai_calls INTEGER NOT NULL DEFAULT 0
);
