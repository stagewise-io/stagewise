/**
 * Mock implementations of hooks for Storybook.
 * This file REPLACES @/hooks/use-karton and @/hooks/use-chat-state via path aliases.
 *
 * The MockKartonProvider provides complete default state including:
 * - globalConfig.openFilesInIde: 'vscode' (for IDE file links)
 * - workspace.agent.accessPath: '/mock/workspace/path' (for file IDE href generation)
 *
 * These defaults ensure tool components (OverwriteFileTool, MultiEditTool) work without errors.
 */

import { useContext, useState, useCallback, useRef } from 'react';
import { createContext, type ReactNode, useMemo } from 'react';
import type { AppState, KartonContract } from '@shared/karton-contracts/ui';
import { defaultState } from '@shared/karton-contracts/ui';

// Create the mock Karton context
interface MockKartonContextValue {
  state: AppState;
  subscribe: (listener: () => void) => () => void;
  isConnected: boolean;
}

const MockKartonContext = createContext<MockKartonContextValue | null>(null);

export interface MockKartonProviderProps {
  children: ReactNode;
  mockState?: Partial<AppState>;
}

export const MockKartonProvider: React.FC<MockKartonProviderProps> = ({
  children,
  mockState = {},
}) => {
  const state = useMemo<AppState>(() => {
    // Create a complete default state with all required fields
    const completeDefaultState: AppState = {
      ...defaultState,
      globalConfig: {
        openFilesInIde: 'vscode',
        ...defaultState.globalConfig,
      },
      workspace: {
        ...defaultState.workspace,
        agent: {
          accessPath: '/mock/workspace/path',
          ...defaultState.workspace?.agent,
        },
      },
    };

    // Deep merge mockState with completeDefaultState
    return {
      ...completeDefaultState,
      ...mockState,
      globalConfig: {
        ...completeDefaultState.globalConfig,
        ...mockState.globalConfig,
      },
      workspace: mockState.workspace
        ? {
            ...completeDefaultState.workspace,
            ...mockState.workspace,
            agent: {
              ...completeDefaultState.workspace?.agent,
              ...mockState.workspace?.agent,
            },
          }
        : completeDefaultState.workspace,
    };
  }, [mockState]);

  const subscribe = () => {
    // No-op subscribe for Storybook
    return () => {};
  };

  const value: MockKartonContextValue = {
    state,
    subscribe,
    isConnected: true,
  };

  return (
    <MockKartonContext.Provider value={value}>
      {children}
    </MockKartonContext.Provider>
  );
};

// Export as KartonProvider so stories can use it
export { MockKartonProvider as KartonProvider };

// Mock implementation of useKartonState
export function useKartonState<R>(
  selector?: (state: Readonly<AppState>) => R,
): R {
  const context = useContext(MockKartonContext);
  if (!context) {
    throw new Error('useKartonState must be used within MockKartonProvider');
  }

  if (!selector) {
    return context.state as unknown as R;
  }

  return selector(context.state);
}

// Mock implementation of useKartonProcedure
export function useKartonProcedure<R>(
  selector?: (procedures: KartonContract['serverProcedures']) => R,
): R {
  // Return a no-op function that logs the call
  const mockProcedures: any = new Proxy(
    {},
    {
      get: (_target, prop) => {
        return new Proxy(
          {},
          {
            get: (_, nestedProp) => {
              return async (...args: any[]) => {
                console.log(
                  `[Mock Procedure] ${String(prop)}.${String(nestedProp)}`,
                  args,
                );
                return null;
              };
            },
          },
        );
      },
    },
  );

  if (!selector) {
    return mockProcedures;
  }

  return selector(mockProcedures);
}

// Mock implementation of useKartonConnected
export function useKartonConnected(): boolean {
  return true;
}

// Mock implementation of useComparingSelector
// Returns a selector function (not the value), just like the real implementation
export function useComparingSelector<R>(
  selector: (state: Readonly<AppState>) => R,
): (state: Readonly<AppState>) => R {
  const previousValueRef = useRef<R | null>(null);

  return useCallback(
    (state: Readonly<AppState>) => {
      const next = selector(state);

      // Simple comparison for Storybook - use JSON.stringify for deep equality
      if (previousValueRef.current !== null) {
        if (JSON.stringify(previousValueRef.current) === JSON.stringify(next)) {
          return previousValueRef.current;
        }
      }

      previousValueRef.current = next;
      return next;
    },
    [selector],
  );
}

// Mock implementation of useChatActions
// Returns stable setChatInput action (used by components that don't need to react to chatInput changes)
export function useChatActions() {
  const setChatInput = useCallback((value: string) => {
    console.log('[Mock] setChatInput called:', value);
  }, []);

  return { setChatInput };
}

// Mock implementation of useChatState
export interface FileAttachment {
  id: string;
  file: File;
  url: string;
}

export function useChatState() {
  const [chatInput, setChatInput] = useState('');
  const [selectedElements, setSelectedElements] = useState<any[]>([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [isContextSelectorActive, setIsContextSelectorActive] = useState(false);
  const [isSending, _setIsSending] = useState(false);

  const addSelectedElement = useCallback(() => {
    console.log('[Mock] addSelectedElement called');
  }, []);

  const removeSelectedElement = useCallback(() => {
    console.log('[Mock] removeSelectedElement called');
  }, []);

  const clearSelectedElements = useCallback(() => {
    setSelectedElements([]);
  }, []);

  const sendMessage = useCallback(() => {
    console.log('[Mock] sendMessage called:', chatInput);
    setChatInput('');
  }, [chatInput]);

  const addFileAttachment = useCallback(() => {
    console.log('[Mock] addFileAttachment called');
  }, []);

  const removeFileAttachment = useCallback(() => {
    console.log('[Mock] removeFileAttachment called');
  }, []);

  const clearFileAttachments = useCallback(() => {
    setFileAttachments([]);
  }, []);

  const startContextSelector = useCallback(() => {
    setIsContextSelectorActive(true);
  }, []);

  const stopContextSelector = useCallback(() => {
    setIsContextSelectorActive(false);
  }, []);

  return {
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
    isContextSelectorActive,
    startContextSelector,
    stopContextSelector,
    isSending,
  };
}

// Mock implementation of useContextChipHover
export function useContextChipHover() {
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(
    null,
  );

  return {
    hoveredElement,
    setHoveredElement,
  };
}
