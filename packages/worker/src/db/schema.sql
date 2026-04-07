CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_expires_at ON files(expires_at);
CREATE INDEX IF NOT EXISTS idx_deleted ON files(deleted);
