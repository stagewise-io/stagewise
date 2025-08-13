import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createKartonReactClient, useComparingSelector } from '../../../src/react/client/karton-react-client.js';

// Mock the vanilla client
let mockClient: any;
let mockListeners: Set<() => void>;
let capturedListener: (() => void) | undefined;

vi.mock('../../../src/client/karton-client.js', () => ({
  createKartonClient: vi.fn((config) => {
    mockListeners = new Set();
    // Store the onStateChange listener passed from the provider
    capturedListener = config?.onStateChange;
    if (capturedListener) {
      mockListeners.add(capturedListener);
    }
    mockClient = {
      state: { counter: 0, users: [] },
      serverProcedures: {
        increment: vi.fn(),
        getCounter: vi.fn().mockResolvedValue(42)
      },
      isConnected: true,
    };
    return mockClient;
  })
}));

interface TestAppType {
  state: {
    counter: number;
    users: string[];
  };
  serverProcedures: {
    increment: () => Promise<void>;
    getCounter: () => Promise<number>;
  };
  clientProcedures: {
    notify: (message: string) => Promise<void>;
  };
}

describe('Karton React Client - General', () => {
  beforeEach(() => {
    capturedListener = undefined;
    if (mockListeners) {
      mockListeners.clear();
    }
  });

  it('should create provider and all hooks', () => {
    const [KartonProvider, useKartonState, useKartonProcedure, useKartonConnected] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    expect(typeof KartonProvider).toBe('function');
    expect(typeof useKartonState).toBe('function');
    expect(typeof useKartonProcedure).toBe('function');
    expect(typeof useKartonConnected).toBe('function');
  });

  it('should capture listener function on initial render', () => {
    const [KartonProvider] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    // Render the provider
    renderHook(() => {}, { wrapper });

    // Verify the listener was captured
    expect(capturedListener).toBeDefined();
    expect(typeof capturedListener).toBe('function');
    expect(mockListeners.has(capturedListener!)).toBe(true);
  });
});

describe('Karton React Client - useKartonState', () => {
  beforeEach(() => {
    capturedListener = undefined;
    if (mockListeners) {
      mockListeners.clear();
    }
  });

  it('should provide full state without selector', () => {
    const [KartonProvider, useKartonState] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => useKartonState(),
      { wrapper }
    );

    expect(result.current).toEqual({ counter: 0, users: [] });
  });

  it('should provide selected state value', () => {
    const [KartonProvider, useKartonState] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => useKartonState((state) => state.counter),
      { wrapper }
    );

    expect(result.current).toBe(0);
  });

  it('should update when state changes', async () => {
    const [KartonProvider, useKartonState] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => useKartonState((state) => state.counter),
      { wrapper }
    );

    expect(result.current).toBe(0);

    // Simulate state change
    act(() => {
      mockClient.state = { counter: 5, users: [] };
      // Notify all listeners
      mockListeners.forEach(listener => listener());
    });

    await waitFor(() => {
      expect(result.current).toBe(5);
    });
  });

  it('should work with useComparingSelector', () => {
    const [KartonProvider, useKartonState] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => {
        const selector = useComparingSelector<TestAppType['state'], { count: number; userCount: number }>(
          (state) => ({ count: state.counter, userCount: state.users.length })
        );
        return useKartonState(selector);
      },
      { wrapper }
    );

    expect(result.current).toEqual({ count: 0, userCount: 0 });
  });
});

describe('Karton React Client - useKartonProcedure', () => {
  beforeEach(() => {
    capturedListener = undefined;
    if (mockListeners) {
      mockListeners.clear();
    }
  });

  it('should provide all procedures without selector', () => {
    const [KartonProvider, , useKartonProcedure] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => useKartonProcedure(),
      { wrapper }
    );

    expect(typeof result.current.increment).toBe('function');
    expect(typeof result.current.getCounter).toBe('function');
  });

  it('should provide single procedure with selector', () => {
    const [KartonProvider, , useKartonProcedure] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => useKartonProcedure((procedures) => procedures.increment),
      { wrapper }
    );

    expect(typeof result.current).toBe('function');
  });

  it('should provide multiple procedures with selector', () => {
    const [KartonProvider, , useKartonProcedure] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => useKartonProcedure((procedures) => ({
        inc: procedures.increment,
        get: procedures.getCounter
      })),
      { wrapper }
    );

    expect(typeof result.current.inc).toBe('function');
    expect(typeof result.current.get).toBe('function');
  });

  it('should not re-render when state changes', async () => {
    const [KartonProvider, , useKartonProcedure] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return useKartonProcedure((procedures) => procedures.increment);
      },
      { wrapper }
    );

    const initialRenderCount = renderCount;
    const initialFunction = result.current;

    // Simulate state change
    act(() => {
      mockClient.state = { counter: 5, users: [] };
      // Notify all listeners
      mockListeners.forEach(listener => listener());
    });

    // Wait a bit to ensure any re-renders would have happened
    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not re-render since procedures don't change
    expect(renderCount).toBe(initialRenderCount);
    // Function reference should remain the same
    expect(result.current).toBe(initialFunction);
  });
});

describe('Karton React Client - useKartonConnected', () => {
  beforeEach(() => {
    capturedListener = undefined;
    if (mockListeners) {
      mockListeners.clear();
    }
  });

  it('should provide connection state', () => {
    const [KartonProvider, , , useKartonConnected] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => useKartonConnected(),
      { wrapper }
    );

    expect(result.current).toBe(true);
  });

  it('should update when connection state changes', async () => {
    const [KartonProvider, , , useKartonConnected] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    const { result } = renderHook(
      () => useKartonConnected(),
      { wrapper }
    );

    expect(result.current).toBe(true);

    // Simulate disconnection
    act(() => {
      mockClient.isConnected = false;
      // Notify all listeners
      mockListeners.forEach(listener => listener());
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    // Simulate reconnection
    act(() => {
      mockClient.isConnected = true;
      // Notify all listeners
      mockListeners.forEach(listener => listener());
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('should not re-render when state changes but connection remains same', async () => {
    const [KartonProvider, , , useKartonConnected] = createKartonReactClient<TestAppType>({
      webSocketPath: 'ws://localhost:3000/ws',
      procedures: {
        notify: async (message) => {}
      },
      fallbackState: {
        counter: 0,
        users: []
      }
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <KartonProvider>{children}</KartonProvider>
    );

    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return useKartonConnected();
      },
      { wrapper }
    );

    const initialRenderCount = renderCount;

    // Simulate state change without connection change
    act(() => {
      mockClient.state = { counter: 5, users: [] };
      // Keep connection the same
      mockClient.isConnected = true;
      // Notify all listeners
      mockListeners.forEach(listener => listener());
    });

    // Wait a bit to ensure any re-renders would have happened
    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not re-render since connection state didn't change
    expect(renderCount).toBe(initialRenderCount);
    expect(result.current).toBe(true);
  });
});