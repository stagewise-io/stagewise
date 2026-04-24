import type { Logger } from '@/services/logger';
import type { DiffHistoryService } from '@/services/diff-history';
import type { TelemetryService } from '@/services/telemetry';
import type { MountManagerService } from '../services/mount-manager';
import type { FileDiffHandler } from '../../sandbox';

interface FileDiffHandlerDeps {
  mountManager: MountManagerService;
  diffHistoryService: DiffHistoryService;
  logger: Logger;
  telemetryService: TelemetryService;
}

/**
 * Creates a handler for file-diff-notification messages from the sandbox
 * worker. The worker captures before/after state in-process and sends
 * it via fire-and-forget IPC. This handler registers the edit with
 * diff-history and syncs with LSP.
 */
export function createFileDiffHandler(
  deps: FileDiffHandlerDeps,
): FileDiffHandler {
  return async (
    agentId,
    absolutePath,
    before,
    after,
    isExternal,
    _bytesWritten,
    toolCallId,
  ) => {
    deps.diffHistoryService.ignoreFileForWatcher(absolutePath);

    // Resolve the owning workspace for the gitignore-aware filter in
    // DiffHistoryService.registerAgentEdit. `findWorkspaceForFile`
    // returns undefined when the path is outside any mount; map to
    // null so the downstream walk-up fallback runs.
    const workspaceRoot =
      deps.mountManager.findWorkspaceForFile(agentId, absolutePath) ?? null;

    try {
      if (isExternal) {
        await deps.diffHistoryService.registerAgentEdit({
          agentInstanceId: agentId,
          path: absolutePath,
          toolCallId,
          workspaceRoot,
          isExternal: true,
          tempPathToBeforeContent: null,
          tempPathToAfterContent: null,
        });
      } else {
        // Sync with LSP for text content
        if (after !== null) {
          deps.mountManager
            .syncFileWithLsp(agentId, absolutePath, after)
            .catch((err) => {
              deps.logger.error('[ToolboxService] LSP sync failed', {
                error: err,
                path: absolutePath,
              });
              deps.telemetryService.captureException(err as Error, {
                service: 'toolbox',
                operation: 'syncFileWithLsp',
                path: absolutePath,
              });
            });
        } else if (before !== null) {
          deps.mountManager
            .syncFileCloseWithLsp(agentId, absolutePath)
            .catch((err) => {
              deps.logger.error('[ToolboxService] LSP file close failed', {
                error: err,
                path: absolutePath,
              });
              deps.telemetryService.captureException(err as Error, {
                service: 'toolbox',
                operation: 'syncFileCloseWithLsp',
                path: absolutePath,
              });
            });
        }

        await deps.diffHistoryService.registerAgentEdit({
          agentInstanceId: agentId,
          path: absolutePath,
          toolCallId,
          workspaceRoot,
          isExternal: false,
          contentBefore: before,
          contentAfter: after,
        });
      }
    } catch (error) {
      deps.logger.error(
        '[ToolboxService] Failed to register sandbox file diff',
        { error, path: absolutePath, toolCallId },
      );
      deps.telemetryService.captureException(error as Error, {
        service: 'toolbox',
        operation: 'registerSandboxDiff',
        path: absolutePath,
        toolCallId,
      });
    } finally {
      setTimeout(
        () => deps.diffHistoryService.unignoreFileForWatcher(absolutePath),
        500,
      );
    }
  };
}
