import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SelectedElement } from '@shared/selected-elements';
import type { Attachment } from '@shared/karton-contracts/ui/agent/metadata';

/**
 * Context for providing all attachment data within a message scope.
 * This allows child components (attachment views) to access attachment data
 * without prop drilling or rehydration.
 *
 * In view mode, data comes from message metadata.
 * In edit mode, data comes from local state + Karton state.
 */

interface MessageAttachmentsContext {
  /** Selected DOM elements */
  elements: SelectedElement[];
  /** Path-based attachments (workspace files or att/ blobs) */
  attachments: Attachment[];
}

const MessageAttachmentsContext = createContext<MessageAttachmentsContext>({
  elements: [],
  attachments: [],
});

interface MessageAttachmentsProviderProps {
  children: ReactNode;
  /** Selected DOM elements */
  elements: SelectedElement[];
  /** Path-based attachments */
  attachments?: Attachment[];
}

export function MessageAttachmentsProvider({
  children,
  elements,
  attachments = [],
}: MessageAttachmentsProviderProps) {
  const value = useMemo(
    () => ({ elements, attachments }),
    [elements, attachments],
  );

  return (
    <MessageAttachmentsContext.Provider value={value}>
      {children}
    </MessageAttachmentsContext.Provider>
  );
}

/**
 * Hook to access all attachment data in the current message scope.
 * Returns empty arrays if used outside of a MessageAttachmentsProvider.
 */
export function useMessageAttachments() {
  return useContext(MessageAttachmentsContext);
}
