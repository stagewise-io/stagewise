import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentTransportAdapter, type AdapterOptions } from '@/agent/adapter';
import type { AgentInterface } from '@/agent/interface';
import type { AgentAvailability } from '@/router/capabilities/availability/types';
import { AgentAvailabilityError } from '@/router/capabilities/availability/types';

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

describe('AgentTransportAdapter - Availability', () => {
  let adapter: AgentTransportAdapter;
  let agentInterface: AgentInterface;

  beforeEach(() => {
    vi.useFakeTimers();
    const options: AdapterOptions = {
      toolCallTimeoutMs: 10000,
    };
    adapter = new AgentTransportAdapter(options);
    agentInterface = adapter.getAgent();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('starts unavailable with NO_CONNECTION error', async () => {
      const iterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      const initial = (await getNext(iterator)) as AgentAvailability;

      expect(initial.isAvailable).toBe(false);
      if (!initial.isAvailable) {
        expect(initial.error).toBe(AgentAvailabilityError.NO_CONNECTION);
        expect(initial.errorMessage).toBe('Initializing');
      }
    });
  });

  describe('Setting Availability', () => {
    it('sets available to true', async () => {
      const iterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.availability.set(true);
      const update = (await getNext(iterator)) as AgentAvailability;

      expect(update).toEqual({ isAvailable: true });
    });

    it('sets unavailable with error', async () => {
      const iterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.availability.set(false, AgentAvailabilityError.OTHER);
      const update = (await getNext(iterator)) as AgentAvailability;

      expect(update).toEqual({
        isAvailable: false,
        error: AgentAvailabilityError.OTHER,
      });
    });

    it('sets unavailable with error and message', async () => {
      const iterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.availability.set(
        false,
        AgentAvailabilityError.NO_CONNECTION,
        'Network lost',
      );
      const update = (await getNext(iterator)) as AgentAvailability;

      expect(update).toEqual({
        isAvailable: false,
        error: AgentAvailabilityError.NO_CONNECTION,
        errorMessage: 'Network lost',
      });
    });

    it('throws when setting unavailable without error', () => {
      expect(() => {
        (agentInterface.availability.set as any)(false);
      }).toThrow(
        "An 'error' type is required when setting availability to false.",
      );
    });
  });

  describe('State Transitions', () => {
    it('transitions available -> unavailable -> available', async () => {
      const iterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.availability.set(true);
      const available = (await getNext(iterator)) as AgentAvailability;
      expect(available.isAvailable).toBe(true);

      agentInterface.availability.set(false, AgentAvailabilityError.OTHER);
      const unavailable = (await getNext(iterator)) as AgentAvailability;
      expect(unavailable.isAvailable).toBe(false);

      agentInterface.availability.set(true);
      const availableAgain = (await getNext(iterator)) as AgentAvailability;
      expect(availableAgain.isAvailable).toBe(true);
    });

    it('handles rapid state changes', async () => {
      const iterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      // Make rapid changes
      agentInterface.availability.set(true);
      agentInterface.availability.set(false, AgentAvailabilityError.OTHER);
      agentInterface.availability.set(true);

      // Should receive all updates in order
      const update1 = (await getNext(iterator)) as AgentAvailability;
      expect(update1.isAvailable).toBe(true);

      const update2 = (await getNext(iterator)) as AgentAvailability;
      expect(update2.isAvailable).toBe(false);
      if (!update2.isAvailable) {
        expect(update2.error).toBe(AgentAvailabilityError.OTHER);
      }

      const update3 = (await getNext(iterator)) as AgentAvailability;
      expect(update3.isAvailable).toBe(true);
    });
  });

  describe('Multiple Subscribers', () => {
    it('sends updates to all active subscribers', async () => {
      const iterator1 = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      const iterator2 = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();

      await getNext(iterator1); // consume initial
      await getNext(iterator2); // consume initial

      agentInterface.availability.set(true);

      const update1 = (await getNext(iterator1)) as AgentAvailability;
      const update2 = (await getNext(iterator2)) as AgentAvailability;

      expect(update1).toEqual({ isAvailable: true });
      expect(update2).toEqual({ isAvailable: true });
    });

    it('provides current state to new subscribers', async () => {
      agentInterface.availability.set(true);
      agentInterface.availability.set(
        false,
        AgentAvailabilityError.OTHER,
        'Dummy change',
      );
      agentInterface.availability.set(true);

      // New subscriber connects after state has changed
      // Note: Each call to getAvailability() creates a new AsyncIterable,
      // and each iterator creation simulates a new client connection
      const newIterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      const immediateValue = (await getNext(newIterator)) as AgentAvailability;

      expect(immediateValue).toEqual({ isAvailable: true });
    });

    it('provides current unavailable state to new subscribers', async () => {
      agentInterface.availability.set(
        false,
        AgentAvailabilityError.OTHER,
        'Processing',
      );

      const newIterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      const immediateValue = (await getNext(newIterator)) as AgentAvailability;

      expect(immediateValue).toEqual({
        isAvailable: false,
        error: AgentAvailabilityError.OTHER,
        errorMessage: 'Processing',
      });
    });
  });

  describe('Error Types', () => {
    const errorTypes = [
      AgentAvailabilityError.NO_CONNECTION,
      AgentAvailabilityError.NO_AUTHENTICATION,
      AgentAvailabilityError.INCOMPATIBLE_VERSION,
      AgentAvailabilityError.OTHER,
    ];

    it.each(errorTypes)('handles %s error', async (errorType) => {
      const iterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.availability.set(false, errorType);
      const update = (await getNext(iterator)) as AgentAvailability;

      expect(update.isAvailable).toBe(false);
      if (!update.isAvailable) {
        expect(update.error).toBe(errorType);
      }
    });
  });

  describe('State Getter', () => {
    it('returns current availability state', () => {
      agentInterface.availability.set(true);
      const current = agentInterface.availability.get();
      expect(current).toEqual({ isAvailable: true });
    });

    it('returns current unavailable state', () => {
      agentInterface.availability.set(
        false,
        AgentAvailabilityError.OTHER,
        'Working',
      );
      const current = agentInterface.availability.get();
      expect(current).toEqual({
        isAvailable: false,
        error: AgentAvailabilityError.OTHER,
        errorMessage: 'Working',
      });
    });

    it('returns deep copy of state', () => {
      agentInterface.availability.set(true);
      const current1 = agentInterface.availability.get();
      const current2 = agentInterface.availability.get();

      expect(current1).not.toBe(current2); // Different objects
      expect(current1).toEqual(current2); // Same values
    });
  });
});
