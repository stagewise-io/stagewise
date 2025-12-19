import { type ReactNode, createContext, useMemo, useRef } from 'react';
import { useContext, useState, useCallback } from 'react';
import { usePlugins } from './use-plugins';
import {
  generateId,
  collectUserMessageMetadata,
  fileToDataUrl,
  isAnthropicSupportedFile,
} from '@/utils';
import { useKartonProcedure, useKartonState } from './use-karton';
import type { ChatMessage, FileUIPart } from '@shared/karton-contracts/ui';
import type { ContextElement } from '@shared/context-elements';

interface ContextSnippet {
  promptContextName: string;
  content: (() => string | Promise<string>) | string;
}

export type PluginContextSnippets = {
  pluginName: string;
  contextSnippets: ContextSnippet[];
};

export interface FileAttachment {
  id: string;
  file: File;
  url: string;
}

interface ChatContext {
  // Chat content operations
  chatInput: string;
  setChatInput: (value: string) => void;
  sendMessage: () => void;

  // File attachments
  fileAttachments: FileAttachment[];
  addFileAttachment: (file: File) => void;
  removeFileAttachment: (id: string) => void;
  clearFileAttachments: () => void;

  // Context elements
  selectedElements: ContextElement[];
  removeSelectedElement: (elementId: string) => void;

  // UI state
  isSending: boolean;
}

const ChatHistoryContext = createContext<ChatContext>({
  chatInput: '',
  setChatInput: () => {},
  sendMessage: () => {},
  fileAttachments: [],
  addFileAttachment: () => {},
  removeFileAttachment: () => {},
  clearFileAttachments: () => {},
  selectedElements: [],
  removeSelectedElement: () => {},
  isSending: false,
});

// Separate context for stable actions that don't change - prevents unnecessary re-renders
interface ChatActionsContext {
  setChatInput: (value: string) => void;
}

const ChatActionsContextValue = createContext<ChatActionsContext>({
  setChatInput: () => {},
});

interface ChatStateProviderProps {
  children: ReactNode;
}

export const ChatStateProvider = ({ children }: ChatStateProviderProps) => {
  const [chatInput, setChatInput] = useState<string>('');

  const _isContextSelectorMode = useKartonState(
    (s) => s.browser.contextSelectionMode,
  );
  const clearContextElements = useKartonProcedure(
    (p) => p.browser.contextSelection.clearElements,
  );
  const setContextSelectionActive = useKartonProcedure(
    (p) => p.browser.contextSelection.setActive,
  );

  const selectedElements = useKartonState((s) => s.browser.selectedElements);
  const removeSelectedElement = useKartonProcedure(
    (p) => p.browser.contextSelection.removeElement,
  );

  const [isSending, setIsSending] = useState<boolean>(false);

  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);

  const { plugins } = usePlugins();

  const sendChatMessage = useKartonProcedure(
    (p) => p.agentChat.sendUserMessage,
  );

  const addFileAttachment = useCallback((file: File) => {
    const id = generateId();
    const url = URL.createObjectURL(file);
    setFileAttachments((prev) => [...prev, { id, file, url }]);
  }, []);

  const removeFileAttachment = useCallback((id: string) => {
    setFileAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearFileAttachments = useCallback(() => {
    setFileAttachments((prev) => {
      prev.forEach((attachment) => {
        URL.revokeObjectURL(attachment.url);
      });
      return [];
    });
  }, []);

  const _startContextSelector = useCallback(() => {
    setContextSelectionActive(true);
  }, []);

  const _stopContextSelector = useCallback(() => {
    setContextSelectionActive(false);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!chatInput.trim()) return;

    setIsSending(true);

    try {
      // Filter only supported file attachments (type and size)
      const supportedAttachments = fileAttachments.filter(
        (attachment) => isAnthropicSupportedFile(attachment.file).supported,
      );

      // Convert supported file attachments to FileUIPart
      const fileParts: FileUIPart[] = await Promise.all(
        supportedAttachments.map(async (attachment) => ({
          type: 'file' as const,
          mediaType: attachment.file.type,
          filename: attachment.file.name,
          url: await fileToDataUrl(attachment.file),
        })),
      );

      // Collect metadata for selected elements
      const metadata = collectUserMessageMetadata(selectedElements);

      const message: ChatMessage = {
        id: generateId(),
        parts: [...fileParts, { type: 'text' as const, text: chatInput }],
        role: 'user',
        metadata: {
          ...metadata,
          createdAt: new Date(),
        },
      };

      // Reset state after sending
      setChatInput('');
      clearContextElements();
      clearFileAttachments();

      // Send the message using the chat capability
      await sendChatMessage(message);
    } finally {
      setIsSending(false);
    }
  }, [
    chatInput,
    fileAttachments,
    plugins,
    sendChatMessage,
    clearFileAttachments,
    clearContextElements,
    selectedElements,
  ]);

  const value: ChatContext = useMemo(
    () => ({
      chatInput,
      setChatInput,
      sendMessage,
      fileAttachments,
      addFileAttachment,
      removeFileAttachment,
      clearFileAttachments,
      selectedElements,
      removeSelectedElement,
      isSending,
    }),
    [
      chatInput,
      sendMessage,
      fileAttachments,
      addFileAttachment,
      removeFileAttachment,
      clearFileAttachments,
      selectedElements,
      removeSelectedElement,
      isSending,
    ],
  );

  // Stable actions context - setChatInput from useState is already stable
  const actionsValue: ChatActionsContext = useMemo(
    () => ({
      setChatInput,
    }),
    [], // setChatInput from useState is stable and never changes
  );

  return (
    <ChatActionsContextValue.Provider value={actionsValue}>
      <ChatHistoryContext.Provider value={value}>
        {children}
      </ChatHistoryContext.Provider>
    </ChatActionsContextValue.Provider>
  );
};

export function useChatState() {
  const context = useContext(ChatHistoryContext);
  if (!context) {
    throw new Error('useChatState must be used within a ChatStateProvider');
  }
  return context;
}

/**
 * Hook to access only stable chat actions (setChatInput).
 * Use this in components that don't need to react to chatInput changes
 * to prevent unnecessary re-renders.
 */
export function useChatActions() {
  const context = useContext(ChatActionsContextValue);
  if (!context) {
    throw new Error('useChatActions must be used within a ChatStateProvider');
  }
  return context;
}
