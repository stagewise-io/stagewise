import { syncDerivedState } from '../utils/sync-derived-state';
import type { KartonService } from '../services/karton';
import type { PagesService } from '../services/pages';
import type { GlobalConfigService } from '../services/global-config';
import type { Logger } from '../services/logger';

export async function wirePagesStateSync(deps: {
  uiKarton: KartonService;
  pagesService: PagesService;
  globalConfigService: GlobalConfigService;
  logger: Logger;
}): Promise<void> {
  const { uiKarton, pagesService, globalConfigService, logger } = deps;

  // --- Pending edits sync (uiKarton -> pages) ---
  const previousPendingEditsSnapshots = new Map<string, string>();

  const hashContent = (s: string | null | undefined): string => {
    if (!s) return '0';
    const mid = Math.floor(s.length / 2);
    return `${s.length}:${s.slice(0, 8)}:${s.slice(-8)}:${s[mid] ?? ''}`;
  };

  uiKarton.registerStateChangeCallback((state) => {
    const activeAgentInstanceIds = Object.keys(state.agents.instances);

    for (const agentInstanceId of activeAgentInstanceIds) {
      const pendingEdits =
        state.toolbox[agentInstanceId]?.pendingFileDiffs ?? [];

      const snapshotKey = `${pendingEdits
        .map(
          (e) =>
            `${e.path}|${e.isExternal ? `${e.baselineOid}|${e.currentOid}` : `${hashContent(e.baseline)}|${hashContent(e.current)}`}`,
        )
        .join('||')}`;

      const previousSnapshot =
        previousPendingEditsSnapshots.get(agentInstanceId) ?? '';
      if (snapshotKey !== previousSnapshot) {
        previousPendingEditsSnapshots.set(agentInstanceId, snapshotKey);
        pagesService.updatePendingEditsState(agentInstanceId, pendingEdits);
      }
    }
  });

  // --- Workspace mounts sync (uiKarton -> pages) ---
  syncDerivedState(
    uiKarton,
    (state) => {
      const seen = new Map<
        string,
        (typeof state.toolbox)[string]['workspace']['mounts'][number]
      >();
      for (const agentId in state.toolbox) {
        const mounts = state.toolbox[agentId]?.workspace?.mounts;
        if (!mounts) continue;
        for (const mount of mounts)
          if (!seen.has(mount.path)) seen.set(mount.path, mount);
      }
      return [...seen.values()].map((m) => ({
        prefix: m.prefix,
        path: m.path,
        git: m.git,
        skills: m.skills,
        workspaceMdContent: m.workspaceMdContent,
        agentsMdContent: m.agentsMdContent,
      }));
    },
    (mounts) => pagesService.syncWorkspaceMountsState(mounts),
  );

  // --- Global plans sync (uiKarton -> pages) ---
  syncDerivedState(
    uiKarton,
    (state) => state.plans,
    (plans) => pagesService.syncPlansState(plans),
  );

  // --- Global config bidirectional sync ---
  pagesService.syncGlobalConfigState(globalConfigService.get());
  globalConfigService.addConfigUpdatedListener((newConfig) => {
    pagesService.syncGlobalConfigState(newConfig);
  });

  logger.debug('[pages-state-sync] State sync initialized');
}
