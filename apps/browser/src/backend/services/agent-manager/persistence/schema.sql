-- VERSION: 3

CREATE TABLE IF NOT EXISTS meta(
  key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY,
  value LONGVARCHAR
);

CREATE TABLE IF NOT EXISTS agentInstances(
  id TEXT PRIMARY KEY,
  parent_agent_instance_id TEXT,
  type TEXT NOT NULL,
  instance_config TEXT,
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  active_model_id TEXT NOT NULL,
  title TEXT NOT NULL,
  history TEXT NOT NULL,
  queued_messages TEXT NOT NULL,
  input_state TEXT NOT NULL,
  used_tokens INTEGER NOT NULL,
  mounted_workspaces TEXT
);

CREATE INDEX IF NOT EXISTS agentInstances_created_at_index ON agentInstances(created_at);
CREATE INDEX IF NOT EXISTS agentInstances_last_message_at_index ON agentInstances(last_message_at);
