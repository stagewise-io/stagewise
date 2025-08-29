import { type ReactNode, createContext } from 'react';
import { useContext, useState, useCallback, useEffect } from 'react';
import { useAppState } from './use-app-state';
import { usePlugins } from './use-plugins';
import {
  generateId,
  getSelectedElementInfo,
  collectUserMessageMetadata,
  fileToDataUrl,
  isAnthropicSupportedFile,
} from '@/utils';
import { usePanels } from './use-panels';
import { useKartonProcedure, useKartonState } from './use-karton';
import type { ChatMessage, FileUIPart } from '@stagewise/karton-contract';

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

  // Selected files (from @ mentions)
  selectedFiles: Array<{ filepath: string; filename: string }>;
  setSelectedFiles: (
    files: Array<{ filepath: string; filename: string }>,
  ) => void;

  // UI state
  isPromptCreationActive: boolean;
  startPromptCreation: () => void;
  stopPromptCreation: () => void;
  isContextSelectorActive: boolean;
  startContextSelector: () => void;
  stopContextSelector: () => void;
  isSending: boolean;
  isMentionDropdownOpen: boolean;
  setIsMentionDropdownOpen: (value: boolean) => void;
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
  selectedFiles: [],
  setSelectedFiles: () => {},
  isPromptCreationActive: false,
  startPromptCreation: () => {},
  stopPromptCreation: () => {},
  isContextSelectorActive: false,
  startContextSelector: () => {},
  stopContextSelector: () => {},
  isSending: false,
  isMentionDropdownOpen: false,
  setIsMentionDropdownOpen: () => {},
});

interface ChatStateProviderProps {
  children: ReactNode;
}

export const ChatStateProvider = ({ children }: ChatStateProviderProps) => {
  const [chatInput, setChatInput] = useState<string>('');
  const [isPromptCreationMode, setIsPromptCreationMode] =
    useState<boolean>(false);
  const [isContextSelectorMode, setIsContextSelectorMode] =
    useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [domContextElements, setDomContextElements] = useState<
    {
      element: HTMLElement;
      pluginContext: {
        pluginName: string;
        context: any;
      }[];
    }[]
  >([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<
    Array<{ filepath: string; filename: string }>
  >([]);
  const [isMentionDropdownOpen, setIsMentionDropdownOpen] =
    useState<boolean>(false);

  const { minimized } = useAppState();
  const { plugins } = usePlugins();

  const sendChatMessage = useKartonProcedure((p) => p.sendUserMessage);
  const isWorking = useKartonState((s) => s.isWorking);
  const { isChatOpen, openChat } = usePanels();

  const startPromptCreation = useCallback(() => {
    setIsPromptCreationMode(true);

    // open the chat panel if it's not open
    if (!isChatOpen) {
      openChat();
    }

    plugins.forEach((plugin) => {
      plugin.onPromptingStart?.();
    });
  }, [plugins, isChatOpen, openChat]);

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

  const stopPromptCreation = useCallback(() => {
    setIsPromptCreationMode(false);
    // Always stop context selector when stopping prompt creation
    setIsContextSelectorMode(false);
    setDomContextElements([]);
    setSelectedFiles([]);
    plugins.forEach((plugin) => {
      plugin.onPromptingAbort?.();
    });
  }, [plugins]);

  const startContextSelector = useCallback(() => {
    setIsContextSelectorMode(true);
  }, []);

  const stopContextSelector = useCallback(() => {
    setIsContextSelectorMode(false);
  }, []);

  useEffect(() => {
    if (!isChatOpen) {
      stopPromptCreation(); // This also stops context selector
    }
  }, [isChatOpen, stopPromptCreation]);

  useEffect(() => {
    if (minimized) {
      stopPromptCreation(); // This also stops context selector
    }
  }, [minimized, stopPromptCreation]);

  // Auto-stop prompt creation when agent is busy
  useEffect(() => {
    if (isWorking && isPromptCreationMode) {
      stopPromptCreation(); // This also stops context selector
    }
  }, [isWorking, isPromptCreationMode, stopPromptCreation]);

  const addChatDomContext = useCallback(
    (element: HTMLElement) => {
      const pluginsWithContextGetters = plugins.filter(
        (plugin) => plugin.onContextElementSelect,
      );

      setDomContextElements((prev) => [
        ...prev,
        {
          element,
          pluginContext: pluginsWithContextGetters.map((plugin) => ({
            pluginName: plugin.pluginName,
            context: plugin.onContextElementSelect?.(element),
          })),
        },
      ]);
    },
    [plugins],
  );

  const removeChatDomContext = useCallback((element: HTMLElement) => {
    setDomContextElements((prev) =>
      prev.filter((item) => item.element !== element),
    );
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
        domContextElements.map((item) => getSelectedElementInfo(item.element)),
        false,
      );

      // Add selected files to metadata
      if (selectedFiles.length > 0) {
        metadata.selectedFiles = selectedFiles;
      }

      const message: ChatMessage = {
        id: generateId(),
        parts: [...fileParts, { type: 'text' as const, text: chatInput }],
        role: 'user',
        metadata: {
          ...metadata,
          createdAt: new Date(),
        },
      };

      // Process plugin content for both old and new format
      const pluginProcessingPromises = plugins.map(async (plugin) => {
        const handlerResult = await plugin.onPromptSend?.(message);

        if (
          !handlerResult ||
          !handlerResult.contextSnippets ||
          handlerResult.contextSnippets.length === 0
        ) {
          return null;
        }

        const snippetPromises = handlerResult.contextSnippets.map(
          async (snippet) => {
            const resolvedContent =
              typeof snippet.content === 'string'
                ? snippet.content
                : await snippet.content();
            return {
              promptContextName: snippet.promptContextName,
              content: resolvedContent,
            };
          },
        );

        const resolvedSnippets = await Promise.all(snippetPromises);

        if (resolvedSnippets.length > 0) {
          return {
            pluginName: plugin.pluginName,
            contextSnippets: resolvedSnippets,
          };
        }
        return null;
      });

      const allPluginContexts = await Promise.all(pluginProcessingPromises);

      // Add plugin content as additional text parts if needed
      allPluginContexts.forEach((context) => {
        if (!context) return;

        // Add to pluginContentItems in metadata
        message.metadata.pluginContentItems[context.pluginName] = {};

        context.contextSnippets.forEach((snippet) => {
          const contentItem: ChatMessage['metadata']['pluginContentItems'][string][string] =
            {
              type: 'text',
              text: snippet.content,
            };
          message.metadata.pluginContentItems[context.pluginName][
            snippet.promptContextName
          ] = contentItem;
        });
      });

      // Reset state after sending
      setChatInput('');
      setDomContextElements([]);
      clearFileAttachments();
      setSelectedFiles([]);
      stopPromptCreation(); // This also stops context selector

      // Send the message using the chat capability
      await sendChatMessage(message);
    } finally {
      setIsSending(false);
    }
  }, [
    chatInput,
    domContextElements,
    fileAttachments,
    selectedFiles,
    plugins,
    sendChatMessage,
    clearFileAttachments,
    stopPromptCreation,
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
    selectedFiles,
    setSelectedFiles,
    isPromptCreationActive: isPromptCreationMode,
    startPromptCreation,
    stopPromptCreation,
    isContextSelectorActive: isContextSelectorMode,
    startContextSelector,
    stopContextSelector,
    isSending,
    isMentionDropdownOpen,
    setIsMentionDropdownOpen,
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
