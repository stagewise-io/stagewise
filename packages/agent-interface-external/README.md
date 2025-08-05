# <img src="https://github.com/stagewise-io/assets/blob/main/media/logo.png?raw=true" alt="stagewise logo" width="42" height="42" style="border-radius: 50%; vertical-align: middle; margin-right: 8px; margin-bottom:4px;" /> The frontend coding agent for production codebases

## Agent Interface

This package offers both interface definitions and base-functionality to integrate agents with stagewise.

You can find more information on how to use this interface in the following guide: [Build custom Agent Integrations](https://stagewise.io/docs/developer-guides/build-custom-agent-integrations)

## Features

- **Availability Management**: Control agent availability with error handling
- **State Management**: Track agent state (idle, processing, etc.)
- **Messaging**: Handle user messages and stream agent responses
- **Chat Capability**: Full chat history support with multi-chat management (NEW!)

## Chat Capability

The new chat capability provides comprehensive chat functionality:

### Key Features

- **Multi-Chat Support**: Create and manage multiple chat sessions
- **Message History**: Full conversation history with user, assistant, and tool messages
- **Streaming Updates**: Stream message parts in parallel for responsive UI
- **Tool Integration**: Tools are now integrated within chat messages
- **State Management**: Only one chat can be active at a time

### Message Types

Aligned with Vercel AI SDK:
- **UserMessage**: Text, image, and file content with browser metadata
- **AssistantMessage**: Text, files, reasoning, tool calls, and tool results
- **ToolMessage**: Tool execution results

### Usage Example

```typescript
import { createAgentServer } from '@stagewise/agent-interface';

const { agent } = await createAgentServer({ port: 3000 });

// Enable chat support
agent.chat.setChatSupport(true);

// Create a chat
const chatId = await agent.chat.createChat('My Chat');

// Listen for updates
agent.chat.addChatUpdateListener((update) => {
  console.log('Chat update:', update);
});

// Handle messages
agent.messaging.addUserMessageListener(async (msg) => {
  // Stream assistant response
  agent.chat.streamMessagePart('msg-1', 0, {
    content: { type: 'text', text: 'Hello!' },
    updateType: 'create',
  });
});
```

See `examples/chat-usage.ts` for a complete example.
