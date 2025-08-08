import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentTransportAdapter, type AdapterOptions } from '@/agent/adapter';
import type { AgentInterface } from '@/agent/interface';
import type {
  PendingToolCall,
  Tool,
  ToolCallResult,
} from '@/router/capabilities/tool-calling/types';

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

describe('AgentTransportAdapterToolCalling', () => {
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

  // --- Tool Calling Tests ---
  describe('Tool Calling Interface', () => {
    beforeEach(() => {
      // Tool calling must be explicitly enabled for these tests
      agentInterface.toolCalling.setToolCallSupport(true);
    });

    describe('Basic Operations', () => {
      it('should push a pending tool call to the stream when requested by agent', async () => {
        const toolCallIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        agentInterface.toolCalling.requestToolCall('testTool', { param: 1 });

        const pendingCall = (await getNext(
          toolCallIterator,
        )) as PendingToolCall;
        expect(pendingCall.toolName).toBe('testTool');
        expect(pendingCall.id).toBeDefined();
        expect(pendingCall.parameters).toEqual({ param: 1 });
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
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          0,
        );
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

        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          0,
        );
      });

      it('should ignore results for unknown or timed-out calls', () => {
        // This test verifies that results for unknown call IDs are ignored
        // Capture initial state of pending calls
        const initialPendingCalls =
          agentInterface.toolCalling.getPendingToolCalls();
        const initialPendingCount = initialPendingCalls.length;

        // This should not throw an error or cause any issues
        expect(() => {
          adapter.toolCalling!.onToolCallResult({
            id: 'unknown-id',
            toolName: 'foo',
            result: 'bar',
          });
        }).not.toThrow();

        // Verify that pending calls state remains unchanged
        const finalPendingCalls =
          agentInterface.toolCalling.getPendingToolCalls();
        expect(finalPendingCalls).toHaveLength(initialPendingCount);
        expect(finalPendingCalls).toEqual(initialPendingCalls);
      });

      it('should handle multiple concurrent tool calls', async () => {
        const promise1 = agentInterface.toolCalling.requestToolCall('tool1', {
          a: 1,
        });
        const promise2 = agentInterface.toolCalling.requestToolCall('tool2', {
          b: 2,
        });
        const promise3 = agentInterface.toolCalling.requestToolCall('tool3', {
          c: 3,
        });

        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
        expect(pendingCalls).toHaveLength(3);

        // Resolve calls in reverse order
        const result3: ToolCallResult = {
          id: pendingCalls[2].id,
          toolName: 'tool3',
          result: 'Result 3',
        };
        const result1: ToolCallResult = {
          id: pendingCalls[0].id,
          toolName: 'tool1',
          result: 'Result 1',
        };
        const result2: ToolCallResult = {
          id: pendingCalls[1].id,
          toolName: 'tool2',
          result: 'Result 2',
        };

        adapter.toolCalling!.onToolCallResult(result3);
        adapter.toolCalling!.onToolCallResult(result1);
        adapter.toolCalling!.onToolCallResult(result2);

        await expect(promise1).resolves.toEqual(result1);
        await expect(promise2).resolves.toEqual(result2);
        await expect(promise3).resolves.toEqual(result3);

        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          0,
        );
      });

      it('should handle tool calls with complex parameters', async () => {
        const complexParams = {
          nested: { value: 'test' },
          array: [1, 2, 3],
          boolean: true,
          null: null,
        };

        const toolCallIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        agentInterface.toolCalling.requestToolCall(
          'complexTool',
          complexParams,
        );

        const pendingCall = (await getNext(
          toolCallIterator,
        )) as PendingToolCall;
        expect(pendingCall.parameters).toEqual(complexParams);
      });
    });

    describe('Multiple Subscribers', () => {
      it('should send tool calls to all active subscribers', async () => {
        const iterator1 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();
        const iterator2 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        agentInterface.toolCalling.requestToolCall('broadcastTool', {
          data: 'test',
        });

        const call1 = (await getNext(iterator1)) as PendingToolCall;
        const call2 = (await getNext(iterator2)) as PendingToolCall;

        expect(call1.toolName).toBe('broadcastTool');
        expect(call2.toolName).toBe('broadcastTool');
        expect(call1.id).toBe(call2.id); // Should be the same call
        expect(call1.parameters).toEqual(call2.parameters);
      });

      it('should handle multiple subscribers with different consumption rates', async () => {
        const iterator1 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();
        const iterator2 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // Make multiple tool calls rapidly
        agentInterface.toolCalling.requestToolCall('tool1', {});
        agentInterface.toolCalling.requestToolCall('tool2', {});
        agentInterface.toolCalling.requestToolCall('tool3', {});

        // Fast consumer gets all calls
        const call1_1 = (await getNext(iterator1)) as PendingToolCall;
        const call1_2 = (await getNext(iterator1)) as PendingToolCall;
        const call1_3 = (await getNext(iterator1)) as PendingToolCall;

        // Slow consumer should also get all calls
        const call2_1 = (await getNext(iterator2)) as PendingToolCall;
        const call2_2 = (await getNext(iterator2)) as PendingToolCall;
        const call2_3 = (await getNext(iterator2)) as PendingToolCall;

        expect([call1_1.toolName, call1_2.toolName, call1_3.toolName]).toEqual([
          'tool1',
          'tool2',
          'tool3',
        ]);
        expect([call2_1.toolName, call2_2.toolName, call2_3.toolName]).toEqual([
          'tool1',
          'tool2',
          'tool3',
        ]);
      });

      it('should handle subscriber disconnection gracefully', async () => {
        const iterator1 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // Make first call and consume it
        agentInterface.toolCalling.requestToolCall('tool1', {});
        await getNext(iterator1);

        // Create second iterator (simulating reconnection)
        const iterator2 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // Make more calls
        agentInterface.toolCalling.requestToolCall('tool2', {});
        agentInterface.toolCalling.requestToolCall('tool3', {});

        // Second iterator should get all pending calls (including the first one that's still pending)
        const call2_1 = (await getNext(iterator2)) as PendingToolCall;
        const call2_2 = (await getNext(iterator2)) as PendingToolCall;
        const call2_3 = (await getNext(iterator2)) as PendingToolCall;

        const receivedNames = [
          call2_1.toolName,
          call2_2.toolName,
          call2_3.toolName,
        ];
        expect(receivedNames).toContain('tool1');
        expect(receivedNames).toContain('tool2');
        expect(receivedNames).toContain('tool3');
      });
    });

    describe('New Subscribers and Reconnection', () => {
      it('should provide all pending calls to a new subscriber', async () => {
        agentInterface.toolCalling.requestToolCall('call1', {});
        agentInterface.toolCalling.requestToolCall('call2', {});

        const toolCallIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // Should receive all pending calls
        const call1 = (await getNext(toolCallIterator)) as PendingToolCall;
        const call2 = (await getNext(toolCallIterator)) as PendingToolCall;

        const receivedNames = [call1?.toolName, call2?.toolName];
        expect(receivedNames).toContain('call1');
        expect(receivedNames).toContain('call2');
      });

      it('should provide pending calls to reconnecting subscriber (disconnect scenario)', async () => {
        // Start with some pending calls
        const _promise1 = agentInterface.toolCalling.requestToolCall(
          'persistentTool1',
          {},
        );
        const _promise2 = agentInterface.toolCalling.requestToolCall(
          'persistentTool2',
          {},
        );

        // Simulate disconnect - new subscriber connects
        const newSubscriber = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // Should receive all pending calls again
        const call1 = (await getNext(newSubscriber)) as PendingToolCall;
        const call2 = (await getNext(newSubscriber)) as PendingToolCall;

        const receivedNames = [call1?.toolName, call2?.toolName];
        expect(receivedNames).toContain('persistentTool1');
        expect(receivedNames).toContain('persistentTool2');

        // Verify original promises are still valid
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          2,
        );
      });

      it('should handle new subscribers during active tool call resolution', async () => {
        // Start a tool call
        const toolPromise = agentInterface.toolCalling.requestToolCall(
          'activeTool',
          {},
        );
        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();

        // New subscriber connects while call is active
        const newSubscriber = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();
        const receivedCall = (await getNext(newSubscriber)) as PendingToolCall;

        expect(receivedCall.toolName).toBe('activeTool');
        expect(receivedCall.id).toBe(pendingCalls[0].id);

        // Resolve the call
        const result: ToolCallResult = {
          id: pendingCalls[0].id,
          toolName: 'activeTool',
          result: 'Success',
        };
        adapter.toolCalling!.onToolCallResult(result);

        await expect(toolPromise).resolves.toEqual(result);
      });

      it('should handle rapid reconnections', async () => {
        // Create pending calls
        agentInterface.toolCalling.requestToolCall('rapid1', {});
        agentInterface.toolCalling.requestToolCall('rapid2', {});

        // Simulate multiple rapid reconnections
        const subscriber1 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();
        const subscriber2 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();
        const subscriber3 = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // All should receive the same pending calls
        const calls1 = [
          (await getNext(subscriber1)) as PendingToolCall,
          (await getNext(subscriber1)) as PendingToolCall,
        ];
        const calls2 = [
          (await getNext(subscriber2)) as PendingToolCall,
          (await getNext(subscriber2)) as PendingToolCall,
        ];
        const calls3 = [
          (await getNext(subscriber3)) as PendingToolCall,
          (await getNext(subscriber3)) as PendingToolCall,
        ];

        // All subscribers should receive the same calls
        const names1 = calls1.map((c) => c.toolName).sort();
        const names2 = calls2.map((c) => c.toolName).sort();
        const names3 = calls3.map((c) => c.toolName).sort();

        expect(names1).toEqual(['rapid1', 'rapid2']);
        expect(names2).toEqual(['rapid1', 'rapid2']);
        expect(names3).toEqual(['rapid1', 'rapid2']);
      });

      it('should handle complete disconnect-reconnect scenario with persistent tool calls', async () => {
        // Simulate a real-world disconnect-reconnect scenario

        // 1. Initial session with pending tool calls
        const initialIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        const toolPromise1 = agentInterface.toolCalling.requestToolCall(
          'persistentTool1',
          { data: 'test1' },
        );
        const toolPromise2 = agentInterface.toolCalling.requestToolCall(
          'persistentTool2',
          { data: 'test2' },
        );
        const toolPromise3 = agentInterface.toolCalling.requestToolCall(
          'persistentTool3',
          { data: 'test3' },
        );

        // Initial subscriber receives all calls
        const initialCall1 = (await getNext(
          initialIterator,
        )) as PendingToolCall;
        const initialCall2 = (await getNext(
          initialIterator,
        )) as PendingToolCall;
        const initialCall3 = (await getNext(
          initialIterator,
        )) as PendingToolCall;

        expect([
          initialCall1.toolName,
          initialCall2.toolName,
          initialCall3.toolName,
        ]).toEqual(
          expect.arrayContaining([
            'persistentTool1',
            'persistentTool2',
            'persistentTool3',
          ]),
        );

        // 2. Simulate client disconnect (iterator abandoned)
        // initialIterator is now "disconnected" - we won't use it anymore

        // 3. Resolve one tool call while "disconnected"
        const pendingCallsBeforeReconnect =
          agentInterface.toolCalling.getPendingToolCalls();
        const resolvedCall = pendingCallsBeforeReconnect.find(
          (call) => call.toolName === 'persistentTool1',
        )!;

        adapter.toolCalling!.onToolCallResult({
          id: resolvedCall.id,
          toolName: 'persistentTool1',
          result: 'Resolved while disconnected',
        });

        await expect(toolPromise1).resolves.toBeDefined();

        // 4. Client reconnects - new iterator should get remaining pending calls
        const reconnectedIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        const reconnectedCall1 = (await getNext(
          reconnectedIterator,
        )) as PendingToolCall;
        const reconnectedCall2 = (await getNext(
          reconnectedIterator,
        )) as PendingToolCall;

        const reconnectedNames = [
          reconnectedCall1.toolName,
          reconnectedCall2.toolName,
        ];
        expect(reconnectedNames).toEqual(
          expect.arrayContaining(['persistentTool2', 'persistentTool3']),
        );
        expect(reconnectedNames).not.toContain('persistentTool1'); // Should not include already resolved call

        // 5. Verify that the original tool promises are still valid and can be resolved
        const tool2Call = pendingCallsBeforeReconnect.find(
          (call) => call.toolName === 'persistentTool2',
        )!;
        const tool3Call = pendingCallsBeforeReconnect.find(
          (call) => call.toolName === 'persistentTool3',
        )!;

        adapter.toolCalling!.onToolCallResult({
          id: tool2Call.id,
          toolName: 'persistentTool2',
          result: 'Resolved after reconnect',
        });

        adapter.toolCalling!.onToolCallResult({
          id: tool3Call.id,
          toolName: 'persistentTool3',
          result: 'Also resolved after reconnect',
        });

        await expect(toolPromise2).resolves.toBeDefined();
        await expect(toolPromise3).resolves.toBeDefined();

        // 6. Verify clean state
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          0,
        );
      });
    });

    describe('Timeout Handling', () => {
      it('should handle timeout with custom timeout values', async () => {
        // Create adapter with shorter timeout
        const shortTimeoutAdapter = new AgentTransportAdapter({
          toolCallTimeoutMs: 5000,
        });
        const shortTimeoutAgent = shortTimeoutAdapter.getAgent();
        shortTimeoutAgent.toolCalling.setToolCallSupport(true);

        const toolPromise = shortTimeoutAgent.toolCalling.requestToolCall(
          'shortTimeout',
          {},
        );

        // Fast-forward time to the custom timeout
        vi.advanceTimersByTime(5001);

        await expect(toolPromise).rejects.toThrow('timed out');
      });

      it('should handle timeout during iterator consumption', async () => {
        const subscriber = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // Start a tool call
        const toolPromise = agentInterface.toolCalling.requestToolCall(
          'streamingTool',
          {},
        );
        const receivedCall = (await getNext(subscriber)) as PendingToolCall;

        expect(receivedCall.toolName).toBe('streamingTool');

        // Fast-forward time to timeout
        vi.advanceTimersByTime(10001);

        await expect(toolPromise).rejects.toThrow('timed out');
      });

      it('should handle partial timeouts with sequential calls', async () => {
        // Make first call
        const promise1 = agentInterface.toolCalling.requestToolCall(
          'tool1',
          {},
        );

        // Advance time to almost timeout
        vi.advanceTimersByTime(9999);

        // Make second call (should have full timeout)
        const promise2 = agentInterface.toolCalling.requestToolCall(
          'tool2',
          {},
        );

        // Advance time to timeout first call but not second
        vi.advanceTimersByTime(2);

        await expect(promise1).rejects.toThrow('timed out');

        // Second call should still be pending
        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
        expect(pendingCalls).toHaveLength(1);
        expect(pendingCalls[0].toolName).toBe('tool2');

        // Resolve the second call
        const result: ToolCallResult = {
          id: pendingCalls[0].id,
          toolName: 'tool2',
          result: 'Success',
        };
        adapter.toolCalling!.onToolCallResult(result);

        await expect(promise2).resolves.toEqual(result);
      });

      it('should not provide timed-out calls to new subscribers', async () => {
        // Start a call that will timeout
        const timeoutPromise = agentInterface.toolCalling.requestToolCall(
          'timeoutTool',
          {},
        );

        // Fast-forward time past timeout
        vi.advanceTimersByTime(10001);

        // Wait for timeout
        await expect(timeoutPromise).rejects.toThrow('timed out');

        // Verify no pending calls remain after timeout
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          0,
        );

        // Start a new call after timeout
        agentInterface.toolCalling.requestToolCall('newTool', {});

        // New subscriber should only receive the new call
        const newSubscriber = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();
        const receivedCall = (await getNext(newSubscriber)) as PendingToolCall;
        expect(receivedCall.toolName).toBe('newTool');

        // Verify only the new call is in pending state
        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
        expect(pendingCalls).toHaveLength(1);
        expect(pendingCalls[0].toolName).toBe('newTool');
      });
    });

    describe('Tool List Management', () => {
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

      it('should handle multiple tool list listeners', () => {
        const listener1 = vi.fn<(tools: Tool[]) => void>();
        const listener2 = vi.fn<(tools: Tool[]) => void>();
        const listener3 = vi.fn<(tools: Tool[]) => void>();

        agentInterface.toolCalling.onToolListUpdate(listener1);
        agentInterface.toolCalling.onToolListUpdate(listener2);
        agentInterface.toolCalling.onToolListUpdate(listener3);

        const toolList: Tool[] = [
          { toolName: 'tool1', description: 'Tool 1', parameters: {} },
          { toolName: 'tool2', description: 'Tool 2', parameters: {} },
        ];
        adapter.toolCalling!.onToolListUpdate(toolList);

        // All listeners should be called
        expect(listener1).toHaveBeenCalledWith(toolList);
        expect(listener2).toHaveBeenCalledWith(toolList);
        expect(listener3).toHaveBeenCalledWith(toolList);
      });

      it('should handle tool list updates during active tool calls', async () => {
        const listener = vi.fn<(tools: Tool[]) => void>();
        agentInterface.toolCalling.onToolListUpdate(listener);

        // Start a tool call
        const toolPromise = agentInterface.toolCalling.requestToolCall(
          'activeTool',
          {},
        );

        // Update tool list while call is active
        const toolList: Tool[] = [
          { toolName: 'newTool', description: 'New tool', parameters: {} },
        ];
        adapter.toolCalling!.onToolListUpdate(toolList);

        expect(listener).toHaveBeenCalledWith(toolList);

        // Resolve the active call
        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
        const result: ToolCallResult = {
          id: pendingCalls[0].id,
          toolName: 'activeTool',
          result: 'Success',
        };
        adapter.toolCalling!.onToolCallResult(result);

        await expect(toolPromise).resolves.toEqual(result);
      });

      it('should handle empty tool list updates', () => {
        const listener = vi.fn<(tools: Tool[]) => void>();
        agentInterface.toolCalling.onToolListUpdate(listener);

        adapter.toolCalling!.onToolListUpdate([]);

        // Should be called with empty list twice (initial + update)
        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenCalledWith([]);
      });

      it('should handle large tool lists', () => {
        const listener = vi.fn<(tools: Tool[]) => void>();
        agentInterface.toolCalling.onToolListUpdate(listener);

        const largeToolList = Array.from({ length: 100 }, (_, i) => ({
          toolName: `tool_${i}`,
          description: `Tool number ${i}`,
          parameters: { param: `value_${i}` },
        }));

        adapter.toolCalling!.onToolListUpdate(largeToolList);

        expect(listener).toHaveBeenCalledWith(largeToolList);
      });
    });

    describe('Edge Cases', () => {
      it('should handle tool calls with empty parameters', async () => {
        const toolCallIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        agentInterface.toolCalling.requestToolCall('emptyParamTool', {});

        const pendingCall = (await getNext(
          toolCallIterator,
        )) as PendingToolCall;
        expect(pendingCall.parameters).toEqual({});
      });

      it('should handle tool calls with undefined parameters', async () => {
        const toolCallIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        agentInterface.toolCalling.requestToolCall(
          'undefinedParamTool',
          undefined as any,
        );

        const pendingCall = (await getNext(
          toolCallIterator,
        )) as PendingToolCall;
        expect(pendingCall.parameters).toBeUndefined();
      });

      it('should handle tool names with special characters', async () => {
        const toolCallIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        const specialToolName = 'tool-with_special.chars@123';
        agentInterface.toolCalling.requestToolCall(specialToolName, {});

        const pendingCall = (await getNext(
          toolCallIterator,
        )) as PendingToolCall;
        expect(pendingCall.toolName).toBe(specialToolName);
      });

      it('should handle results with complex return values', async () => {
        const toolPromise = agentInterface.toolCalling.requestToolCall(
          'complexResult',
          {},
        );

        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
        const complexResult = {
          data: { nested: { value: 'test' } },
          array: [1, 2, 3],
          boolean: true,
          null: null,
        };

        const result: ToolCallResult = {
          id: pendingCalls[0].id,
          toolName: 'complexResult',
          result: complexResult,
        };
        adapter.toolCalling!.onToolCallResult(result);

        await expect(toolPromise).resolves.toEqual(result);
      });

      it('should handle tool calls when tool calling is disabled', async () => {
        agentInterface.toolCalling.setToolCallSupport(false);

        await expect(
          agentInterface.toolCalling.requestToolCall('disabledTool', {}),
        ).rejects.toThrow();
      });

      it('should handle rapid enable/disable of tool calling', async () => {
        agentInterface.toolCalling.setToolCallSupport(false);
        agentInterface.toolCalling.setToolCallSupport(true);
        agentInterface.toolCalling.setToolCallSupport(false);
        agentInterface.toolCalling.setToolCallSupport(true);

        // Should work after rapid toggling
        const toolPromise = agentInterface.toolCalling.requestToolCall(
          'rapidToggle',
          {},
        );

        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
        expect(pendingCalls).toHaveLength(1);

        const result: ToolCallResult = {
          id: pendingCalls[0].id,
          toolName: 'rapidToggle',
          result: 'Success',
        };
        adapter.toolCalling!.onToolCallResult(result);

        await expect(toolPromise).resolves.toEqual(result);
      });
    });

    describe('Iterator Pipeline Edge Cases', () => {
      it('should handle backpressure with slow consumers', async () => {
        const fastIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();
        const slowIterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // Create multiple tool calls
        for (let i = 0; i < 5; i++) {
          agentInterface.toolCalling.requestToolCall(`tool_${i}`, { index: i });
        }

        // Fast consumer gets all calls
        const fastCalls = [];
        for (let i = 0; i < 5; i++) {
          fastCalls.push(await getNext(fastIterator));
        }

        // Slow consumer should also get all calls
        const slowCalls = [];
        for (let i = 0; i < 5; i++) {
          slowCalls.push(await getNext(slowIterator));
        }

        expect(fastCalls).toHaveLength(5);
        expect(slowCalls).toHaveLength(5);

        // Verify all calls were received
        const fastNames = fastCalls.map((c) => c!.toolName).sort();
        const slowNames = slowCalls.map((c) => c!.toolName).sort();

        expect(fastNames).toEqual([
          'tool_0',
          'tool_1',
          'tool_2',
          'tool_3',
          'tool_4',
        ]);
        expect(slowNames).toEqual([
          'tool_0',
          'tool_1',
          'tool_2',
          'tool_3',
          'tool_4',
        ]);
      });

      it('should handle concurrent iterator creation and tool calling', async () => {
        const promises = [];

        // Concurrently create iterators and tool calls
        for (let i = 0; i < 10; i++) {
          promises.push(
            (async () => {
              const iterator = adapter
                .toolCalling!.getPendingToolCalls()
                [Symbol.asyncIterator]();
              agentInterface.toolCalling.requestToolCall(`concurrent_${i}`, {});
              return getNext(iterator);
            })(),
          );
        }

        const results = await Promise.all(promises);
        expect(results).toHaveLength(10);

        // All results should be tool calls
        results.forEach((result) => {
          expect(result).toBeDefined();
          expect(result!.toolName).toMatch(/concurrent_\d+/);
        });
      });

      it('should handle iterator pipeline with mixed operations', async () => {
        const iterator = adapter
          .toolCalling!.getPendingToolCalls()
          [Symbol.asyncIterator]();

        // Create a tool call
        agentInterface.toolCalling.requestToolCall('initialTool', {});

        // Get the call
        const call1 = (await getNext(iterator)) as PendingToolCall;
        expect(call1.toolName).toBe('initialTool');

        // Create more calls - should not block the iterator
        agentInterface.toolCalling.requestToolCall('secondTool', {});
        agentInterface.toolCalling.requestToolCall('thirdTool', {});

        // Should be able to get more calls without blocking
        const call2 = (await getNext(iterator)) as PendingToolCall;
        const call3 = (await getNext(iterator)) as PendingToolCall;

        const receivedNames = [call2.toolName, call3.toolName];
        expect(receivedNames).toContain('secondTool');
        expect(receivedNames).toContain('thirdTool');

        // Resolve some calls while others are pending
        adapter.toolCalling!.onToolCallResult({
          id: call1.id,
          toolName: 'initialTool',
          result: 'Success 1',
        });

        // Iterator should continue working normally
        agentInterface.toolCalling.requestToolCall('fourthTool', {});
        const call4 = (await getNext(iterator)) as PendingToolCall;
        expect(call4.toolName).toBe('fourthTool');
      });
    });

    describe('Memory and Performance', () => {
      it('should handle many concurrent tool calls efficiently', async () => {
        const numCalls = 50;
        const promises = [];

        // Create many concurrent tool calls
        for (let i = 0; i < numCalls; i++) {
          promises.push(
            agentInterface.toolCalling.requestToolCall(`perf_tool_${i}`, {
              index: i,
            }),
          );
        }

        // All calls should be pending
        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
        expect(pendingCalls).toHaveLength(numCalls);

        // Resolve all calls
        const results = [];
        for (let i = 0; i < numCalls; i++) {
          const result: ToolCallResult = {
            id: pendingCalls[i].id,
            toolName: `perf_tool_${i}`,
            result: `Result ${i}`,
          };
          results.push(result);
          adapter.toolCalling!.onToolCallResult(result);
        }

        // All promises should resolve
        const resolvedResults = await Promise.all(promises);
        expect(resolvedResults).toHaveLength(numCalls);

        // No pending calls should remain
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          0,
        );
      });

      it('should handle many subscribers efficiently', async () => {
        const numSubscribers = 20;
        const iterators = [];

        // Create many subscribers
        for (let i = 0; i < numSubscribers; i++) {
          iterators.push(
            adapter.toolCalling!.getPendingToolCalls()[Symbol.asyncIterator](),
          );
        }

        // Make a tool call - should notify all subscribers
        agentInterface.toolCalling.requestToolCall('broadcast', {
          data: 'test',
        });

        // All subscribers should receive the call
        const receivedCalls = await Promise.all(
          iterators.map((it) => getNext(it)),
        );

        expect(receivedCalls).toHaveLength(numSubscribers);
        receivedCalls.forEach((call) => {
          expect(call!.toolName).toBe('broadcast');
          expect(call!.parameters).toEqual({ data: 'test' });
        });
      });

      it('should clean up timed-out calls properly', async () => {
        const numCalls = 10;
        const promises = [];

        // Create many tool calls that will timeout
        for (let i = 0; i < numCalls; i++) {
          promises.push(
            agentInterface.toolCalling.requestToolCall(`timeout_${i}`, {}),
          );
        }

        // All calls should be pending
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          numCalls,
        );

        // Fast-forward time to timeout all calls
        vi.advanceTimersByTime(10001);

        // All promises should reject
        await Promise.all(
          promises.map((p) => expect(p).rejects.toThrow('timed out')),
        );

        // No pending calls should remain
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          0,
        );
      });
    });

    describe('State Consistency', () => {
      it('should handle state consistency during rapid operations', async () => {
        const operations = [];

        // Queue up many operations
        for (let i = 0; i < 20; i++) {
          operations.push(() =>
            agentInterface.toolCalling.requestToolCall(`rapid_${i}`, {}),
          );
        }

        // Execute all operations
        const promises = operations.map((op) => op());

        // All calls should be pending
        const pendingCalls = agentInterface.toolCalling.getPendingToolCalls();
        expect(pendingCalls).toHaveLength(20);

        // Resolve half the calls
        for (let i = 0; i < 10; i++) {
          adapter.toolCalling!.onToolCallResult({
            id: pendingCalls[i].id,
            toolName: `rapid_${i}`,
            result: `Result ${i}`,
          });
        }

        // Wait for resolved promises
        const resolvedPromises = promises.slice(0, 10);
        await Promise.all(resolvedPromises);

        // Half should still be pending
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          10,
        );

        // Timeout the rest
        vi.advanceTimersByTime(10001);

        const remainingPromises = promises.slice(10);
        await Promise.all(
          remainingPromises.map((p) => expect(p).rejects.toThrow('timed out')),
        );

        // No pending calls should remain
        expect(agentInterface.toolCalling.getPendingToolCalls()).toHaveLength(
          0,
        );
      });
    });
  });
});
