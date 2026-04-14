import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type {
  ActiveAppSnapshot,
  AgentsMdSnapshot,
  BrowserSnapshot,
  EnabledSkillsSnapshot,
  EnvironmentSnapshot,
  FullEnvironmentSnapshot,
  PlansSnapshot,
  ShellSnapshot,
  WorkspaceMdSnapshot,
  WorkspaceSnapshot,
} from '@shared/karton-contracts/ui/agent/metadata';
import type { EnvironmentDiffSnapshot } from '@shared/karton-contracts/ui/shared-types';

/**
 * Walks backward through message history to reconstruct the full
 * effective environment snapshot at `upToIndex` by collecting the
 * most recent defined value for each domain.
 *
 * Returns `null` when no complete snapshot can be assembled (e.g.
 * no messages carry any snapshot data).
 */
export function resolveEffectiveSnapshot(
  messages: AgentMessage[],
  upToIndex: number,
): FullEnvironmentSnapshot | null {
  let browser: BrowserSnapshot | undefined;
  let workspace: WorkspaceSnapshot | undefined;
  let fileDiffs: EnvironmentDiffSnapshot | undefined;
  let sandboxSessionId: string | null | undefined;
  let activeApp: ActiveAppSnapshot | undefined;
  let agentsMd: AgentsMdSnapshot | undefined;
  let workspaceMd: WorkspaceMdSnapshot | undefined;
  let enabledSkills: EnabledSkillsSnapshot | undefined;
  let browserSessionId: string | undefined;
  let plans: PlansSnapshot | undefined;
  let shells: ShellSnapshot | undefined;

  for (let i = upToIndex; i >= 0; i--) {
    const snap = messages[i]?.metadata?.environmentSnapshot;
    if (!snap) continue;
    if (browser === undefined && snap.browser !== undefined)
      browser = snap.browser;
    if (workspace === undefined && snap.workspace !== undefined)
      workspace = snap.workspace;
    if (fileDiffs === undefined && snap.fileDiffs !== undefined)
      fileDiffs = snap.fileDiffs;
    if (sandboxSessionId === undefined && snap.sandboxSessionId !== undefined)
      sandboxSessionId = snap.sandboxSessionId;
    if (activeApp === undefined && snap.activeApp !== undefined)
      activeApp = snap.activeApp;
    if (agentsMd === undefined && snap.agentsMd !== undefined)
      agentsMd = snap.agentsMd;
    if (workspaceMd === undefined && snap.workspaceMd !== undefined)
      workspaceMd = snap.workspaceMd;
    if (enabledSkills === undefined && snap.enabledSkills !== undefined)
      enabledSkills = snap.enabledSkills;
    if (browserSessionId === undefined && snap.browserSessionId !== undefined)
      browserSessionId = snap.browserSessionId;
    if (plans === undefined && snap.plans !== undefined) plans = snap.plans;
    if (shells === undefined && snap.shells !== undefined) shells = snap.shells;
    if (
      browser !== undefined &&
      workspace !== undefined &&
      fileDiffs !== undefined &&
      sandboxSessionId !== undefined &&
      activeApp !== undefined &&
      agentsMd !== undefined &&
      workspaceMd !== undefined &&
      enabledSkills !== undefined &&
      browserSessionId !== undefined &&
      plans !== undefined &&
      shells !== undefined
    )
      break;
  }

  if (
    browser === undefined ||
    workspace === undefined ||
    fileDiffs === undefined ||
    sandboxSessionId === undefined ||
    activeApp === undefined
  )
    return null;

  return {
    browser,
    workspace,
    fileDiffs,
    sandboxSessionId,
    activeApp,
    agentsMd: agentsMd ?? { entries: [], respectedMounts: [] },
    workspaceMd: workspaceMd ?? { entries: [] },
    enabledSkills: enabledSkills ?? { paths: [] },
    browserSessionId: browserSessionId ?? '',
    plans: plans ?? { entries: [] },
    shells: shells ?? { sessions: [] },
  };
}

/**
 * Shallow-recursive deep equality check that short-circuits on first
 * difference. Avoids the string allocation overhead of JSON.stringify.
 */
/**
 * Returns a copy of the shell snapshot with `tailContent` stripped from
 * each session. Used to prevent ephemeral preview data from triggering
 * false-positive diffs in sparsification.
 */
function shellsWithoutTail(snap: ShellSnapshot): ShellSnapshot {
  return {
    sessions: snap.sessions.map(({ tailContent: _, ...rest }) => rest),
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.hasOwn(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

/**
 * Compares a full live snapshot against a previously resolved effective
 * snapshot and returns a sparse snapshot containing only the domains
 * that differ.
 *
 * When `previous` is `null` (first message / keyframe), the full
 * snapshot is returned as-is so every domain is present.
 */
export function sparsifySnapshot(
  full: FullEnvironmentSnapshot,
  previous: FullEnvironmentSnapshot | null,
): EnvironmentSnapshot {
  if (!previous) return { ...full };

  const sparse: EnvironmentSnapshot = {};

  if (!deepEqual(full.browser, previous.browser)) sparse.browser = full.browser;
  if (!deepEqual(full.workspace, previous.workspace))
    sparse.workspace = full.workspace;
  if (!deepEqual(full.fileDiffs, previous.fileDiffs))
    sparse.fileDiffs = full.fileDiffs;
  if (full.sandboxSessionId !== previous.sandboxSessionId)
    sparse.sandboxSessionId = full.sandboxSessionId;
  if (!deepEqual(full.activeApp, previous.activeApp))
    sparse.activeApp = full.activeApp;
  if (!deepEqual(full.agentsMd, previous.agentsMd))
    sparse.agentsMd = full.agentsMd;
  if (!deepEqual(full.workspaceMd, previous.workspaceMd))
    sparse.workspaceMd = full.workspaceMd;
  if (!deepEqual(full.enabledSkills, previous.enabledSkills))
    sparse.enabledSkills = full.enabledSkills;
  if (full.browserSessionId !== previous.browserSessionId)
    sparse.browserSessionId = full.browserSessionId;
  if (!deepEqual(full.plans, previous.plans)) sparse.plans = full.plans;
  if (
    !deepEqual(
      shellsWithoutTail(full.shells),
      shellsWithoutTail(previous.shells),
    )
  )
    sparse.shells = full.shells;

  return sparse;
}
