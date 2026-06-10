import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  CommandCenterMode,
  CommandCenterOpenOptions,
} from './command-center-model';

type CommandCenterContextValue = {
  isOpen: boolean;
  query: string;
  mode: CommandCenterMode;
  selectFirstOnOpen: boolean;
  restoreFocusOnClose: boolean;
  initialFileWorkspaceKeys: readonly string[];
  initialSearchInContent: boolean;
  open: (options?: CommandCenterOpenOptions) => void;
  close: () => void;
  toggle: (options?: CommandCenterOpenOptions) => void;
  setQuery: (query: string) => void;
  setMode: (mode: CommandCenterMode) => void;
};

const EMPTY_WORKSPACE_KEYS: readonly string[] = [];

const CommandCenterContext = createContext<CommandCenterContextValue | null>(
  null,
);

export function CommandCenterProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<CommandCenterMode>('global');
  const [selectFirstOnOpen, setSelectFirstOnOpen] = useState(true);
  const [restoreFocusOnClose, setRestoreFocusOnClose] = useState(false);
  const [initialFileWorkspaceKeys, setInitialFileWorkspaceKeys] =
    useState<readonly string[]>(EMPTY_WORKSPACE_KEYS);
  const [initialSearchInContent, setInitialSearchInContent] = useState(false);

  const open = useCallback((options?: CommandCenterOpenOptions) => {
    setQuery(options?.initialQuery ?? '');
    setMode(options?.initialMode ?? 'global');
    setSelectFirstOnOpen(options?.selectFirst ?? true);
    setRestoreFocusOnClose(options?.restoreFocusOnClose ?? false);
    setInitialFileWorkspaceKeys(
      options?.initialFileWorkspaceKeys ?? EMPTY_WORKSPACE_KEYS,
    );
    setInitialSearchInContent(options?.initialSearchInContent ?? false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setMode('global');
    setSelectFirstOnOpen(true);
    setRestoreFocusOnClose(false);
    setInitialFileWorkspaceKeys(EMPTY_WORKSPACE_KEYS);
    setInitialSearchInContent(false);
  }, []);

  const toggle = useCallback(
    (options?: CommandCenterOpenOptions) => {
      if (isOpen) close();
      else open(options);
    },
    [close, isOpen, open],
  );

  const value = useMemo<CommandCenterContextValue>(
    () => ({
      isOpen,
      query,
      mode,
      selectFirstOnOpen,
      restoreFocusOnClose,
      initialFileWorkspaceKeys,
      initialSearchInContent,
      open,
      close,
      toggle,
      setQuery,
      setMode,
    }),
    [
      close,
      initialFileWorkspaceKeys,
      initialSearchInContent,
      isOpen,
      mode,
      open,
      query,
      restoreFocusOnClose,
      selectFirstOnOpen,
      toggle,
    ],
  );

  return (
    <CommandCenterContext.Provider value={value}>
      {children}
    </CommandCenterContext.Provider>
  );
}

export function useCommandCenter() {
  const value = useContext(CommandCenterContext);
  if (!value) {
    throw new Error(
      'useCommandCenter must be used within CommandCenterProvider',
    );
  }
  return value;
}
