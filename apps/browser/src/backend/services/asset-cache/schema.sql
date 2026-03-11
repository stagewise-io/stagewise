CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS asset_cache (
  file_hash  TEXT PRIMARY KEY,
  read_url   TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_cache_expires ON asset_cache(expires_at);
