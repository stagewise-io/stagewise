import type { ShellSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two shell session snapshots and produces change entries
 * for session lifecycle events and new output.
 *
 * - `shell-session-started`    — session in current but not previous.
 * - `shell-session-killed`     — session in previous but gone from current.
 * - `shell-session-exited`     — session transitioned from alive to exited.
 *    Suppresses `new-output` for the same session (exit is higher signal).
 * - `shell-session-new-output` — lineCount increased on a live session.
 */
export function computeShellChanges(
  previous: ShellSnapshot,
  current: ShellSnapshot,
): EnvironmentChangeEntry[] {
  const changes: EnvironmentChangeEntry[] = [];

  const prevMap = new Map(previous.sessions.map((s) => [s.id, s]));
  const currMap = new Map(current.sessions.map((s) => [s.id, s]));

  // Killed: was in previous, gone from current
  for (const [id] of prevMap) {
    if (!currMap.has(id)) {
      changes.push({
        type: 'shell-session-killed',
        attributes: { sessionId: id },
      });
    }
  }

  for (const [id, curr] of currMap) {
    const prev = prevMap.get(id);

    if (!prev) {
      // New session — include lineCount so agent knows there's content
      const entry: EnvironmentChangeEntry = {
        type: 'shell-session-started',
        attributes: {
          sessionId: id,
          lineCount: String(curr.lineCount),
          logPath: curr.logPath,
        },
      };
      if (curr.tailContent) {
        entry.summary = curr.tailContent;
      }
      changes.push(entry);
      continue;
    }

    // Exited: was alive, now exited
    if (!prev.exited && curr.exited) {
      const entry: EnvironmentChangeEntry = {
        type: 'shell-session-exited',
        attributes: {
          sessionId: id,
          exitCode: String(curr.exitCode ?? '?'),
          logPath: curr.logPath,
        },
      };
      if (curr.tailContent) {
        entry.summary = curr.tailContent;
      }
      changes.push(entry);
      continue; // Don't also emit new-output for an exit
    }

    // New output: lineCount increased
    if (curr.lineCount > prev.lineCount) {
      const delta = curr.lineCount - prev.lineCount;
      const entry: EnvironmentChangeEntry = {
        type: 'shell-session-new-output',
        attributes: {
          sessionId: id,
          lineCount: String(delta),
          logPath: curr.logPath,
        },
      };
      if (curr.tailContent) {
        entry.summary = curr.tailContent;
      }
      changes.push(entry);
    }
  }

  return changes;
}
