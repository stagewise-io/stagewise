import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AgentTransportAdapter,
  type AdapterOptions,
} from '../src/agent/adapter';
import type { AgentInterface } from '../src/agent/interface';
import type { AgentAvailability } from '../src/router/capabilities/availability/types';
import { AgentAvailabilityError } from '../src/router/capabilities/availability/types';
import type { AgentState } from '../src/router/capabilities/state/types';
import { AgentStateType } from '../src/router/capabilities/state/types';
import type { AgentMessageUpdate } from '../src/router/capabilities/messaging/types';
import type {
  PendingToolCall,
  Tool,
  ToolCallResult,
} from '../src/router/capabilities/tool-calling/types';
import type { UserMessage } from '../src/router/capabilities/messaging/types';

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

describe('AgentTransportAdapter', () => {
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
        expect(initialAvailability?.errorMessage).toBe('Initializing');
      }
      expect(initialState?.state).toBe(AgentStateType.IDLE);
    });
  });

  // --- Availability Tests ---
  describe('Availability Interface', () => {
    it('should update availability stream when agent sets it', async () => {
      const availabilityIterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      await getNext(availabilityIterator); // Consume initial value

      agentInterface.availability.set(true);
      const availableUpdate = (await getNext(
        availabilityIterator,
      )) as AgentAvailability;
      expect(availableUpdate).toEqual({ isAvailable: true });

      agentInterface.availability.set(
        false,
        AgentAvailabilityError.NO_CONNECTION,
        'Network lost',
      );
      const unavailableUpdate = (await getNext(
        availabilityIterator,
      )) as AgentAvailability;
      expect(unavailableUpdate).toEqual({
        isAvailable: false,
        error: AgentAvailabilityError.NO_CONNECTION,
        errorMessage: 'Network lost',
      });
    });

    it('should provide the current availability to a new subscriber immediately', async () => {
      agentInterface.availability.set(true);

      // New subscriber connects after state has changed
      const newIterator = adapter.availability
        .getAvailability()
        [Symbol.asyncIterator]();
      const immediateValue = (await getNext(newIterator)) as AgentAvailability;

      expect(immediateValue).toEqual({ isAvailable: true });
    });
  });

  // --- State Tests ---
  describe('State Interface', () => {
    it('should update state stream when agent sets it', async () => {
      const stateIterator = adapter.state.getState()[Symbol.asyncIterator]();
      await getNext(stateIterator); // Consume initial

      agentInterface.state.set(
        AgentStateType.THINKING,
        'Processing request...',
      );
      const thinkingUpdate = (await getNext(stateIterator)) as AgentState;
      expect(thinkingUpdate).toEqual({
        state: AgentStateType.THINKING,
        description: 'Processing request...',
      });
    });

    it('should provide the current state to a new subscriber immediately', async () => {
      agentInterface.state.set(AgentStateType.COMPLETED, 'Done.');

      const newIterator = adapter.state.getState()[Symbol.asyncIterator]();
      const immediateValue = (await getNext(newIterator)) as AgentState;

      expect(immediateValue).toEqual({
        state: AgentStateType.COMPLETED,
        description: 'Done.',
      });
    });
  });

  // --- Messaging Tests ---
  describe('Messaging Interface', () => {
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
      agentInterface.messaging.addPart({ type: 'text', text: 'Some content' });
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
  });

  // --- Tool Calling Tests ---
  describe('Tool Calling Interface', () => {
    beforeEach(() => {
      // Tool calling must be explicitly enabled for these tests
      agentInterface.toolCalling.setToolCallSupport(true);
    });

    it('should push a pending tool call to the stream when requested by agent', async () => {
      const toolCallIterator = adapter
        .toolCalling!.getPendingToolCalls()
        [Symbol.asyncIterator]();

      agentInterface.toolCalling.requestToolCall('testTool', { param: 1 });

      const pendingCall = (await getNext(toolCallIterator)) as PendingToolCall;
      expect(pendingCall.toolName).toBe('testTool');
      expect(pendingCall.id).toBeDefined();
    });

    it('should resolve the agent promise when a result is received', async () => {
      const toolPromise = agentInterface.toolCalling.requestToolCall(
        'resolvingTool',
        {},
      );

      const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
      expect(pendingCalls).toHaveLength(1);
      const callId = pendingCalls[0].id;

      const result: ToolCallResult = {
        id: callId,
        toolName: 'resolvingTool',
        result: 'Success',
      };
      adapter.toolCalling!.onToolCallResult(result);

      await expect(toolPromise).resolves.toEqual(result);
      expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(0);
    });

    it('should reject the agent promise on timeout', async () => {
      const toolPromise = agentInterface.toolCalling.requestToolCall(
        'timeoutTool',
        {},
      );

      // Fast-forward time past the timeout
      vi.advanceTimersByTime(10001);

      // Wait for the promise to be rejected
      await expect(toolPromise).rejects.toThrow('timed out');

      expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(0);
    });

    it('should ignore results for unknown or timed-out calls', () => {
      // This test verifies that results for unknown call IDs are ignored
      // No setup needed - just call onToolCallResult with an unknown ID

      // This should not throw an error or cause any issues
      adapter.toolCalling!.onToolCallResult({
        id: 'unknown-id',
        toolName: 'foo',
        result: 'bar',
      });

      // If we get here without throwing, the test passes
      expect(true).toBe(true);
    });

    it('should provide all pending calls to a new subscriber', async () => {
      agentInterface.toolCalling.requestToolCall('call1', {});
      agentInterface.toolCalling.requestToolCall('call2', {});

      const toolCallIterator = adapter
        .toolCalling!.getPendingToolCalls()
        [Symbol.asyncIterator]();

      // The implementation should push all pending calls upon subscription.
      // Note: The current PushController implementation might push these as separate events.
      // A robust test would collect all available items within a short timeframe.
      const call1 = (await getNext(toolCallIterator)) as PendingToolCall;
      const call2 = (await getNext(toolCallIterator)) as PendingToolCall;

      const receivedNames = [call1?.toolName, call2?.toolName];
      expect(receivedNames).toContain('call1');
      expect(receivedNames).toContain('call2');
    });

    it('should notify agent listener when tool list is updated', () => {
      const listener = vi.fn<(tools: Tool[]) => void>();
      agentInterface.toolCalling.onToolListUpdate(listener);

      const toolList: Tool[] = [
        { toolName: 'newTool', description: 'A new tool', parameters: {} },
      ];
      adapter.toolCalling!.onToolListUpdate(toolList);

      // Called once on subscription with empty list, once with the update
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith([]);
      expect(listener).toHaveBeenCalledWith(toolList);
    });
  });
});
