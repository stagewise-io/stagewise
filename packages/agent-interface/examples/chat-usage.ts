/**
 * Example: Using the Chat Capability
 * 
 * This example demonstrates how to use the new chat capability
 * in the stagewise agent interface.
 */

import { createAgentServer } from '../src/agent';
import { AgentStateType } from '../src/router/capabilities/state/types';

async function main() {
  // Create an agent server with chat support
  const { agent, server } = await createAgentServer({
    port: 3000,
    name: 'Chat Example Agent',
    description: 'An agent demonstrating chat capabilities',
  });

  // Enable chat support
  agent.chat.setChatSupport(true);

  // Create a new chat
  const chatId = await agent.chat.createChat('My First Chat');
  console.log(`Created chat with ID: ${chatId}`);

  // Listen for chat updates
  agent.chat.addChatUpdateListener((update) => {
    console.log('Chat update:', update.type);
  });

  // Listen for user messages
  agent.messaging.addUserMessageListener(async (userMessage) => {
    console.log('Received user message:', userMessage.contentItems);
    
    // Set agent state to processing
    agent.state.set(AgentStateType.PROCESSING, 'Thinking...');

    // Simulate assistant response with streaming
    const assistantMessageId = `msg-${Date.now()}`;
    
    // Stream text response
    agent.chat.streamMessagePart(assistantMessageId, 0, {
      content: { type: 'text', text: 'I received your message: ' },
      updateType: 'create',
    });

    // Simulate typing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Continue streaming
    const firstContentItem = userMessage.contentItems[0];
    const textContent = firstContentItem && firstContentItem.type === 'text' 
      ? firstContentItem.text 
      : '[non-text content]';
    
    agent.chat.streamMessagePart(assistantMessageId, 0, {
      content: { type: 'text', text: textContent },
      updateType: 'append',
    });

    // If the message contains a question about tools, demonstrate tool calling
    const firstItem = userMessage.contentItems[0];
    if (firstItem && firstItem.type === 'text' && 
        firstItem.text.includes('tool')) {
      
      // Add a tool call part
      agent.chat.streamMessagePart(assistantMessageId, 1, {
        content: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'calculator',
          input: { operation: 'add', a: 5, b: 3 },
          runtime: 'cli',
          requiresApproval: false,
        },
        updateType: 'create',
      });

      // Simulate tool execution
      await new Promise(resolve => setTimeout(resolve, 500));

      // Add tool result
      agent.chat.streamMessagePart(assistantMessageId, 2, {
        content: {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'calculator',
          output: { result: 8 },
        },
        updateType: 'create',
      });
    }

    // Set agent back to idle
    agent.state.set(AgentStateType.IDLE);
  });

  // Register some tools
  agent.chat.registerTools([
    {
      name: 'calculator',
      description: 'Performs basic arithmetic operations',
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['operation', 'a', 'b'],
      },
    },
  ]);

  // Handle tool results from toolbar
  agent.chat.reportToolResult('example-call-id', { exampleResult: true }, false);

  console.log('Chat agent is running on http://localhost:3000');
  console.log('Connect with the toolbar to start chatting!');
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the example
main().catch(console.error);