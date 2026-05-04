import type { MentionItem } from '../types';
import type { MentionFileCandidate } from '@shared/karton-contracts/ui/agent/metadata';
import type { TabState, MountEntry } from '@shared/karton-contracts/ui';
import type { FileMentionItem } from '../types';

export interface MentionProviderIcon {
  id: string;
  className?: string;
}

export interface MentionContext {
  agentInstanceId: string | null;
  searchFiles:
    | ((agentId: string, query: string) => Promise<MentionFileCandidate[]>)
    | null;
  tabs: Record<string, TabState>;
  activeTabId: string | null;
  mounts: MountEntry[];
  /**
   * Called when a file mention is selected from the popup.
   * Allows the composer to register the file as a FileAttachment immediately
   * so the backend never needs to resolve mount paths from mention metadata.
   */
  onFileMentionSelected: ((item: FileMentionItem) => void) | null;
}

export interface MentionProvider {
  type: 'file' | 'tab' | 'workspace';
  groupLabel: string;
  /** Global importance multiplier (e.g. 1.3 for files, 1.0 for tabs). */
  boost: number;
  icon: React.ComponentType<MentionProviderIcon>;
  query: (
    input: string,
    ctx: MentionContext,
  ) => MentionItem[] | Promise<MentionItem[]>;
}
