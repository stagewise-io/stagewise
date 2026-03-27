/**
 * Mock implementations of hooks for Storybook.
 * This file REPLACES @ui/hooks/use-karton and @ui/hooks/use-open-chat via path aliases.
 *
 * The MockKartonProvider provides complete default state including:
 * - globalConfig.openFilesInIde: 'vscode' (for IDE file links)
 * - workspace.agent.accessPath: '/mock/workspace/path' (for file IDE href generation)
 *
 * These defaults ensure tool components (OverwriteFileTool, MultiEditTool) work without errors.
 */

import {
  useContext,
  useCallback,
  useRef,
  useState,
  createContext,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AppState, KartonContract } from '@shared/karton-contracts/ui';
import { defaultState } from '@shared/karton-contracts/ui';
import { DEFAULT_STORY_AGENT_ID } from '../decorators/scenarios/shared-utilities';

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
    // Create a complete mock workspace (defaultState.workspace is null)
    // Create a complete default state with all required fields
    const completeDefaultState: AppState = {
      ...defaultState,
      globalConfig: {
        ...defaultState.globalConfig,
        openFilesInIde: 'vscode',
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
      // Properly merge agents.instances
      agents: {
        instances: {
          ...completeDefaultState.agents.instances,
          ...mockState.agents?.instances,
        },
      },
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

// Mock context for open agent
// Using explicit tuple type to match expected consumer signatures
type OpenAgentContextValue = [
  string | null,
  Dispatch<SetStateAction<string | null>>,
];

const MockOpenAgentContext = createContext<OpenAgentContextValue>([
  null,
  () => {},
]);

export interface MockOpenAgentProviderProps {
  children: ReactNode;
  agentInstanceId?: string;
}

export const MockOpenAgentProvider: React.FC<MockOpenAgentProviderProps> = ({
  children,
  agentInstanceId = DEFAULT_STORY_AGENT_ID,
}) => {
  const state = useState<string | null>(agentInstanceId);
  return (
    <MockOpenAgentContext.Provider value={state}>
      {children}
    </MockOpenAgentContext.Provider>
  );
};

// Mock implementation of useOpenAgent
export const useOpenAgent = (): OpenAgentContextValue =>
  useContext(MockOpenAgentContext);
