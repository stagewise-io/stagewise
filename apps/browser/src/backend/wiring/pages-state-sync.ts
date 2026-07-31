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

  // --- Pending app message sync (uiKarton -> pages) ---
  syncDerivedState(
    uiKarton,
    (state) => {
      const messages: Record<
        string,
        { appId: string; pluginId?: string; data: unknown } | null
      > = {};
      for (const agentId in state.toolbox) {
        const message = state.toolbox[agentId]?.pendingAppMessage;
        if (message !== undefined) messages[agentId] = message ?? null;
      }
      return messages;
    },
    (messages) => {
      for (const [agentId, message] of Object.entries(messages)) {
        pagesService.updatePendingAppMessageState(agentId, message);
      }
    },
  );

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
