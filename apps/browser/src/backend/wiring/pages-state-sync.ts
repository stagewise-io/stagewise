import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import { syncDerivedState } from '../utils/sync-derived-state';
import type { KartonService } from '../services/karton';
import type { PagesService } from '../services/pages';
import type { WebDataService } from '../services/webdata';
import type { GlobalConfigService } from '../services/global-config';
import type { AuthService } from '../services/auth';
import type { Logger } from '../services/logger';
import type { TelemetryService } from '../services/telemetry';

export async function wirePagesStateSync(deps: {
  uiKarton: KartonService;
  pagesService: PagesService;
  webDataService: WebDataService;
  globalConfigService: GlobalConfigService;
  authService: AuthService;
  logger: Logger;
  telemetryService: TelemetryService;
}): Promise<void> {
  const {
    uiKarton,
    pagesService,
    webDataService,
    globalConfigService,
    authService,
    logger,
    telemetryService,
  } = deps;

  // --- Pending edits sync (uiKarton -> pages) ---
  // Uses a per-agent snapshot map since each agent instance is tracked independently
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

  // --- Workspace-MD generating state sync (uiKarton -> pages) ---
  syncDerivedState(
    uiKarton,
    (state) => {
      const generating: Record<string, boolean> = {};
      for (const agentId in state.agents.instances) {
        const inst = state.agents.instances[agentId];
        if (inst.type !== AgentTypes.WORKSPACE_MD) continue;
        if (!inst.state.isWorking) continue;
        const path = state.toolbox[agentId]?.workspace?.mounts?.[0]?.path;
        if (path) generating[path] = true;
      }
      return generating;
    },
    (generating) => pagesService.syncWorkspaceMdGeneratingState(generating),
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
        isGitRepo: m.isGitRepo,
        gitBranch: m.gitBranch,
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

  // --- Auto-update state sync (uiKarton -> pages) ---
  syncDerivedState(
    uiKarton,
    (state) => state.autoUpdate,
    (autoUpdate) => pagesService.syncAutoUpdateState(autoUpdate),
  );

  // --- Shell sessions sync (uiKarton -> pages) ---
  syncDerivedState(
    uiKarton,
    (state) => {
      const result: Record<
        string,
        (typeof state.toolbox)[string]['shells'] extends
          | { sessions: infer S }
          | undefined
          ? S extends Array<infer T>
            ? T[]
            : never
          : never
      > = {};
      for (const agentId in state.toolbox) {
        const shells = state.toolbox[agentId]?.shells;
        if (shells?.sessions?.length) result[agentId] = shells.sessions;
      }
      return result;
    },
    (sessions) => pagesService.syncShellSessionsState(sessions),
  );

  // --- Shell terminal streaming chunks sync (uiKarton -> pages) ---
  // Uses a flat key `agentInstanceId:sessionId` for the pages contract.
  // Track last-synced array refs so we only push when Immer produces new data.
  const lastSyncedChunkRefs = new Map<string, string[]>();
  uiKarton.registerStateChangeCallback((state) => {
    const chunks: Record<string, string[]> = {};
    let hasNew = false;
    const seenKeys = new Set<string>();
    for (const agentId in state.toolbox) {
      const pending = state.toolbox[agentId]?.pendingShellTerminalChunks;
      if (!pending) continue;
      for (const sessionId in pending) {
        const arr = pending[sessionId];
        if (!arr?.length) continue;
        const key = `${agentId}:${sessionId}`;
        chunks[key] = arr;
        seenKeys.add(key);
        if (lastSyncedChunkRefs.get(key) !== arr) hasNew = true;
      }
    }
    // Detect removed keys as changes too
    if (!hasNew) {
      for (const key of lastSyncedChunkRefs.keys()) {
        if (!seenKeys.has(key)) {
          hasNew = true;
          break;
        }
      }
    }
    if (hasNew) {
      // Update tracked refs
      lastSyncedChunkRefs.clear();
      for (const [key, arr] of Object.entries(chunks))
        lastSyncedChunkRefs.set(key, arr);

      pagesService.syncPendingShellTerminalChunks(chunks);
    }
  });

  // --- Search engines sync (webDataService -> uiKarton + pages) ---
  const syncSearchEnginesToUiKarton = async () => {
    const engines = await webDataService.getSearchEngines();
    uiKarton.setState((draft) => {
      draft.searchEngines = engines;
    });
  };
  await syncSearchEnginesToUiKarton();
  pagesService.setOnSearchEnginesChangeHandler(syncSearchEnginesToUiKarton);

  // --- Global config bidirectional sync ---
  pagesService.syncGlobalConfigState(globalConfigService.get());
  pagesService.registerGlobalConfigHandler(async (config) => {
    await globalConfigService.set(config);
  });
  globalConfigService.addConfigUpdatedListener((newConfig) => {
    pagesService.syncGlobalConfigState(newConfig);
  });

  // --- Auth state sync ---
  authService.registerAuthStateChangeCallback((newAuthState) => {
    if (newAuthState.user) {
      logger.debug(
        '[Main] User logged in, identifying user and setting user properties...',
      );
      telemetryService.setUserProperties({
        user_id: newAuthState.user?.id,
        user_email: newAuthState.user?.email,
      });
      telemetryService.identifyUser();
    } else
      logger.debug('[Main] No user data available, not identifying user...');

    pagesService.syncUserAccountState(newAuthState);
  });
  pagesService.syncUserAccountState(authService.authState);
}
