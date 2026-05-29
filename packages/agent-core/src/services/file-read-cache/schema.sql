CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS file_read_cache (
  content_hash TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,  -- Unix ms
  last_used_at INTEGER NOT NULL   -- Unix ms
);
CREATE INDEX IF NOT EXISTS idx_file_read_cache_last_used ON file_read_cache(last_used_at);
