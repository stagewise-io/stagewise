import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useRef,
} from 'react';

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
  const prevRef = useRef<Record<AttachmentId, AttachmentMetadata>>({});

  const attachmentMetadata = useMemo(() => {
    const record: Record<AttachmentId, AttachmentMetadata> = {};

    for (const message of messages) {
      // Collect attachments — keyed by path
      message.metadata?.attachments?.forEach((f) => {
        record[f.path] = f;
      });
    }

    // Stabilize: reuse previous reference when the record contents
    // haven't changed. Attachments are set once per message and never
    // mutate during streaming, so this short-circuits on every chunk.
    const prev = prevRef.current;
    const newKeys = Object.keys(record);
    const prevKeys = Object.keys(prev);
    if (
      newKeys.length === prevKeys.length &&
      newKeys.every((k) => prev[k] === record[k])
    ) {
      return prev;
    }

    prevRef.current = record;
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
