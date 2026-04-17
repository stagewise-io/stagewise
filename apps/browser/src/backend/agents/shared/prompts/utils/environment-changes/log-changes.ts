import type { LogsSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two logs snapshots and produces structured change entries
 * for created, updated, or removed log channels.
 */
export function computeLogChanges(
  previous: LogsSnapshot | null,
  current: LogsSnapshot,
): EnvironmentChangeEntry[] {
  if (!previous) return [];

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
        attributes: {
          channel,
          newLines: String(newLines),
        },
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
