import type { HotkeyActions } from '@shared/hotkeys';
import type { ReactNode } from 'react';
import type { RunningServerOwner } from '@shared/karton-contracts/ui';
import type { SettingsRoute } from '@shared/settings-route';

export type CommandCenterMode =
  | 'global'
  | 'agents'
  | 'browser'
  | 'terminals'
  | 'settings'
  | 'files';

export const COMMAND_CENTER_MODES: CommandCenterMode[] = [
  'global',
  'agents',
  'browser',
  'terminals',
  'files',
  'settings',
];

export type CommandCenterItemKind =
  | 'agent'
  | 'tab'
  | 'terminal'
  | 'setting'
  | 'action'
  | 'file';

export type CommandCenterShortcut = {
  action?: HotkeyActions;
  accelerator?: string;
  display?: string;
};

export type CommandCenterItemBase = {
  id: string;
  kind: CommandCenterItemKind;
  mode: CommandCenterMode;
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon?: ReactNode;
  shortcut?: CommandCenterShortcut;
  disabled?: boolean;
  score?: number;
};

export type AgentCommandItem = CommandCenterItemBase & {
  kind: 'agent';
  mode: 'agents';
  agentId: string;
  isLive: boolean;
  isWorking: boolean;
  isWaitingForUser: boolean;
  hasError: boolean;
  unread: boolean;
  isPinned: boolean;
  lastMessageAt: number;
};

export type TabCommandItem = CommandCenterItemBase & {
  kind: 'tab';
  mode: 'browser';
  tabId: string;
  url: string;
  agentInstanceId: string | null;
  faviconUrls: string[];
  screenshot: string | null;
  isActive: boolean;
  isPinned: boolean;
  lastFocusedAt: number;
};

export type TerminalCommandItem = CommandCenterItemBase & {
  kind: 'terminal';
  mode: 'terminals';
  owner: RunningServerOwner;
  isActive: boolean;
  lastFocusedAt: number;
};

export type SettingCommandItem = CommandCenterItemBase & {
  kind: 'setting';
  mode: 'settings';
  url: string;
  settingsRoute?: SettingsRoute;
};

export type FileContentMatch = {
  lineNumber: number;
  line: string;
};

export type FileCommandItem = CommandCenterItemBase & {
  kind: 'file';
  mode: 'files';
  relativePath: string;
  mountPrefix: string;
  workspaceKey: string;
  fileName: string;
  isDirectory: boolean;
  contentMatches?: FileContentMatch[];
  contentMatchQuery?: string;
};

export type ActionCommandItem = CommandCenterItemBase & {
  kind: 'action';
};

export type CommandCenterItem =
  | AgentCommandItem
  | TabCommandItem
  | TerminalCommandItem
  | SettingCommandItem
  | FileCommandItem
  | ActionCommandItem;

export type CommandCenterOpenOptions = {
  initialQuery?: string;
  initialMode?: CommandCenterMode;
  selectFirst?: boolean;
  restoreFocusOnClose?: boolean;
  /**
   * Workspace keys to preselect as the only search targets in "files" mode.
   * An empty/omitted value means "search all workspaces".
   */
  initialFileWorkspaceKeys?: string[];
  initialSearchInContent?: boolean;
};

export type CommandCenterSourceResult<T extends CommandCenterItem> = {
  items: T[];
  isLoading?: boolean;
};
