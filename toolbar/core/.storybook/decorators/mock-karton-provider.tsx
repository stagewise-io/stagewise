import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { AppState, KartonContract } from '@stagewise/karton-contract';
import { defaultState } from '@stagewise/karton-contract';

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
    return {
      ...defaultState,
      ...mockState,
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

// Mock implementation of useKartonState
export function useMockKartonState<R>(
  selector?: (state: Readonly<AppState>) => R,
): R {
  const context = useContext(MockKartonContext);
  if (!context) {
    throw new Error(
      'useMockKartonState must be used within MockKartonProvider',
    );
  }

  if (!selector) {
    return context.state as unknown as R;
  }

  return selector(context.state);
}

// Mock implementation of useKartonProcedure
export function useMockKartonProcedure<R>(
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
export function useMockKartonConnected(): boolean {
  return true;
}

// Mock implementation of useComparingSelector
export function useMockComparingSelector<R>(
  selector: (state: Readonly<AppState>) => R,
): R {
  return useMockKartonState(selector);
}
