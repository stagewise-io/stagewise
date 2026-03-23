import { type ReactNode, createContext, useContext, useMemo } from 'react';

import type { AttachmentMetadata } from '@shared/karton-contracts/ui/agent/metadata';
export type { AttachmentMetadata };

import type { AgentMessage } from '@shared/karton-contracts/ui/agent';

type AttachmentId = string;

interface AttachmentMetadataContextValue {
  attachmentMetadata: Record<AttachmentId, AttachmentMetadata>;
}

const AttachmentMetadataContext =
  createContext<AttachmentMetadataContextValue | null>(null);

interface AttachmentMetadataProviderProps {
  children: ReactNode;
  messages: AgentMessage[];
}

export const AttachmentMetadataProvider = ({
  children,
  messages,
}: AttachmentMetadataProviderProps) => {
  const attachmentMetadata = useMemo(() => {
    const record: Record<AttachmentId, AttachmentMetadata> = {};

    for (const message of messages) {
      // Collect attachments — keyed by path
      message.metadata?.attachments?.forEach((f) => {
        record[f.path] = f;
      });
    }

    return record;
  }, [messages]);

  const value = useMemo(
    () => ({
      attachmentMetadata,
    }),
    [attachmentMetadata],
  );

  return (
    <AttachmentMetadataContext.Provider value={value}>
      {children}
    </AttachmentMetadataContext.Provider>
  );
};

/**
 * Hook to access attachment metadata from all messages in the chat.
 * Returns a record mapping attachment IDs to their metadata (files, text clips, elements).
 */
export function useAttachmentMetadata() {
  const context = useContext(AttachmentMetadataContext);
  if (!context) {
    throw new Error(
      'useAttachmentMetadata must be used within an AttachmentMetadataProvider',
    );
  }
  return context.attachmentMetadata;
}
