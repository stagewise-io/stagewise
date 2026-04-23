-- VERSION: 1

-- Meta table for schema versioning
CREATE TABLE IF NOT EXISTS meta(
  key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY,
  value LONGVARCHAR
);

-- Snapshots table: content-addressed storage for file states
-- Uses reverse-delta compression (newer versions are keyframes, older become deltas)
CREATE TABLE IF NOT EXISTS snapshots(
  oid TEXT PRIMARY KEY,
  payload BLOB NOT NULL,
  delta_target_oid TEXT,
  is_external INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS snapshots_delta_target_oid_index ON snapshots(delta_target_oid);

-- Operations table: sequential log of all file operations (baseline, edit)
-- Never mutates/deletes rows, only appends
CREATE TABLE IF NOT EXISTS operations(
  idx INTEGER PRIMARY KEY AUTOINCREMENT,
  filepath TEXT NOT NULL,
  operation TEXT NOT NULL,
  snapshot_oid TEXT REFERENCES snapshots(oid) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  contributor TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS operations_filepath_index ON operations(filepath);
CREATE INDEX IF NOT EXISTS operations_snapshot_oid_index ON operations(snapshot_oid);
CREATE INDEX IF NOT EXISTS operations_reason_index ON operations(reason);
CREATE INDEX IF NOT EXISTS operations_contributor_index ON operations(contributor);
CREATE INDEX IF NOT EXISTS operations_filepath_op_idx ON operations(filepath, operation, idx DESC, snapshot_oid);
