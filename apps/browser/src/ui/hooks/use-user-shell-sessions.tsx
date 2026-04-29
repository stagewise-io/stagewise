import { useKartonState, useComparingSelector } from '@ui/hooks/use-karton';
import { USER_OWNER_ID } from '@shared/karton-contracts/ui';
import type { ShellSessionSnapshot } from '@shared/karton-contracts/ui/agent/metadata';

const EMPTY_SHELL_SESSIONS: ShellSessionSnapshot[] = [];

/**
 * Live list of user-owned terminal sessions. Wraps the
 * `state.toolbox[USER_OWNER_ID].shells.sessions` lookup so callers
 * don't deal with the sentinel, and centralises the equality check
 * that suppresses re-renders on every shells-manifest push.
 */
export function useUserShellSessions(): ShellSessionSnapshot[] {
  return useKartonState(
    useComparingSelector(
      (s): ShellSessionSnapshot[] =>
        s.toolbox[USER_OWNER_ID]?.shells?.sessions ?? EMPTY_SHELL_SESSIONS,
      (a, b) => {
        if (a === b) return true;
        if (a.length !== b.length) return false;
        return a.every(
          (s, i) =>
            s.id === b[i]?.id &&
            s.exited === b[i]?.exited &&
            s.lineCount === b[i]?.lineCount &&
            s.tailContent === b[i]?.tailContent &&
            s.lastLine === b[i]?.lastLine,
        );
      },
    ),
  );
}
