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
  domContextElements: {
    stagewiseId: string;
    codeMetadata: {
      relativePath: string;
      startLine: number;
      endLine: number;
      content?: string;
    }[];
    element: HTMLElement;
    pluginContext: {
      pluginName: string;
      context: any;
    }[];
  }[];
  addChatDomContext: (element: HTMLElement) => void;
  removeChatDomContext: (element: HTMLElement) => void;
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
  domContextElements: [],
  addChatDomContext: () => {},
  removeChatDomContext: () => {},
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
  const [domContextElements, setDomContextElements] = useState<
    {
      element: HTMLElement;
      stagewiseId: string;
      codeMetadata: {
        relativePath: string;
        startLine: number;
        endLine: number;
        content?: string;
      }[];
      pluginContext: {
        pluginName: string;
        context: any;
      }[];
    }[]
  >([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);

  const { plugins } = usePlugins();

  const sendChatMessage = useKartonProcedure(
    (p) => p.agentChat.sendUserMessage,
  );

  const notifyContextElementsChanged = useKartonProcedure(
    (p) => p.agentChat.contextElementsChanged,
  );

  const getContextElementFiles = useKartonProcedure(
    (p) => p.agentChat.getContextElementFiles,
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

  const addChatDomContext = useCallback(
    (element: HTMLElement) => {
      const pluginsWithContextGetters = plugins.filter(
        (plugin) => plugin.onContextElementSelect,
      );

      const newElement = {
        stagewiseId: generateId(),
        element,
        pluginContext: pluginsWithContextGetters.map((plugin) => ({
          pluginName: plugin.pluginName,
          context: plugin.onContextElementSelect?.(element),
        })),
        codeMetadata: [],
      };

      setDomContextElements((prev) => {
        const newElements = [...prev, newElement];

        const selectedElements: SelectedElement[] = newElements.map((item) =>
          getSelectedElementInfo(
            item.stagewiseId,
            item.element,
            item.codeMetadata,
          ),
        );
        // Notify CLI about the change
        notifyContextElementsChanged(selectedElements);

        return newElements;
      });

      const selectedElement = getSelectedElementInfo(
        newElement.stagewiseId,
        newElement.element,
        newElement.codeMetadata,
      );

      getContextElementFiles(selectedElement)
        .then((files) => {
          setDomContextElements((prev) => {
            return prev.map((item) => {
              if (item.stagewiseId === newElement.stagewiseId) {
                item.codeMetadata = files.map((file) => ({
                  relativePath: file.relativePath,
                  startLine: file.startLine,
                  endLine: file.endLine,
                  content: file.content,
                }));
              }
              return item;
            });
          });
        })
        .catch((error) => {
          posthog.captureException(error);
        });
    },
    [plugins, notifyContextElementsChanged],
  );

  const removeChatDomContext = useCallback(
    (element: HTMLElement) => {
      setDomContextElements((prev) => {
        const newElements = prev.filter((item) => item.element !== element);

        // Notify CLI about the change
        const selectedElements: SelectedElement[] = newElements.map((item) =>
          getSelectedElementInfo(
            item.stagewiseId,
            item.element,
            item.codeMetadata,
          ),
        );
        notifyContextElementsChanged(selectedElements);

        return newElements;
      });
    },
    [notifyContextElementsChanged],
  );

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
        domContextElements.map((item) =>
          getSelectedElementInfo(
            item.stagewiseId,
            item.element,
            item.codeMetadata,
          ),
        ),
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
      setDomContextElements([]);
      clearFileAttachments();

      // Notify CLI that context elements are cleared
      notifyContextElementsChanged([]);

      // Send the message using the chat capability
      await sendChatMessage(message);
    } finally {
      setIsSending(false);
    }
  }, [
    chatInput,
    domContextElements,
    fileAttachments,
    plugins,
    sendChatMessage,
    clearFileAttachments,
    notifyContextElementsChanged,
  ]);

  const value: ChatContext = {
    chatInput,
    setChatInput,
    domContextElements,
    addChatDomContext,
    removeChatDomContext,
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
