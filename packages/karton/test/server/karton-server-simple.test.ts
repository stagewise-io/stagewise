import { describe, it, expect } from 'vitest';
import type { KartonServerConfig } from '../../src/shared/types.js';

describe('Karton Server Types', () => {
  it('should enforce correct server configuration types', () => {
    interface TestApp {
      state: { value: number };
      serverProcedures: {
        increment: () => Promise<void>;
      };
      clientProcedures: {
        notify: (msg: string) => Promise<void>;
      };
    }

    const config: KartonServerConfig<TestApp> = {
      expressApp: {} as any,
      httpServer: {} as any,
      webSocketPath: '/ws',
      procedures: {
        increment: async (callingClientId: string) => {
          expect(typeof callingClientId).toBe('string');
        }
      },
      initialState: {
        value: 0
      }
    };

    expect(config.webSocketPath).toBe('/ws');
    expect(config.initialState.value).toBe(0);
  });

  it('should support nested procedures', () => {
    interface TestApp {
      state: { value: number };
      serverProcedures: {
        math: {
          add: (a: number, b: number) => Promise<number>;
        };
      };
    }

    const config: KartonServerConfig<TestApp> = {
      expressApp: {} as any,
      httpServer: {} as any,
      webSocketPath: '/ws',
      procedures: {
        math: {
          add: async (a: number, b: number, callingClientId: string) => {
            return a + b;
          }
        }
      },
      initialState: {
        value: 0
      }
    };

    expect(config.procedures.math).toBeDefined();
  });
});