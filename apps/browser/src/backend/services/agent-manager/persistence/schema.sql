-- VERSION: 10

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
  title_locked_by_user INTEGER,
  history TEXT NOT NULL DEFAULT '{"json":[]}',  -- deprecated: kept for rollback safety
  queued_messages TEXT NOT NULL,
  input_state TEXT NOT NULL,
  used_tokens INTEGER NOT NULL,
  mounted_workspaces TEXT,
  associated_browser_tabs TEXT,
  tool_approval_mode TEXT NOT NULL DEFAULT 'alwaysAsk'
);

CREATE INDEX IF NOT EXISTS agentInstances_created_at_index ON agentInstances(created_at);
CREATE INDEX IF NOT EXISTS agentInstances_last_message_at_index ON agentInstances(last_message_at);

CREATE TABLE IF NOT EXISTS agentMessages(
  agent_instance_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  role TEXT NOT NULL,
  parts TEXT NOT NULL,
  metadata TEXT,
  PRIMARY KEY (agent_instance_id, seq)
);

CREATE INDEX IF NOT EXISTS agent_messages_agent_id_index ON agentMessages(agent_instance_id);
