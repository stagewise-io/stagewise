/**
 * `shells` host {@link DomainAdapter}.
 *
 * Owns the PTY-session manifest for the host. The full-state render is
 * the `<shell>` (platform + login-shell info) and `<shell-sessions>`
 * blocks embedded in every system prompt; the delta render reports
 * session-started/exited/new-output events.
 *
 * The shell info (platform + shell-type/path) is sourced from the host
 * via `getShellInfo` and bundled into `state` so it survives history
 * compression and resume. It is effectively constant per-process, so
 * the default equality check on `state` only changes when sessions
 * change.
 */
import type { DomainAdapter } from '@stagewise/agent-core/env';
import {
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from '@stagewise/agent-core/env';
import type { ShellSnapshot } from '@shared/env-domain-schemas';
import { z } from 'zod';
import { shellSnapshotSchema } from '@shared/env-domain-schemas';
import ShellsDomainPromptSection from './shells-domain-adapter.prompt.md?raw';

export const SHELLS_DOMAIN_SCHEMA_VERSION = 1;

export const shellInfoSchema = z
  .object({
    platform: z.string(),
    type: z.string(),
    path: z.string(),
  })
  .nullable();
export type ShellInfoState = z.infer<typeof shellInfoSchema>;

export const shellsDomainStateSchema = z.object({
  shellInfo: shellInfoSchema,
  shells: shellSnapshotSchema,
});
export type ShellsDomainState = z.infer<typeof shellsDomainStateSchema>;

export interface ShellsDomainAdapterDeps {
  /**
   * Returns the live shell manifest for the given agent. Implementations
   * may return the canonical empty `{ sessions: [] }` when no shell
   * service is mounted.
   */
  getSnapshot: (agentInstanceId: string) => ShellSnapshot;
  /**
   * Returns the per-process platform + login-shell info. The string is
   * `process.platform` at the time of capture. `null` if the host
   * has not configured a shell.
   */
  getShellInfo: () => ShellInfoState;
}

function renderFullShells(state: ShellsDomainState): string {
  const parts: string[] = [];
  if (state.shellInfo) {
    parts.push(
      `<shell>\nPlatform: ${state.shellInfo.platform}\nShell: ${state.shellInfo.type} (${state.shellInfo.path})\n</shell>`,
    );
  }
  const activeSessions = state.shells.sessions.filter((s) => !s.exited);
  if (activeSessions.length > 0) {
    const sessionTags = activeSessions.map(
      (s) => `  <session id="${escAttr(s.id)}" cwd="${escAttr(s.cwd)}" />`,
    );
    parts.push(
      `<shell-sessions>\n${sessionTags.join('\n')}\n</shell-sessions>`,
    );
  }
  return parts.join('\n\n');
}

function computeShellsChanges(
  previous: ShellsDomainState,
  current: ShellsDomainState,
): EnvironmentChangeEntry[] {
  const changes: EnvironmentChangeEntry[] = [];
  const prevMap = new Map(previous.shells.sessions.map((s) => [s.id, s]));
  const currMap = new Map(current.shells.sessions.map((s) => [s.id, s]));

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
      const entry: EnvironmentChangeEntry = {
        type: 'shell-session-started',
        attributes: {
          sessionId: id,
          lineCount: String(curr.lineCount),
          logPath: curr.logPath,
        },
      };
      if (curr.tailContent) entry.summary = curr.tailContent;
      changes.push(entry);
      continue;
    }

    if (!prev.exited && curr.exited) {
      const entry: EnvironmentChangeEntry = {
        type: 'shell-session-exited',
        attributes: {
          sessionId: id,
          exitCode: String(curr.exitCode ?? '?'),
          logPath: curr.logPath,
        },
      };
      if (curr.tailContent) entry.summary = curr.tailContent;
      changes.push(entry);
      continue;
    }

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
      if (curr.tailContent) entry.summary = curr.tailContent;
      changes.push(entry);
    }
  }

  return changes;
}

export function createShellsDomainAdapter(
  deps: ShellsDomainAdapterDeps,
): DomainAdapter<ShellsDomainState> {
  return {
    domainId: 'shells',
    renderOrder: 2,
    schemaVersion: SHELLS_DOMAIN_SCHEMA_VERSION,
    promptSection: ShellsDomainPromptSection,
    getState(agentInstanceId) {
      return {
        shellInfo: deps.getShellInfo(),
        shells: deps.getSnapshot(agentInstanceId),
      };
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullShells(curr);
      return renderChangesXml(computeShellsChanges(prev, curr));
    },
  };
}
