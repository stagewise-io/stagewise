import type { HotkeyActions } from '@shared/hotkeys';
import type { ReactNode } from 'react';

export type CommandCenterMode = 'global' | 'agents' | 'browser' | 'settings';

export const COMMAND_CENTER_MODES: CommandCenterMode[] = [
  'global',
  'agents',
  'browser',
  'settings',
];

export type CommandCenterItemKind = 'agent' | 'tab' | 'setting' | 'action';

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

export type SettingCommandItem = CommandCenterItemBase & {
  kind: 'setting';
  mode: 'settings';
  url: string;
};

export type ActionCommandItem = CommandCenterItemBase & {
  kind: 'action';
};

export type CommandCenterItem =
  | AgentCommandItem
  | TabCommandItem
  | SettingCommandItem
  | ActionCommandItem;

export type CommandCenterOpenOptions = {
  initialQuery?: string;
  initialMode?: CommandCenterMode;
  selectFirst?: boolean;
  restoreFocusOnClose?: boolean;
};

export type CommandCenterSourceResult<T extends CommandCenterItem> = {
  items: T[];
  isLoading?: boolean;
};
