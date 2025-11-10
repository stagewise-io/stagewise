import { type ReactNode, createContext } from 'react';
import { usePostHog } from 'posthog-js/react';
import { useContext, useState, useCallback } from 'react';
import { usePlugins } from './use-plugins';
import {
  generateId,
  getSelectedElementInfo,
  collectUserMessageMetadata,
  fileToDataUrl,
  isAnthropicSupportedFile,
} from '@/utils';
import { useKartonProcedure } from './use-karton';
import type {
  ChatMessage,
  FileUIPart,
  SelectedElement,
} from '@stagewise/karton-contract';

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

  // Selected elements operations (we should just transform this into custom data parts in a refactoring...)
  selectedElements: {
    selectedElement: SelectedElement;
    domElement: HTMLElement;
  }[];
  addSelectedElement: (domElement: HTMLElement) => void;
  removeSelectedElement: (domElement: HTMLElement) => void;
  clearSelectedElements: () => void;
  sendMessage: () => void;

  // File attachments
  fileAttachments: FileAttachment[];
  addFileAttachment: (file: File) => void;
  removeFileAttachment: (id: string) => void;
  clearFileAttachments: () => void;

  // UI state
  isContextSelectorActive: boolean;
  startContextSelector: () => void;
  stopContextSelector: () => void;
  isSending: boolean;
}

const ChatHistoryContext = createContext<ChatContext>({
  chatInput: '',
  setChatInput: () => {},
  selectedElements: [],
  addSelectedElement: () => {},
  removeSelectedElement: () => {},
  clearSelectedElements: () => {},
  sendMessage: () => {},
  fileAttachments: [],
  addFileAttachment: () => {},
  removeFileAttachment: () => {},
  clearFileAttachments: () => {},
  isContextSelectorActive: false,
  startContextSelector: () => {},
  stopContextSelector: () => {},
  isSending: false,
});

interface ChatStateProviderProps {
  children: ReactNode;
}

export const ChatStateProvider = ({ children }: ChatStateProviderProps) => {
  const posthog = usePostHog();
  const [chatInput, setChatInput] = useState<string>('');
  const [_isPromptCreationMode, _setIsPromptCreationMode] =
    useState<boolean>(false);
  const [isContextSelectorMode, setIsContextSelectorMode] =
    useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [selectedElements, setSelectedElements] = useState<
    {
      selectedElement: SelectedElement;
      domElement: HTMLElement;
    }[]
  >([]);

  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);

  const { plugins } = usePlugins();

  const sendChatMessage = useKartonProcedure(
    (p) => p.agentChat.sendUserMessage,
  );

  const enrichSelectedElement = useKartonProcedure(
    (p) => p.agentChat.enrichSelectedElement,
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

  const startContextSelector = useCallback(() => {
    setIsContextSelectorMode(true);
  }, []);

  const stopContextSelector = useCallback(() => {
    setIsContextSelectorMode(false);
  }, []);

  const addSelectedElement = useCallback(
    (element: HTMLElement) => {
      const newSelectedElement = getSelectedElementInfo(generateId(), element);

      setSelectedElements((prev) => {
        const newContextElements = [
          ...prev,
          { selectedElement: newSelectedElement, domElement: element },
        ];

        return newContextElements;
      });

      // Now, we make a fetch to the CLI to let it enrich the selected Element with even more context information (related source files etc.).
      enrichSelectedElement(newSelectedElement)
        .then((enrichedSelectedElement) => {
          setSelectedElements((prev) => {
            const newContextElements = prev.map((item) => {
              if (
                item.selectedElement.stagewiseId ===
                newSelectedElement.stagewiseId
              ) {
                return { ...item, selectedElement: enrichedSelectedElement };
              }
              return item;
            });
            return newContextElements;
          });
        })
        .catch((error) => {
          console.error(error);
          posthog.captureException(error);
        });
    },
    [enrichSelectedElement],
  );

  const removeSelectedElement = useCallback((element: HTMLElement) => {
    setSelectedElements((prev) =>
      prev.filter((item) => item.domElement !== element),
    );
  }, []);

  const clearSelectedElements = useCallback(() => {
    setSelectedElements([]);
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
      const metadata = collectUserMessageMetadata(
        selectedElements.map((item) => item.selectedElement),
        false,
      );

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
      clearSelectedElements();
      clearFileAttachments();

      // Send the message using the chat capability
      await sendChatMessage(message);
    } finally {
      setIsSending(false);
    }
  }, [
    chatInput,
    selectedElements,
    fileAttachments,
    plugins,
    sendChatMessage,
    clearFileAttachments,
    clearSelectedElements,
  ]);

  const value: ChatContext = {
    chatInput,
    setChatInput,
    selectedElements,
    addSelectedElement,
    removeSelectedElement,
    clearSelectedElements,
    sendMessage,
    fileAttachments,
    addFileAttachment,
    removeFileAttachment,
    clearFileAttachments,
    isContextSelectorActive: isContextSelectorMode,
    startContextSelector,
    stopContextSelector,
    isSending,
  };

  return (
    <ChatHistoryContext.Provider value={value}>
      {children}
    </ChatHistoryContext.Provider>
  );
};

export function useChatState() {
  const context = useContext(ChatHistoryContext);
  if (!context) {
    throw new Error('useChatState must be used within a ChatStateProvider');
  }
  return context;
}
