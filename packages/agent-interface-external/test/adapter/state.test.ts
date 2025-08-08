import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentTransportAdapter, type AdapterOptions } from '@/agent/adapter';
import type { AgentInterface } from '@/agent/interface';
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

describe('AgentTransportAdapter - State', () => {
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
    it('starts with idle state', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      const initial = (await getNext(iterator)) as AgentState;

      expect(initial).toEqual({
        state: AgentStateType.IDLE,
        description: undefined,
      });
    });
  });

  describe('Setting State', () => {
    it('sets state without description', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.state.set(AgentStateType.THINKING);
      const update = (await getNext(iterator)) as AgentState;

      expect(update).toEqual({
        state: AgentStateType.THINKING,
        description: undefined,
      });
    });

    it('sets state with description', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.state.set(
        AgentStateType.WORKING,
        'Processing your request',
      );
      const update = (await getNext(iterator)) as AgentState;

      expect(update).toEqual({
        state: AgentStateType.WORKING,
        description: 'Processing your request',
      });
    });

    it('sets state with empty description', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.state.set(AgentStateType.FAILED, '');
      const update = (await getNext(iterator)) as AgentState;

      expect(update).toEqual({
        state: AgentStateType.FAILED,
        description: '',
      });
    });

    it('overwrites previous description when setting new state', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.state.set(AgentStateType.THINKING, 'Initial processing');
      const update1 = (await getNext(iterator)) as AgentState;
      expect(update1.description).toBe('Initial processing');

      agentInterface.state.set(AgentStateType.WORKING);
      const update2 = (await getNext(iterator)) as AgentState;
      expect(update2.description).toBeUndefined();
    });
  });

  describe('State Transitions', () => {
    it('transitions through typical workflow states', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      // IDLE -> THINKING -> WORKING -> COMPLETED
      agentInterface.state.set(AgentStateType.THINKING, 'Analyzing request');
      const thinking = (await getNext(iterator)) as AgentState;
      expect(thinking).toEqual({
        state: AgentStateType.THINKING,
        description: 'Analyzing request',
      });

      agentInterface.state.set(AgentStateType.WORKING, 'Executing task');
      const working = (await getNext(iterator)) as AgentState;
      expect(working).toEqual({
        state: AgentStateType.WORKING,
        description: 'Executing task',
      });

      agentInterface.state.set(AgentStateType.COMPLETED, 'Task finished');
      const completed = (await getNext(iterator)) as AgentState;
      expect(completed).toEqual({
        state: AgentStateType.COMPLETED,
        description: 'Task finished',
      });
    });

    it('handles error state transitions', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.state.set(AgentStateType.WORKING, 'Processing');
      const working = (await getNext(iterator)) as AgentState;
      expect(working.state).toBe(AgentStateType.WORKING);

      agentInterface.state.set(AgentStateType.FAILED, 'Network error occurred');
      const failed = (await getNext(iterator)) as AgentState;
      expect(failed).toEqual({
        state: AgentStateType.FAILED,
        description: 'Network error occurred',
      });
    });

    it('handles rapid state changes', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      // Make rapid changes
      agentInterface.state.set(AgentStateType.THINKING, 'Step 1');
      agentInterface.state.set(AgentStateType.WORKING, 'Step 2');
      agentInterface.state.set(AgentStateType.COMPLETED, 'Step 3');

      // Should receive all updates in order
      const update1 = (await getNext(iterator)) as AgentState;
      expect(update1).toEqual({
        state: AgentStateType.THINKING,
        description: 'Step 1',
      });

      const update2 = (await getNext(iterator)) as AgentState;
      expect(update2).toEqual({
        state: AgentStateType.WORKING,
        description: 'Step 2',
      });

      const update3 = (await getNext(iterator)) as AgentState;
      expect(update3).toEqual({
        state: AgentStateType.COMPLETED,
        description: 'Step 3',
      });
    });

    it('handles state transitions with same state but different descriptions', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.state.set(AgentStateType.WORKING, 'Phase 1');
      const update1 = (await getNext(iterator)) as AgentState;
      expect(update1.description).toBe('Phase 1');

      agentInterface.state.set(AgentStateType.WORKING, 'Phase 2');
      const update2 = (await getNext(iterator)) as AgentState;
      expect(update2.description).toBe('Phase 2');

      agentInterface.state.set(AgentStateType.WORKING, 'Phase 3');
      const update3 = (await getNext(iterator)) as AgentState;
      expect(update3.description).toBe('Phase 3');
    });

    it('handles cycle back to initial state', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      agentInterface.state.set(AgentStateType.COMPLETED, 'Task done');
      const completed = (await getNext(iterator)) as AgentState;
      expect(completed.state).toBe(AgentStateType.COMPLETED);

      agentInterface.state.set(AgentStateType.IDLE);
      const idle = (await getNext(iterator)) as AgentState;
      expect(idle).toEqual({
        state: AgentStateType.IDLE,
        description: undefined,
      });
    });
  });

  describe('Multiple Subscribers', () => {
    it('sends updates to all active subscribers', async () => {
      const iterator1 = adapter.state.getState()[Symbol.asyncIterator]();
      const iterator2 = adapter.state.getState()[Symbol.asyncIterator]();

      await getNext(iterator1); // consume initial
      await getNext(iterator2); // consume initial

      agentInterface.state.set(AgentStateType.THINKING, 'Processing');

      const update1 = (await getNext(iterator1)) as AgentState;
      const update2 = (await getNext(iterator2)) as AgentState;

      expect(update1).toEqual({
        state: AgentStateType.THINKING,
        description: 'Processing',
      });
      expect(update2).toEqual({
        state: AgentStateType.THINKING,
        description: 'Processing',
      });
    });

    // Test data for parametrized tests
    const newSubscriberTestCases = [
      {
        name: 'provides current state to new subscribers',
        state: AgentStateType.COMPLETED,
        description: 'All done',
        setupStates: [
          { state: AgentStateType.WORKING, description: 'In progress' },
          { state: AgentStateType.COMPLETED, description: 'All done' },
        ],
      },
      {
        name: 'provides current state with no description to new subscribers',
        state: AgentStateType.WAITING_FOR_USER_RESPONSE,
        description: undefined,
        setupStates: [
          {
            state: AgentStateType.WAITING_FOR_USER_RESPONSE,
            description: undefined,
          },
        ],
      },
    ];

    it.each(newSubscriberTestCases)(
      '$name',
      async ({ state, description, setupStates }) => {
        // Set up the state(s)
        for (const setup of setupStates) {
          if (setup.description !== undefined) {
            agentInterface.state.set(setup.state, setup.description);
          } else {
            agentInterface.state.set(setup.state);
          }
        }

        // New subscriber connects after state has changed
        const newIterator = adapter.state.getState()[Symbol.asyncIterator]();
        const immediateValue = (await getNext(newIterator)) as AgentState;

        expect(immediateValue).toEqual({
          state,
          description,
        });
      },
    );

    it('handles multiple subscribers with different consumption rates', async () => {
      const iterator1 = adapter.state.getState()[Symbol.asyncIterator]();
      const iterator2 = adapter.state.getState()[Symbol.asyncIterator]();

      await getNext(iterator1); // consume initial
      await getNext(iterator2); // consume initial

      // Make several state changes
      agentInterface.state.set(AgentStateType.THINKING, 'Step 1');
      agentInterface.state.set(AgentStateType.WORKING, 'Step 2');
      agentInterface.state.set(AgentStateType.COMPLETED, 'Step 3');

      // First subscriber reads all updates
      const update1a = (await getNext(iterator1)) as AgentState;
      const update1b = (await getNext(iterator1)) as AgentState;
      const update1c = (await getNext(iterator1)) as AgentState;

      expect(update1a.state).toBe(AgentStateType.THINKING);
      expect(update1b.state).toBe(AgentStateType.WORKING);
      expect(update1c.state).toBe(AgentStateType.COMPLETED);

      // Second subscriber can still read all updates
      const update2a = (await getNext(iterator2)) as AgentState;
      const update2b = (await getNext(iterator2)) as AgentState;
      const update2c = (await getNext(iterator2)) as AgentState;

      expect(update2a.state).toBe(AgentStateType.THINKING);
      expect(update2b.state).toBe(AgentStateType.WORKING);
      expect(update2c.state).toBe(AgentStateType.COMPLETED);
    });
  });

  describe('State Types', () => {
    // Test data for parametrized tests
    const stateTestCases = [
      {
        state: AgentStateType.IDLE,
        description: 'Waiting for input',
      },
      {
        state: AgentStateType.THINKING,
        description: 'Analyzing request',
      },
      {
        state: AgentStateType.WORKING,
        description: 'Executing task',
      },
      {
        state: AgentStateType.CALLING_TOOL,
        description: 'Invoking external API',
      },
      {
        state: AgentStateType.WAITING_FOR_USER_RESPONSE,
        description: 'Needs user input',
      },
      {
        state: AgentStateType.FAILED,
        description: 'Operation failed',
      },
      {
        state: AgentStateType.COMPLETED,
        description: 'Task successfully completed',
      },
    ];

    it.each(stateTestCases)(
      'handles $state state',
      async ({ state, description }) => {
        const iterator = adapter.state.getState()[Symbol.asyncIterator]();
        await getNext(iterator); // consume initial

        agentInterface.state.set(state, description);
        const update = (await getNext(iterator)) as AgentState;

        expect(update).toEqual({
          state,
          description,
        });
      },
    );

    it('handles all states without descriptions', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      const states = [
        AgentStateType.IDLE,
        AgentStateType.THINKING,
        AgentStateType.WORKING,
        AgentStateType.CALLING_TOOL,
        AgentStateType.WAITING_FOR_USER_RESPONSE,
        AgentStateType.FAILED,
        AgentStateType.COMPLETED,
      ];

      for (const state of states) {
        agentInterface.state.set(state);
        const update = (await getNext(iterator)) as AgentState;
        expect(update).toEqual({
          state,
          description: undefined,
        });
      }
    });
  });

  describe('State Getter', () => {
    // Test data for parametrized tests
    const stateGetterTestCases = [
      {
        name: 'returns current state',
        state: AgentStateType.WORKING,
        description: 'Processing data',
      },
      {
        name: 'returns current state without description',
        state: AgentStateType.THINKING,
        description: undefined,
      },
    ];

    it.each(stateGetterTestCases)('$name', ({ state, description }) => {
      if (description !== undefined) {
        agentInterface.state.set(state, description);
      } else {
        agentInterface.state.set(state);
      }
      const current = agentInterface.state.get();
      expect(current).toEqual({
        state,
        description,
      });
    });

    it('returns initial state when no changes made', () => {
      const current = agentInterface.state.get();
      expect(current).toEqual({
        state: AgentStateType.IDLE,
        description: undefined,
      });
    });

    it('returns deep copy of state', () => {
      agentInterface.state.set(AgentStateType.COMPLETED, 'Done');
      const current1 = agentInterface.state.get();
      const current2 = agentInterface.state.get();

      expect(current1).not.toBe(current2); // Different objects
      expect(current1).toEqual(current2); // Same values
    });

    it('returns updated state after changes', () => {
      agentInterface.state.set(AgentStateType.THINKING, 'Initial');
      const state1 = agentInterface.state.get();
      expect(state1.description).toBe('Initial');

      agentInterface.state.set(AgentStateType.WORKING, 'Updated');
      const state2 = agentInterface.state.get();
      expect(state2.description).toBe('Updated');
      expect(state2.state).toBe(AgentStateType.WORKING);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles concurrent state changes from multiple sources', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      // Simulate rapid concurrent changes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            agentInterface.state.set(AgentStateType.WORKING, `Batch ${i}`);
          }),
        );
      }
      await Promise.all(promises);

      // Should receive at least one update
      const update = (await getNext(iterator)) as AgentState;
      expect(update.state).toBe(AgentStateType.WORKING);
      expect(update.description).toMatch(/^Batch \d+$/);
    });

    it('handles iterator pipeline with long descriptions', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      const longDescription = 'A'.repeat(128); // Max allowed length
      agentInterface.state.set(AgentStateType.WORKING, longDescription);
      const update = (await getNext(iterator)) as AgentState;

      expect(update.description).toBe(longDescription);
      expect(update.description?.length).toBe(128);
    });

    it('handles state changes during iterator creation', async () => {
      // Change state before creating iterator
      agentInterface.state.set(AgentStateType.WORKING, 'Pre-iterator state');

      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      const initial = (await getNext(iterator)) as AgentState;

      // Should get the current state immediately
      expect(initial).toEqual({
        state: AgentStateType.WORKING,
        description: 'Pre-iterator state',
      });
    });

    it('handles rapid subscribe/unsubscribe cycles', async () => {
      // Create and abandon multiple iterators quickly
      for (let i = 0; i < 5; i++) {
        const iterator = adapter.state.getState()[Symbol.asyncIterator]();
        await getNext(iterator);
        // Iterator goes out of scope and should be GC'd
      }

      // Final iterator should still work
      const finalIterator = adapter.state.getState()[Symbol.asyncIterator]();
      const state = (await getNext(finalIterator)) as AgentState;
      expect(state.state).toBe(AgentStateType.IDLE);
    });

    it('handles state changes with special characters in description', async () => {
      const iterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(iterator); // consume initial

      const specialDescription =
        'Test with 🔥 emojis, "quotes", and \n newlines';
      agentInterface.state.set(AgentStateType.WORKING, specialDescription);
      const update = (await getNext(iterator)) as AgentState;

      expect(update.description).toBe(specialDescription);
    });
  });
});
