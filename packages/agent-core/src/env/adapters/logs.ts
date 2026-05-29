/**
 * `logs` core {@link DomainAdapter}.
 *
 * Owns the agent-owned debug log channels (JSONL files in `logs/`
 * the agent has written to). The full-state render is the per-channel
 * `<log-channel file="..." lines="..." bytes="..." />` lines embedded
 * in every system prompt; the diff render reports
 * created/added/removed events.
 */
import type { AgentHost } from '../../host/host';
import { LOGS_PREFIX, getAgentOwnedLogPaths } from '../../logs/ownership';
import { readLogChannels } from '../../logs/read';
import type { AgentStore } from '../../store/agent-store';
import type { DomainAdapter } from '../contract';
import type { LogsSnapshot } from '../types';
import {
  CORE_ENV_SCHEMA_VERSION,
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from './shared';
import LogsPromptSection from './logs.prompt.md?raw';

export interface LogsDomainAdapterDeps {
  host: AgentHost;
  store: AgentStore;
  renderOrder?: number;
}

async function buildLogsState(
  agentInstanceId: string,
  host: AgentHost,
  store: AgentStore,
): Promise<LogsSnapshot> {
  const agentEntry = store.get().agents.instances[agentInstanceId];
  const ownedPaths = agentEntry
    ? getAgentOwnedLogPaths(agentEntry.state.history)
    : new Set<string>();
  if (ownedPaths.size === 0) return { entries: [] };

  const channels = await readLogChannels(host.paths.logsDir());
  const entries = channels
    .filter((c) => ownedPaths.has(`${LOGS_PREFIX}/${c.filename}`))
    .map((c) => ({
      filename: c.filename,
      byteSize: c.byteSize,
      lineCount: c.lineCount,
    }));
  return { entries };
}

function renderFullLogs(state: LogsSnapshot): string {
  if (state.entries.length === 0) return '';
  const lines = state.entries.map(
    (c) =>
      `<log-channel file="${LOGS_PREFIX}/${escAttr(c.filename)}" lines="${c.lineCount}" bytes="${c.byteSize}" />`,
  );
  return lines.join('\n');
}

function computeLogsChanges(
  previous: LogsSnapshot,
  current: LogsSnapshot,
): EnvironmentChangeEntry[] {
  const changes: EnvironmentChangeEntry[] = [];
  const prevByKey = new Map(previous.entries.map((e) => [e.filename, e]));
  const currByKey = new Map(current.entries.map((e) => [e.filename, e]));

  for (const [key, curr] of currByKey) {
    const channel = key.replace(/\.jsonl$/, '');
    const prev = prevByKey.get(key);
    if (!prev) {
      changes.push({
        type: 'log-channel-created',
        summary: `Log channel "${channel}" created`,
        attributes: { channel },
      });
    } else if (
      curr.lineCount > prev.lineCount ||
      curr.byteSize > prev.byteSize
    ) {
      const newLines = curr.lineCount - prev.lineCount;
      changes.push({
        type: 'log-entries-added',
        summary: `Log channel "${channel}": ${newLines} new ${newLines === 1 ? 'entry' : 'entries'} (${curr.lineCount} total)`,
        attributes: { channel, newLines: String(newLines) },
      });
    }
  }

  for (const [key] of prevByKey) {
    if (!currByKey.has(key)) {
      const channel = key.replace(/\.jsonl$/, '');
      changes.push({
        type: 'log-channel-removed',
        summary: `Log channel "${channel}" removed`,
        attributes: { channel },
      });
    }
  }

  return changes;
}

export function createLogsDomainAdapter(
  deps: LogsDomainAdapterDeps,
): DomainAdapter<LogsSnapshot> {
  return {
    domainId: 'logs',
    renderOrder: deps.renderOrder ?? 7,
    schemaVersion: CORE_ENV_SCHEMA_VERSION,
    promptSection: LogsPromptSection,
    getState(agentInstanceId) {
      return buildLogsState(agentInstanceId, deps.host, deps.store);
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullLogs(curr);
      return renderChangesXml(computeLogsChanges(prev, curr));
    },
  };
}
