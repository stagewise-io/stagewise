import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentTransportAdapter, type AdapterOptions } from '@/agent/adapter';
import type { AgentInterface } from '@/agent/interface';
import type { AgentMessageUpdate } from '@/router/capabilities/messaging/types';
import type { UserMessage } from '@/router/capabilities/messaging/types';

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

/**
 * Helper to get the next value from an async iterator with timeout.
 * @param iterator The async iterator.
 * @param timeoutMs Timeout in milliseconds.
 * @returns A promise that resolves with the next value or rejects on timeout.
 */
async function _getNextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs = 100,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for next value'));
    }, timeoutMs);

    iterator
      .next()
      .then((result) => {
        clearTimeout(timer);
        resolve(result.value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Helper to collect multiple values from an async iterator.
 * @param iterator The async iterator.
 * @param count Number of values to collect.
 * @returns A promise that resolves with an array of values.
 */
async function collectNext<T>(
  iterator: AsyncIterator<T>,
  count: number,
): Promise<T[]> {
  const values: T[] = [];
  for (let i = 0; i < count; i++) {
    const value = await getNext(iterator);
    if (value !== undefined) {
      values.push(value as T);
    }
  }
  return values;
}

// --- Test Suite ---

describe('AgentTransportAdapterMessaging', () => {
  let adapter: AgentTransportAdapter;
  let agentInterface: AgentInterface;

  // Re-create the adapter before each test to ensure isolation
  beforeEach(() => {
    vi.useFakeTimers();
    const options: AdapterOptions = {
      toolCallTimeoutMs: 10000, // Use a round number for tests
    };
    adapter = new AgentTransportAdapter(options);
    agentInterface = adapter.getAgent();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Messaging Tests ---
  describe('Messaging Interface', () => {
    describe('Basic Operations', () => {
      it('should provide a full resync update to a new message subscriber', async () => {
        agentInterface.messaging.set([{ type: 'text', text: 'Hello' }]);

        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const resyncUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        expect(resyncUpdate.resync).toBe(true);
        expect(resyncUpdate.updateParts).toHaveLength(1);
        expect(resyncUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Hello',
        });
        expect(resyncUpdate.messageId).toBe(
          agentInterface.messaging.getCurrentId(),
        );
      });

      it('should provide empty resync update for empty message', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const resyncUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        expect(resyncUpdate.resync).toBe(true);
        expect(resyncUpdate.updateParts).toHaveLength(0);
        expect(resyncUpdate.messageId).toBe(
          agentInterface.messaging.getCurrentId(),
        );
      });

      it('should send an incremental update when agent adds a part', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // Consume initial resync

        agentInterface.messaging.addPart({ type: 'text', text: 'World' });
        const incrementalUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        expect(incrementalUpdate.resync).toBe(false);
        expect(incrementalUpdate.updateParts).toHaveLength(1);
        expect(incrementalUpdate.updateParts[0].contentIndex).toBe(0);
        expect(incrementalUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'World',
        });
      });

      it('should send a resync update when agent clears the message', async () => {
        agentInterface.messaging.addPart({
          type: 'text',
          text: 'Some content',
        });
        const oldMessageId = agentInterface.messaging.getCurrentId();

        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // Consume initial resync
        await getNext(messageIterator); // Consume the addPart update

        agentInterface.messaging.clear();
        const clearUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        const newMessageId = agentInterface.messaging.getCurrentId();

        expect(clearUpdate.resync).toBe(true);
        expect(clearUpdate.updateParts).toHaveLength(0);
        expect(clearUpdate.messageId).not.toBe(oldMessageId);
        expect(clearUpdate.messageId).toBe(newMessageId);
      });

      it('should handle setting a new message with multiple parts', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // Consume initial resync

        const newMessage = [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
          { type: 'text', text: 'Part 3' },
        ];

        agentInterface.messaging.set(newMessage as any);
        const setUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        expect(setUpdate.resync).toBe(true);
        expect(setUpdate.updateParts).toHaveLength(3);
        expect(setUpdate.updateParts[0].part).toEqual(newMessage[0]);
        expect(setUpdate.updateParts[1].part).toEqual(newMessage[1]);
        expect(setUpdate.updateParts[2].part).toEqual(newMessage[2]);
      });
    });

    describe('Multiple Subscribers', () => {
      it('should send updates to all active subscribers', async () => {
        const iterator1 = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const iterator2 = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();

        await getNext(iterator1); // consume initial resync
        await getNext(iterator2); // consume initial resync

        agentInterface.messaging.addPart({ type: 'text', text: 'Hello all' });

        const update1 = (await getNext(iterator1)) as AgentMessageUpdate;
        const update2 = (await getNext(iterator2)) as AgentMessageUpdate;

        expect(update1.resync).toBe(false);
        expect(update2.resync).toBe(false);
        expect(update1.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Hello all',
        });
        expect(update2.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Hello all',
        });
      });

      it('should handle multiple subscribers with different consumption rates', async () => {
        const iterator1 = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const iterator2 = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();

        await getNext(iterator1); // consume initial resync
        await getNext(iterator2); // consume initial resync

        // Add multiple parts rapidly
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 1' });
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 2' });
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 3' });

        // Iterator 1 consumes quickly
        const updates1 = await collectNext(iterator1, 3);

        // Iterator 2 consumes slowly
        const update2_1 = (await getNext(iterator2)) as AgentMessageUpdate;
        const update2_2 = (await getNext(iterator2)) as AgentMessageUpdate;
        const update2_3 = (await getNext(iterator2)) as AgentMessageUpdate;

        expect(updates1).toHaveLength(3);
        expect(update2_1.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Part 1',
        });
        expect(update2_2.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Part 2',
        });
        expect(update2_3.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Part 3',
        });
      });
    });

    describe('New Subscribers', () => {
      it('should provide current message state to new subscribers', async () => {
        agentInterface.messaging.set([{ type: 'text', text: 'Initial' }]);
        agentInterface.messaging.addPart({ type: 'text', text: 'Added' });

        // New subscriber connects after message has been built
        const newIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const resyncUpdate = (await getNext(newIterator)) as AgentMessageUpdate;

        expect(resyncUpdate.resync).toBe(true);
        expect(resyncUpdate.updateParts).toHaveLength(2);
        expect(resyncUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Initial',
        });
        expect(resyncUpdate.updateParts[1].part).toEqual({
          type: 'text',
          text: 'Added',
        });
      });

      it('should provide empty state to new subscribers after clear', async () => {
        agentInterface.messaging.set([{ type: 'text', text: 'Initial' }]);
        agentInterface.messaging.clear();

        const newIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const resyncUpdate = (await getNext(newIterator)) as AgentMessageUpdate;

        expect(resyncUpdate.resync).toBe(true);
        expect(resyncUpdate.updateParts).toHaveLength(0);
      });

      it('should handle subscribers connecting during rapid message building', async () => {
        // Start building a message
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 1' });

        // New subscriber connects and gets full current state
        const newIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const resyncUpdate = (await getNext(newIterator)) as AgentMessageUpdate;

        expect(resyncUpdate.resync).toBe(true);
        expect(resyncUpdate.updateParts).toHaveLength(1);
        expect(resyncUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Part 1',
        });

        // Continue building - new subscriber should get incremental updates
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 2' });
        const incrementalUpdate = (await getNext(
          newIterator,
        )) as AgentMessageUpdate;

        expect(incrementalUpdate.resync).toBe(false);
        expect(incrementalUpdate.updateParts).toHaveLength(1);
        // The subscriber should get an incremental update (could be queued Part 1 or new Part 2)
        expect(
          incrementalUpdate.updateParts[0].contentIndex,
        ).toBeGreaterThanOrEqual(0);
        expect(incrementalUpdate.updateParts[0].part.type).toBe('text');
      });
    });

    describe('State Transitions', () => {
      it('should handle complex message lifecycle', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Build initial message
        agentInterface.messaging.set([{ type: 'text', text: 'Initial' }]);
        const setUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        expect(setUpdate.resync).toBe(true);
        expect(setUpdate.updateParts).toHaveLength(1);

        // Add parts
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 1' });
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 2' });

        const addUpdate1 = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        const addUpdate2 = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        expect(addUpdate1.resync).toBe(false);
        expect(addUpdate2.resync).toBe(false);
        expect(addUpdate1.updateParts[0].contentIndex).toBe(1);
        expect(addUpdate2.updateParts[0].contentIndex).toBe(2);

        // Clear and start new message
        agentInterface.messaging.clear();
        const clearUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        expect(clearUpdate.resync).toBe(true);
        expect(clearUpdate.updateParts).toHaveLength(0);

        // Build new message
        agentInterface.messaging.set([{ type: 'text', text: 'New message' }]);
        const newSetUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        expect(newSetUpdate.resync).toBe(true);
        expect(newSetUpdate.updateParts).toHaveLength(1);
        expect(newSetUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'New message',
        });
      });

      it('should handle rapid state changes', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Make rapid changes
        agentInterface.messaging.set([{ type: 'text', text: 'Message 1' }]);
        agentInterface.messaging.clear();
        agentInterface.messaging.set([{ type: 'text', text: 'Message 2' }]);
        agentInterface.messaging.addPart({ type: 'text', text: 'Added part' });

        // Should receive all updates in order
        const updates = await collectNext(messageIterator, 4);

        expect(updates[0].resync).toBe(true);
        expect(updates[0].updateParts).toHaveLength(1);
        expect(updates[0].updateParts[0].part).toEqual({
          type: 'text',
          text: 'Message 1',
        });

        expect(updates[1].resync).toBe(true);
        expect(updates[1].updateParts).toHaveLength(0);

        expect(updates[2].resync).toBe(true);
        expect(updates[2].updateParts).toHaveLength(1);
        expect(updates[2].updateParts[0].part).toEqual({
          type: 'text',
          text: 'Message 2',
        });

        expect(updates[3].resync).toBe(false);
        expect(updates[3].updateParts[0].part).toEqual({
          type: 'text',
          text: 'Added part',
        });
      });
    });

    describe('Iterator Pipeline Edge Cases', () => {
      it('should handle iterator disconnection gracefully', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Simulate iterator being abandoned/disconnected
        // The iterator should not block other operations
        agentInterface.messaging.addPart({
          type: 'text',
          text: 'Should not block',
        });

        // Create new iterator - should work fine
        const newIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const resyncUpdate = (await getNext(newIterator)) as AgentMessageUpdate;

        expect(resyncUpdate.resync).toBe(true);
        expect(resyncUpdate.updateParts).toHaveLength(1);
        expect(resyncUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Should not block',
        });
      });

      it('should handle backpressure with slow consumers', async () => {
        const fastIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const slowIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();

        await getNext(fastIterator); // consume initial resync
        await getNext(slowIterator); // consume initial resync

        // Add multiple parts
        for (let i = 0; i < 5; i++) {
          agentInterface.messaging.addPart({ type: 'text', text: `Part ${i}` });
        }

        // Fast consumer should get all updates
        const fastUpdates = await collectNext(fastIterator, 5);
        expect(fastUpdates).toHaveLength(5);

        // Slow consumer should also get all updates (even if consumed later)
        const slowUpdates = await collectNext(slowIterator, 5);
        expect(slowUpdates).toHaveLength(5);

        // Verify content is identical
        for (let i = 0; i < 5; i++) {
          expect(fastUpdates[i].updateParts[0].part).toEqual(
            slowUpdates[i].updateParts[0].part,
          );
        }
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty parts', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        agentInterface.messaging.addPart({ type: 'text', text: '' });
        const update = (await getNext(messageIterator)) as AgentMessageUpdate;

        expect(update.resync).toBe(false);
        expect(update.updateParts[0].part).toEqual({ type: 'text', text: '' });
      });

      it('should handle large messages', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Create a large message
        const largeParts = Array.from({ length: 100 }, (_, i) => ({
          type: 'text',
          text: `Part ${i}`,
        }));

        agentInterface.messaging.set(largeParts as any);
        const setUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        expect(setUpdate.resync).toBe(true);
        expect(setUpdate.updateParts).toHaveLength(100);
        expect(setUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Part 0',
        });
        expect(setUpdate.updateParts[99].part).toEqual({
          type: 'text',
          text: 'Part 99',
        });
      });

      it('should handle different message part types', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Test different part types
        agentInterface.messaging.addPart({ type: 'text', text: 'Text part' });
        agentInterface.messaging.addPart({
          type: 'tool_call',
          toolName: 'test_tool',
          toolCallId: 'call_123',
          parameters: { param: 'value' },
        } as any);

        const textUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        const toolUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        expect(textUpdate.updateParts[0].part.type).toBe('text');
        expect(toolUpdate.updateParts[0].part.type).toBe('tool_call');
      });

      it('should handle message ID consistency', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const initialResync = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        const initialId = initialResync.messageId;

        // Adding parts should not change message ID
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 1' });
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 2' });

        const update1 = (await getNext(messageIterator)) as AgentMessageUpdate;
        const update2 = (await getNext(messageIterator)) as AgentMessageUpdate;

        expect(update1.messageId).toBe(initialId);
        expect(update2.messageId).toBe(initialId);

        // Clearing should change message ID
        agentInterface.messaging.clear();
        const clearUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        expect(clearUpdate.messageId).not.toBe(initialId);

        // Setting new message should create a new ID
        const preSetId = clearUpdate.messageId;
        agentInterface.messaging.set([{ type: 'text', text: 'New message' }]);
        const setUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        expect(setUpdate.messageId).not.toBe(preSetId);
      });

      it('should create new ID every time set() is called', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // First set
        agentInterface.messaging.set([{ type: 'text', text: 'Message 1' }]);
        const update1 = (await getNext(messageIterator)) as AgentMessageUpdate;

        // Second set should create new ID
        agentInterface.messaging.set([{ type: 'text', text: 'Message 2' }]);
        const update2 = (await getNext(messageIterator)) as AgentMessageUpdate;

        // Third set should create new ID
        agentInterface.messaging.set([{ type: 'text', text: 'Message 3' }]);
        const update3 = (await getNext(messageIterator)) as AgentMessageUpdate;

        expect(update1.messageId).not.toBe(update2.messageId);
        expect(update2.messageId).not.toBe(update3.messageId);
        expect(update1.messageId).not.toBe(update3.messageId);
      });

      it('should create new ID when clear() is called', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const initialResync = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        const initialId = initialResync.messageId;

        // Build up some content
        agentInterface.messaging.addPart({
          type: 'text',
          text: 'Some content',
        });
        await getNext(messageIterator); // consume the update

        // Clear should create new ID
        agentInterface.messaging.clear();
        const clearUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        expect(clearUpdate.messageId).not.toBe(initialId);

        // Multiple clears should create new IDs each time
        const firstClearId = clearUpdate.messageId;
        agentInterface.messaging.clear();
        const secondClearUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;
        expect(secondClearUpdate.messageId).not.toBe(firstClearId);
      });

      it('should send only delta text when using updatePart with append mode', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Add initial part with some text
        agentInterface.messaging.addPart({ type: 'text', text: 'Hello' });
        await getNext(messageIterator); // consume the add update

        // Use updatePart to append text
        agentInterface.messaging.updatePart(
          { type: 'text', text: ' World' },
          0,
          'append',
        );

        const appendUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        // The update should only contain the delta text, not the full text
        expect(appendUpdate.resync).toBe(false);
        expect(appendUpdate.updateParts).toHaveLength(1);
        expect(appendUpdate.updateParts[0].contentIndex).toBe(0);
        expect(appendUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: ' World', // Only the appended text, not 'Hello World'
        });

        // Verify the internal state has the full text
        const currentMessage = agentInterface.messaging.get();
        expect(currentMessage).toHaveLength(1);
        expect(currentMessage[0]).toEqual({
          type: 'text',
          text: 'Hello World', // Full text in internal state
        });
      });

      it('should send full content when using updatePart with replace mode', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Add initial part
        agentInterface.messaging.addPart({
          type: 'text',
          text: 'Original text',
        });
        await getNext(messageIterator); // consume the add update

        // Use updatePart to replace text
        agentInterface.messaging.updatePart(
          { type: 'text', text: 'Replacement text' },
          0,
          'replace',
        );

        const replaceUpdate = (await getNext(
          messageIterator,
        )) as AgentMessageUpdate;

        // The update should contain the full replacement text
        expect(replaceUpdate.resync).toBe(false);
        expect(replaceUpdate.updateParts).toHaveLength(1);
        expect(replaceUpdate.updateParts[0].contentIndex).toBe(0);
        expect(replaceUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Replacement text', // Full replacement text
        });

        // Verify the internal state
        const currentMessage = agentInterface.messaging.get();
        expect(currentMessage[0]).toEqual({
          type: 'text',
          text: 'Replacement text',
        });
      });

      it('should handle multiple append operations sending only deltas', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Add initial part
        agentInterface.messaging.addPart({ type: 'text', text: 'Start' });
        await getNext(messageIterator); // consume the add update

        // Append multiple times
        const appends = [' Middle', ' End', '!'];
        for (const appendText of appends) {
          agentInterface.messaging.updatePart(
            { type: 'text', text: appendText },
            0,
            'append',
          );
        }

        // Get all append updates
        const updates = await collectNext(messageIterator, 3);

        // Each update should only contain its delta
        expect(updates[0].updateParts[0].part).toEqual({
          type: 'text',
          text: ' Middle',
        });
        expect(updates[1].updateParts[0].part).toEqual({
          type: 'text',
          text: ' End',
        });
        expect(updates[2].updateParts[0].part).toEqual({
          type: 'text',
          text: '!',
        });

        // Verify final state
        const currentMessage = agentInterface.messaging.get();
        expect(currentMessage[0]).toEqual({
          type: 'text',
          text: 'Start Middle End!',
        });
      });

      it('should allow updatePart to add a new part at the highest index + 1', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Add initial parts
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 0' });
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 1' });
        await collectNext(messageIterator, 2); // consume the updates

        // Use updatePart to add a new part at index 2 (highest + 1)
        agentInterface.messaging.updatePart(
          { type: 'text', text: 'Part 2 via updatePart' },
          2,
          'replace',
        );

        const update = (await getNext(messageIterator)) as AgentMessageUpdate;
        expect(update.resync).toBe(false);
        expect(update.updateParts).toHaveLength(1);
        expect(update.updateParts[0].contentIndex).toBe(2);
        expect(update.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Part 2 via updatePart',
        });

        // Verify the message now has 3 parts
        const currentMessage = agentInterface.messaging.get();
        expect(currentMessage).toHaveLength(3);
        expect(currentMessage[2]).toEqual({
          type: 'text',
          text: 'Part 2 via updatePart',
        });
      });

      it('should not allow updatePart to add a part at index > highest + 1', async () => {
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 0' });
        agentInterface.messaging.addPart({ type: 'text', text: 'Part 1' });

        // Try to add at index 3 (should fail, as highest is 1)
        expect(() => {
          agentInterface.messaging.updatePart(
            { type: 'text', text: 'Invalid' },
            3,
            'replace',
          );
        }).toThrow('Invalid index 3 for message content update.');
      });

      it('should handle updatePart adding to empty message', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Use updatePart to add first part to empty message
        agentInterface.messaging.updatePart(
          { type: 'text', text: 'First part via updatePart' },
          0,
          'replace',
        );

        const update = (await getNext(messageIterator)) as AgentMessageUpdate;
        expect(update.resync).toBe(false);
        expect(update.updateParts).toHaveLength(1);
        expect(update.updateParts[0].contentIndex).toBe(0);
        expect(update.updateParts[0].part).toEqual({
          type: 'text',
          text: 'First part via updatePart',
        });

        // Verify message ID was created
        expect(agentInterface.messaging.getCurrentId()).not.toBeNull();
      });

      it('should return current message state by value with getCurrentMessage', () => {
        agentInterface.messaging.set([
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ]);

        const messageId = agentInterface.messaging.getCurrentId();
        const currentMessage = agentInterface.messaging.getCurrentMessage();

        expect(currentMessage.id).toBe(messageId);
        expect(currentMessage.parts).toHaveLength(2);
        expect(currentMessage.parts[0]).toEqual({
          type: 'text',
          text: 'Part 1',
        });
        expect(currentMessage.parts[1]).toEqual({
          type: 'text',
          text: 'Part 2',
        });

        // Verify it returns by value (modifications don't affect internal state)
        // @ts-expect-error - text does exist, because we checked it above
        currentMessage.parts[0].text = 'Modified';
        currentMessage.id = 'modified-id';

        const newMessage = agentInterface.messaging.getCurrentMessage();
        expect(newMessage.id).toBe(messageId);
        // @ts-expect-error - text does exist, because we checked it above
        expect(newMessage.parts[0].text).toBe('Part 1');
      });

      it('should return empty message state with getCurrentMessage when no message', () => {
        const currentMessage = agentInterface.messaging.getCurrentMessage();

        expect(currentMessage.id).toBeNull();
        expect(currentMessage.parts).toEqual([]);
      });

      it('should send all parts to late subscribers in one resync chunk', async () => {
        // Build up a complex message with multiple operations
        agentInterface.messaging.set([
          { type: 'text', text: 'Initial part' },
          { type: 'text', text: 'Second part' },
        ]);
        agentInterface.messaging.addPart({ type: 'text', text: 'Third part' });
        agentInterface.messaging.addPart({ type: 'text', text: 'Fourth part' });

        // Late subscriber connects
        const lateSubscriber = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const resyncUpdate = (await getNext(
          lateSubscriber,
        )) as AgentMessageUpdate;

        // Should get all parts in one resync update
        expect(resyncUpdate.resync).toBe(true);
        expect(resyncUpdate.updateParts).toHaveLength(4);
        expect(resyncUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Initial part',
        });
        expect(resyncUpdate.updateParts[1].part).toEqual({
          type: 'text',
          text: 'Second part',
        });
        expect(resyncUpdate.updateParts[2].part).toEqual({
          type: 'text',
          text: 'Third part',
        });
        expect(resyncUpdate.updateParts[3].part).toEqual({
          type: 'text',
          text: 'Fourth part',
        });

        // Verify content indexes are correct
        expect(resyncUpdate.updateParts[0].contentIndex).toBe(0);
        expect(resyncUpdate.updateParts[1].contentIndex).toBe(1);
        expect(resyncUpdate.updateParts[2].contentIndex).toBe(2);
        expect(resyncUpdate.updateParts[3].contentIndex).toBe(3);
      });

      it('should handle late subscriber after multiple message lifecycles', async () => {
        // First message
        agentInterface.messaging.set([{ type: 'text', text: 'First message' }]);
        agentInterface.messaging.addPart({
          type: 'text',
          text: 'First addition',
        });

        // Clear and start second message
        agentInterface.messaging.clear();
        agentInterface.messaging.set([
          { type: 'text', text: 'Second message' },
        ]);
        agentInterface.messaging.addPart({
          type: 'text',
          text: 'Second addition',
        });

        // Clear and start third message
        agentInterface.messaging.clear();
        agentInterface.messaging.addPart({
          type: 'text',
          text: 'Third message',
        });

        // Late subscriber should only get the current (third) message
        const lateSubscriber = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const resyncUpdate = (await getNext(
          lateSubscriber,
        )) as AgentMessageUpdate;

        expect(resyncUpdate.resync).toBe(true);
        expect(resyncUpdate.updateParts).toHaveLength(1);
        expect(resyncUpdate.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Third message',
        });
      });
    });

    describe('User Message Handling', () => {
      it('should notify agent listener when onUserMessage is called', () => {
        const listener = vi.fn();
        agentInterface.messaging.addUserMessageListener(listener);

        const userMessage: UserMessage = {
          id: 'user-msg-1',
          contentItems: [{ type: 'text', text: 'User says hi' }],
          createdAt: new Date(),
          metadata: {} as any, // Mock metadata
          pluginContent: {},
          sentByPlugin: false,
        };

        adapter.messaging.onUserMessage(userMessage);

        expect(listener).toHaveBeenCalledWith(userMessage);
      });

      it('should handle multiple user message listeners', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        agentInterface.messaging.addUserMessageListener(listener1);
        agentInterface.messaging.addUserMessageListener(listener2);
        agentInterface.messaging.addUserMessageListener(listener3);

        const userMessage: UserMessage = {
          id: 'user-msg-2',
          contentItems: [{ type: 'text', text: 'Multiple listeners' }],
          createdAt: new Date(),
          metadata: {} as any,
          pluginContent: {},
          sentByPlugin: false,
        };

        adapter.messaging.onUserMessage(userMessage);

        expect(listener1).toHaveBeenCalledWith(userMessage);
        expect(listener2).toHaveBeenCalledWith(userMessage);
        expect(listener3).toHaveBeenCalledWith(userMessage);
      });

      it('should handle user message listener removal', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        agentInterface.messaging.addUserMessageListener(listener1);
        agentInterface.messaging.addUserMessageListener(listener2);

        const userMessage: UserMessage = {
          id: 'user-msg-3',
          contentItems: [{ type: 'text', text: 'Before removal' }],
          createdAt: new Date(),
          metadata: {} as any,
          pluginContent: {},
          sentByPlugin: false,
        };

        adapter.messaging.onUserMessage(userMessage);

        expect(listener1).toHaveBeenCalledWith(userMessage);
        expect(listener2).toHaveBeenCalledWith(userMessage);

        // Remove first listener
        agentInterface.messaging.removeUserMessageListener(listener1);

        const userMessage2: UserMessage = {
          id: 'user-msg-4',
          contentItems: [{ type: 'text', text: 'After removal' }],
          createdAt: new Date(),
          metadata: {} as any,
          pluginContent: {},
          sentByPlugin: false,
        };

        adapter.messaging.onUserMessage(userMessage2);

        expect(listener1).toHaveBeenCalledTimes(1); // Should not be called again
        expect(listener2).toHaveBeenCalledTimes(2); // Should be called twice
      });

      it('should handle user messages with different content types', () => {
        const listener = vi.fn();
        agentInterface.messaging.addUserMessageListener(listener);

        const userMessageWithMultipleItems: UserMessage = {
          id: 'user-msg-5',
          contentItems: [
            { type: 'text', text: 'Text content' },
            { type: 'text', text: 'More text' },
          ],
          createdAt: new Date(),
          metadata: {} as any,
          pluginContent: {
            somePlugin: { data: { type: 'text', text: 'value' } },
          },
          sentByPlugin: true,
        };

        adapter.messaging.onUserMessage(userMessageWithMultipleItems);

        expect(listener).toHaveBeenCalledWith(userMessageWithMultipleItems);
        expect(listener.mock.calls[0][0].contentItems).toHaveLength(2);
        expect(listener.mock.calls[0][0].sentByPlugin).toBe(true);
      });

      it('should handle user message listeners with errors', () => {
        const goodListener = vi.fn();
        const badListener = vi.fn(() => {
          throw new Error('Listener error');
        });
        const anotherGoodListener = vi.fn();

        agentInterface.messaging.addUserMessageListener(goodListener);
        agentInterface.messaging.addUserMessageListener(badListener);
        agentInterface.messaging.addUserMessageListener(anotherGoodListener);

        const userMessage: UserMessage = {
          id: 'user-msg-6',
          contentItems: [{ type: 'text', text: 'Error handling test' }],
          createdAt: new Date(),
          metadata: {} as any,
          pluginContent: {},
          sentByPlugin: false,
        };

        // Current implementation throws when a listener throws
        expect(() => {
          adapter.messaging.onUserMessage(userMessage);
        }).toThrow('Listener error');

        expect(goodListener).toHaveBeenCalledWith(userMessage);
        expect(badListener).toHaveBeenCalledWith(userMessage);
        // anotherGoodListener won't be called because the error stops iteration
      });
    });

    describe('Concurrent Operations', () => {
      it('should handle concurrent message building and clearing', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Simulate concurrent operations
        const operations = [
          () =>
            agentInterface.messaging.addPart({ type: 'text', text: 'Part A' }),
          () =>
            agentInterface.messaging.addPart({ type: 'text', text: 'Part B' }),
          () => agentInterface.messaging.clear(),
          () =>
            agentInterface.messaging.set([
              { type: 'text', text: 'New message' },
            ]),
          () =>
            agentInterface.messaging.addPart({ type: 'text', text: 'Part C' }),
        ];

        // Execute operations rapidly
        operations.forEach((op) => op());

        // Should handle all operations without errors
        const updates = await collectNext(messageIterator, 5);
        expect(updates).toHaveLength(5);

        // Verify final state
        const finalIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const finalState = (await getNext(finalIterator)) as AgentMessageUpdate;

        expect(finalState.resync).toBe(true);
        expect(finalState.updateParts).toHaveLength(2);
        expect(finalState.updateParts[0].part).toEqual({
          type: 'text',
          text: 'New message',
        });
        expect(finalState.updateParts[1].part).toEqual({
          type: 'text',
          text: 'Part C',
        });
      });

      it('should handle concurrent user messages', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        agentInterface.messaging.addUserMessageListener(listener1);
        agentInterface.messaging.addUserMessageListener(listener2);

        const userMessages: UserMessage[] = [
          {
            id: 'concurrent-1',
            contentItems: [{ type: 'text', text: 'Message 1' }],
            createdAt: new Date(),
            metadata: {} as any,
            pluginContent: {},
            sentByPlugin: false,
          },
          {
            id: 'concurrent-2',
            contentItems: [{ type: 'text', text: 'Message 2' }],
            createdAt: new Date(),
            metadata: {} as any,
            pluginContent: {},
            sentByPlugin: false,
          },
          {
            id: 'concurrent-3',
            contentItems: [{ type: 'text', text: 'Message 3' }],
            createdAt: new Date(),
            metadata: {} as any,
            pluginContent: {},
            sentByPlugin: false,
          },
        ];

        // Send messages concurrently
        userMessages.forEach((msg) => {
          adapter.messaging.onUserMessage(msg);
        });

        expect(listener1).toHaveBeenCalledTimes(3);
        expect(listener2).toHaveBeenCalledTimes(3);

        // Verify all messages were received
        userMessages.forEach((msg, index) => {
          expect(listener1).toHaveBeenNthCalledWith(index + 1, msg);
          expect(listener2).toHaveBeenNthCalledWith(index + 1, msg);
        });
      });
    });

    describe('Memory and Performance', () => {
      it('should handle message history without memory leaks', async () => {
        const messageIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        await getNext(messageIterator); // consume initial resync

        // Create many messages to test memory handling
        for (let i = 0; i < 50; i++) {
          agentInterface.messaging.set([
            { type: 'text', text: `Message ${i}` },
          ]);
          await getNext(messageIterator); // consume each update
        }

        // Final state should only contain the last message
        const finalIterator = adapter.messaging
          .getMessage()
          [Symbol.asyncIterator]();
        const finalState = (await getNext(finalIterator)) as AgentMessageUpdate;

        expect(finalState.updateParts).toHaveLength(1);
        expect(finalState.updateParts[0].part).toEqual({
          type: 'text',
          text: 'Message 49',
        });
      });

      it('should handle many subscribers efficiently', async () => {
        const numSubscribers = 20;
        const iterators = Array.from({ length: numSubscribers }, () =>
          adapter.messaging.getMessage()[Symbol.asyncIterator](),
        );

        // Consume initial resync for all iterators
        await Promise.all(iterators.map((it) => getNext(it)));

        // Add a part - should notify all subscribers
        agentInterface.messaging.addPart({
          type: 'text',
          text: 'Broadcast message',
        });

        // All subscribers should receive the update
        const updates = await Promise.all(iterators.map((it) => getNext(it)));

        updates.forEach((update) => {
          expect(update!.resync).toBe(false);
          expect(update!.updateParts[0].part).toEqual({
            type: 'text',
            text: 'Broadcast message',
          });
        });
      });
    });
  });
});
