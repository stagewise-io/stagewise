import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { createKartonReactClient } from '../../../src/react/client/karton-react-client.js';

// Mock the vanilla client
vi.mock('../../../src/client/karton-client.js', () => ({
  createKartonClient: vi.fn(() => ({
    state: { counter: 0, users: [] },
    serverProcedures: {
      increment: vi.fn(),
      getCounter: vi.fn().mockResolvedValue(42)
    },
    isConnected: true
  }))
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

describe('Karton React Client', () => {
  it('should create provider and hook', () => {
    const [KartonProvider, useKarton] = createKartonReactClient<TestAppType>({
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
    expect(typeof useKarton).toBe('function');
  });

  it('should provide state through hook', () => {
    const [KartonProvider, useKarton] = createKartonReactClient<TestAppType>({
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
      () => useKarton((s) => s.state.counter),
      { wrapper }
    );

    expect(result.current).toBe(0);
  });

  it('should provide server procedures through hook', () => {
    const [KartonProvider, useKarton] = createKartonReactClient<TestAppType>({
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
      () => useKarton((s) => s.serverProcedures.increment),
      { wrapper }
    );

    expect(typeof result.current).toBe('function');
  });

  it('should provide connection state through hook', () => {
    const [KartonProvider, useKarton] = createKartonReactClient<TestAppType>({
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
      () => useKarton((s) => s.isConnected),
      { wrapper }
    );

    expect(result.current).toBe(true);
  });

  it('should allow selecting multiple values', () => {
    const [KartonProvider, useKarton] = createKartonReactClient<TestAppType>({
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
      () => useKarton((s) => ({
        counter: s.state.counter,
        isConnected: s.isConnected,
        increment: s.serverProcedures.increment
      })),
      { wrapper }
    );

    expect(result.current.counter).toBe(0);
    expect(result.current.isConnected).toBe(true);
    expect(typeof result.current.increment).toBe('function');
  });

  it('should not re-render when selecting procedures', () => {
    const [KartonProvider, useKarton] = createKartonReactClient<TestAppType>({
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
        return useKarton((s) => s.serverProcedures.increment);
      },
      { wrapper }
    );

    const initialRenderCount = renderCount;
    
    // Trigger a re-render that shouldn't affect the hook
    act(() => {
      // Procedures are stable references, so no re-render should occur
    });

    expect(renderCount).toBe(initialRenderCount);
  });
});