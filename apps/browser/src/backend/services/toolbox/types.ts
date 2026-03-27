import type { ToolboxService } from '.';
import type { MountPermission } from '@shared/karton-contracts/ui/agent/metadata';

/**
 * Simplified snapshot of browser state for use in agents (e.g. system prompt building).
 */
export type BrowserSnapshot = {
  activeTab: BrowserTabInfo | null;
  tabs: (BrowserTabInfo & { lastFocusedAt: number })[];
  totalTabCount: number;
};

export type BrowserTabInfo = {
  id: string;
  title: string;
  url: string;
  error: { code: number; message?: string } | null;
  consoleLogCount: number;
  consoleErrorCount: number;
  faviconUrl?: string;
};

/**
 * Snapshot of workspace connection state and mounted paths.
 */
export type WorkspaceSnapshot = {
  mounts: Array<{
    prefix: string;
    path: string;
    permissions?: MountPermission[];
  }>;
};

/**
 * Narrowed type that only exposes the context-providing getters
 * from the Toolbox. Used by prompt/context builders to avoid pulling
 * in the complex `AllToolsUnion` generic when only data access is
 * needed.
 */
export type ToolboxContextProvider = Pick<
  ToolboxService,
  | 'getWorkspaceSnapshot'
  | 'getWorkspaceInfo'
  | 'getBrowserSnapshot'
  | 'getShellInfo'
  | 'captureEnvironmentSnapshot'
  | 'getWorkspaceMd'
  | 'getCommandsList'
  | 'globalDataPath'
>;
