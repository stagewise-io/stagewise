import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentTransportAdapter, type AdapterOptions } from '@/agent/adapter';
import type { AgentInterface } from '@/agent/interface';
import type { AgentAvailability } from '@/router/capabilities/availability/types';
import { AgentAvailabilityError } from '@/router/capabilities/availability/types';
import type { AgentState } from '@/router/capabilities/state/types';
import { AgentStateType } from '@/router/capabilities/state/types';

// --- Helper Functions ---

/**
 * Helper to get the next value from an async iterator.
 * @param iterator The async iterator.
 * @returns A promise that resolves with the next value.
 */
async function getNext<T>(iterator: AsyncIterator<T>): Promise<T | undefined> {
  const result = await iterator.next();
  return result.value;
}

// --- Test Suite ---

describe('AgentTransportAdapterInitialization', () => {
  let adapter: AgentTransportAdapter;
  let _agentInterface: AgentInterface;

  // Re-create the adapter before each test to ensure isolation
  beforeEach(() => {
    vi.useFakeTimers();
    const options: AdapterOptions = {
      toolCallTimeoutMs: 10000, // Use a round number for tests
    };
    adapter = new AgentTransportAdapter(options);
    _agentInterface = adapter.getAgent();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Initialization Tests ---
  describe('Initialization', () => {
    it('should initialize with default availability and state', async () => {
      const availabilityIterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      const stateIterator = adapter.state.getState()[Symbol.asyncIterator]();

      const initialAvailability = (await getNext(
        availabilityIterator,
      )) as AgentAvailability;
      const initialState = (await getNext(stateIterator)) as AgentState;

      expect(initialAvailability?.isAvailable).toBe(false);
      if (!initialAvailability?.isAvailable) {
        expect(initialAvailability?.error).toBe(
          AgentAvailabilityError.NO_CONNECTION,
        );
      }
      expect(initialState?.state).toBe(AgentStateType.IDLE);
    });
  });
});
