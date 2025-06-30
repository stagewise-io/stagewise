// This hook manages the state of the companion app. It provides information about all high level stuff that affects what components are rendered etc.

// This hook provides information to all components about whether certain parts of the companion layout should be rendered or not.
// Components can use this information to hide themselves or show additional information.

import { createRef, type RefObject, createContext } from 'react';
import {
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

export interface AppState {
  requestMainAppBlock: () => number;
  requestMainAppUnblock: () => number;
  discardMainAppBlock: (handle: number) => void;
  discardMainAppUnblock: (handle: number) => void;

  isMainAppBlocked: boolean;

  toolbarBoxRef: RefObject<HTMLElement | null>; // used to place popovers in case the reference is not available
  setToolbarBoxRef: (ref: RefObject<HTMLElement | null>) => void;
  unsetToolbarBoxRef: () => void;

  minimized: boolean;
  minimize: () => void;
  expand: () => void;
}

interface InternalAppState extends AppState {
  appBlockRequestList: number[];
  appUnblockRequestList: number[];
  lastBlockRequestNumber: number;
  lastUnblockRequestNumber: number;
}

const AppContext = createContext<AppState | null>(null);

const STORAGE_KEY = 'stgws:companion';

function loadStateFromStorage(): Partial<InternalAppState> {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load state from storage:', error);
    return {};
  }
}

function saveStateToStorage(state: Partial<InternalAppState>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save state to storage:', error);
  }
}

export function AppStateProvider({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<InternalAppState>(() => {
    const storedState = loadStateFromStorage();
    return {
      appBlockRequestList: [],
      appUnblockRequestList: [],
      lastBlockRequestNumber: 0,
      lastUnblockRequestNumber: 0,
      isMainAppBlocked: false,
      toolbarBoxRef: createRef(),
      minimized: storedState.minimized ?? false,
      requestMainAppBlock: () => 0, // These will be replaced by the actual implementations
      requestMainAppUnblock: () => 0,
      discardMainAppBlock: () => {},
      discardMainAppUnblock: () => {},
      setToolbarBoxRef: () => {},
      unsetToolbarBoxRef: () => {},
      minimize: () => {},
      expand: () => {},
    };
  });

  // Save state changes to storage
  useEffect(() => {
    saveStateToStorage({
      minimized: state.minimized,
    });
  }, [state.minimized]);

  const requestMainAppBlock = useCallback(() => {
    let newHandleValue = 0;
    setState((prev) => {
      newHandleValue = prev.lastBlockRequestNumber + 1;
      return {
        ...prev,
        appBlockRequestList: [...prev.appBlockRequestList, newHandleValue],
        lastBlockRequestNumber: newHandleValue,
        isMainAppBlocked: prev.appUnblockRequestList.length === 0,
      };
    });
    return newHandleValue;
  }, []);

  const requestMainAppUnblock = useCallback(() => {
    let newHandleValue = 0;
    setState((prev) => {
      newHandleValue = prev.lastUnblockRequestNumber + 1;
      return {
        ...prev,
        appUnblockRequestList: [...prev.appUnblockRequestList, newHandleValue],
        lastUnblockRequestNumber: newHandleValue,
        isMainAppBlocked: false,
      };
    });
    return newHandleValue;
  }, []);

  const discardMainAppBlock = useCallback((handle: number) => {
    setState((prev) => {
      const newBlockRequestList = prev.appBlockRequestList.filter(
        (h) => h !== handle,
      );
      return {
        ...prev,
        appBlockRequestList: newBlockRequestList,
        isMainAppBlocked:
          newBlockRequestList.length > 0 &&
          prev.appUnblockRequestList.length === 0,
      };
    });
  }, []);

  const discardMainAppUnblock = useCallback((handle: number) => {
    setState((prev) => {
      const newUnblockRequestList = prev.appUnblockRequestList.filter(
        (h) => h !== handle,
      );
      return {
        ...prev,
        appUnblockRequestList: newUnblockRequestList,
        isMainAppBlocked:
          prev.appBlockRequestList.length > 0 &&
          newUnblockRequestList.length === 0,
      };
    });
  }, []);

  const setToolbarBoxRef = useCallback((ref: RefObject<HTMLElement | null>) => {
    setState((prev) => ({ ...prev, toolbarBoxRef: ref }));
  }, []);

  const unsetToolbarBoxRef = useCallback(() => {
    setState((prev) => ({ ...prev, toolbarBoxRef: createRef() }));
  }, []);

  const minimize = useCallback(() => {
    setState((prev) => ({ ...prev, minimized: true }));
  }, []);

  const expand = useCallback(() => {
    setState((prev) => ({ ...prev, minimized: false }));
  }, []);

  const value: AppState = {
    requestMainAppBlock,
    requestMainAppUnblock,
    discardMainAppBlock,
    discardMainAppUnblock,
    isMainAppBlocked: state.isMainAppBlocked,
    toolbarBoxRef: state.toolbarBoxRef,
    setToolbarBoxRef,
    unsetToolbarBoxRef,
    minimized: state.minimized,
    minimize,
    expand,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppState {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}
