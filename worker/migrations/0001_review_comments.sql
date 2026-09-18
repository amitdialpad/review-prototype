CREATE TABLE IF NOT EXISTS review_comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  author_name TEXT NOT NULL,
  message TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  selection_json TEXT,
  element_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS review_comments_session_created
  ON review_comments (project_id, session_id, created_at);

CREATE INDEX IF NOT EXISTS review_comments_expiry
  ON review_comments (expires_at);

CREATE TABLE IF NOT EXISTS review_write_limits (
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  write_count INTEGER NOT NULL,
  PRIMARY KEY (project_id, session_id, window_start)
);

CREATE INDEX IF NOT EXISTS review_write_limits_window
  ON review_write_limits (window_start);
