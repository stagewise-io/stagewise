CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS processed_image_cache (
  source_hash     TEXT    NOT NULL,
  constraint_key  TEXT    NOT NULL,
  result_data     BLOB    NOT NULL,
  media_type      TEXT    NOT NULL,
  last_used_at    INTEGER NOT NULL,
  PRIMARY KEY (source_hash, constraint_key)
);
CREATE INDEX IF NOT EXISTS idx_pic_last_used ON processed_image_cache(last_used_at);
