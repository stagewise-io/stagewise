import type { KartonService } from '../services/karton';
import type { PagesService } from '../services/pages';
import type { DiffHistoryService } from '../services/diff-history';
import type { WindowLayoutService } from '../services/window-layout';
import type { ToolboxService } from '../services/toolbox';
import type { AgentManagerService } from '../services/agent-manager';
import type { AuthService } from '../services/auth';
import type { UserExperienceService } from '../services/experience';
import type { AutoUpdateService } from '../services/auto-update';
import type { Logger } from '../services/logger';

export function wirePagesHandlers(deps: {
  uiKarton: KartonService;
  pagesService: PagesService;
  diffHistoryService: DiffHistoryService;
  windowLayoutService: WindowLayoutService;
  toolboxService: ToolboxService;
  agentManagerService: AgentManagerService;
  authService: AuthService;
  userExperienceService: UserExperienceService;
  autoUpdateService: AutoUpdateService;
  logger: Logger;
}): void {
  const {
    uiKarton,
    pagesService,
    diffHistoryService,
    windowLayoutService,
    toolboxService,
    agentManagerService,
    authService,
    userExperienceService,
    autoUpdateService,
    logger,
  } = deps;

  // --- Pending edits read handler ---
  pagesService.setGetPendingEditsHandler(async (agentInstanceId: string) => {
    const pendingEdits =
      uiKarton.state.toolbox[agentInstanceId]?.pendingFileDiffs ?? [];
    return {
      found: true,
      edits: pendingEdits,
    };
  });

  // --- External file content handler ---
  pagesService.setGetExternalFileContentHandler(async (oid: string) => {
    return diffHistoryService.getExternalFileContent(oid);
  });

  // --- Certificate trust handler ---
  pagesService.setTrustCertificateAndReloadHandler(
    async (tabId: string, origin: string) => {
      windowLayoutService.trustCertificateAndReload(tabId, origin);
    },
  );

  // --- Context files handler ---
  pagesService.setGetContextFilesHandler(() =>
    toolboxService.getContextFilesForAllWorkspaces(),
  );

  // --- Workspace-md generation handler ---
  pagesService.setGenerateWorkspaceMdHandler(async (workspacePath) => {
    await agentManagerService.generateWorkspaceMdForPath(workspacePath);
  });

  // --- Auth handlers ---
  pagesService.setAuthHandlers({
    sendOtp: (email, turnstileToken) =>
      authService.sendOtp(email, turnstileToken),
    verifyOtp: (email, code) => authService.verifyOtp(email, code),
    logout: () => authService.logout(),
  });

  // --- Usage handlers ---
  pagesService.setUsageHandlers({
    getUsageCurrent: () => authService.getUsageCurrent(),
    getUsageHistory: (params) => authService.getUsageHistory(params.days),
  });

  // --- Wire user experience service into pages service ---
  pagesService.setUserExperienceService(userExperienceService);

  // --- Accept/reject pending edits handlers ---
  pagesService.setAcceptAllPendingEditsHandler(
    async (agentInstanceId: string) => {
      const pendingEdits =
        uiKarton.state.toolbox[agentInstanceId]?.pendingFileDiffs ?? [];
      if (pendingEdits.length === 0) {
        logger.warn(
          `[Main] acceptAllPendingEdits: no pending edits for agent instance ${agentInstanceId}`,
        );
        return;
      }
      await diffHistoryService.acceptAndRejectHunks(
        pendingEdits.flatMap((e) =>
          !e.isExternal ? e.hunks.map((h) => h.id) : [e.hunkId],
        ),
        [],
      );
    },
  );

  pagesService.setRejectAllPendingEditsHandler(
    async (agentInstanceId: string) => {
      const pendingEdits =
        uiKarton.state.toolbox[agentInstanceId]?.pendingFileDiffs ?? [];
      if (pendingEdits.length === 0) {
        logger.warn(
          `[Main] rejectAllPendingEdits: no pending edits for agent instance ${agentInstanceId}`,
        );
        return;
      }
      await diffHistoryService.acceptAndRejectHunks(
        [],
        pendingEdits.flatMap((e) =>
          !e.isExternal ? e.hunks.map((h) => h.id) : [e.hunkId],
        ),
      );
    },
  );

  pagesService.setAcceptPendingEditHandler(
    async (agentInstanceId: string, fileId: string) => {
      const pendingEdits =
        uiKarton.state.toolbox[agentInstanceId]?.pendingFileDiffs ?? [];
      if (pendingEdits.length === 0) {
        logger.warn(
          `[Main] acceptPendingEdit: no pending edits for agent instance ${agentInstanceId}`,
        );
        return;
      }
      const hunkIds = pendingEdits
        .filter((e) => e.fileId === fileId)
        .flatMap((e) =>
          !e.isExternal ? e.hunks.map((h) => h.id) : [e.hunkId],
        );
      await diffHistoryService.acceptAndRejectHunks(hunkIds, []);
    },
  );

  pagesService.setRejectPendingEditHandler(
    async (agentInstanceId: string, fileId: string) => {
      const pendingEdits =
        uiKarton.state.toolbox[agentInstanceId]?.pendingFileDiffs ?? [];
      if (pendingEdits.length === 0) {
        logger.warn(
          `[Main] rejectPendingEdit: no pending edits for agent instance ${agentInstanceId}`,
        );
        return;
      }
      const hunkIds = pendingEdits
        .filter((e) => e.fileId === fileId)
        .flatMap((e) =>
          !e.isExternal ? e.hunks.map((h) => h.id) : [e.hunkId],
        );
      await diffHistoryService.acceptAndRejectHunks([], hunkIds);
    },
  );

  // --- Auto-update handlers ---
  pagesService.setAutoUpdateHandlers({
    checkForUpdates: () => autoUpdateService.checkForUpdates(),
    quitAndInstall: () => autoUpdateService.quitAndInstall(),
  });
}
