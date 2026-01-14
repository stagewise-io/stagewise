import {
  type ReactNode,
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';

/**
 * Context for tracking which message is being edited and routing file drops.
 * When a message enters edit mode, it registers itself and provides a callback
 * for receiving dropped files. The ChatPanel uses this to route dropped files
 * to the correct input (main chat or editing message).
 */

type FileDropHandler = (files: File[]) => void;

interface MessageEditContext {
  /** The ID of the message currently being edited, or null if none */
  activeEditMessageId: string | null;
  /** Register this message as being edited and provide a file drop handler */
  registerEditMode: (messageId: string, onFileDrop: FileDropHandler) => void;
  /** Unregister edit mode (call when exiting edit) */
  unregisterEditMode: (messageId: string) => void;
  /** Add files to the active input (routes to editing message or main chat) */
  addFilesToActiveInput: (files: File[], fallback: FileDropHandler) => void;
}

const MessageEditStateContext = createContext<MessageEditContext>({
  activeEditMessageId: null,
  registerEditMode: () => {},
  unregisterEditMode: () => {},
  addFilesToActiveInput: () => {},
});

interface MessageEditStateProviderProps {
  children: ReactNode;
}

export const MessageEditStateProvider = ({
  children,
}: MessageEditStateProviderProps) => {
  const [activeEditMessageId, setActiveEditMessageId] = useState<string | null>(
    null,
  );
  // Use ref to store the handler to avoid re-renders when it changes
  const fileDropHandlerRef = useRef<FileDropHandler | null>(null);

  const registerEditMode = useCallback(
    (messageId: string, onFileDrop: FileDropHandler) => {
      setActiveEditMessageId(messageId);
      fileDropHandlerRef.current = onFileDrop;
    },
    [],
  );

  const unregisterEditMode = useCallback((messageId: string) => {
    setActiveEditMessageId((current) => {
      // Only unregister if this message is the active one
      if (current === messageId) {
        fileDropHandlerRef.current = null;
        return null;
      }
      return current;
    });
  }, []);

  const addFilesToActiveInput = useCallback(
    (files: File[], fallback: FileDropHandler) => {
      // Route to the editing message
      if (fileDropHandlerRef.current) fileDropHandlerRef.current(files);
      // Use fallback (main chat input)
      else fallback(files);
    },
    [],
  );

  const value = useMemo(
    () => ({
      activeEditMessageId,
      registerEditMode,
      unregisterEditMode,
      addFilesToActiveInput,
    }),
    [
      activeEditMessageId,
      registerEditMode,
      unregisterEditMode,
      addFilesToActiveInput,
    ],
  );

  return (
    <MessageEditStateContext.Provider value={value}>
      {children}
    </MessageEditStateContext.Provider>
  );
};

/**
 * Hook to access message edit state.
 * Use this to track which message is being edited and route file drops.
 */
export function useMessageEditState() {
  const context = useContext(MessageEditStateContext);
  if (!context) {
    throw new Error(
      'useMessageEditState must be used within a MessageEditStateProvider',
    );
  }
  return context;
}
