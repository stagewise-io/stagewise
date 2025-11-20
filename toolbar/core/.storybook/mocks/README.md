# Storybook Mock System

This directory contains utilities for mocking Karton state and hooks in Storybook stories.

## Overview

The toolbar components rely on Karton (a WebSocket-based state sync system) to communicate with the CLI. In Storybook, we mock this system to display components in various states without needing the CLI running.

## Usage

### 1. Using the Mock Karton Decorator

Add the `withMockKarton` decorator to your story:

```tsx
import { withMockKarton } from '../../../.storybook/decorators/with-mock-karton';

export default {
  title: 'My Component',
  component: MyComponent,
  decorators: [withMockKarton],
};
```

### 2. Providing Mock State

Pass mock state via story parameters. The mock system provides sensible defaults, but you can override specific fields:

```tsx
export const MyStory: Story = {
  parameters: {
    mockKartonState: {
      // Global configuration (defaults provided)
      globalConfig: {
        openFilesInIde: 'vscode', // or 'cursor', 'webstorm', 'other'
      },
      // Workspace state (defaults provided)
      workspace: {
        agent: {
          accessPath: '/mock/workspace/path', // Required for file IDE links
        },
        agentChat: {
          activeChatId: 'chat-1',
          chats: {
            'chat-1': {
              title: 'Test Chat',
              messages: [...],
              // ...
            },
          },
          isWorking: false,
        },
      },
    },
  },
};
```

**Note:** The decorator automatically provides defaults for `globalConfig.openFilesInIde` and `workspace.agent.accessPath`, so you only need to override them if you want specific values.

### 3. Using Mock Data Helpers

The `chat-data.ts` file provides helper functions to create common chat scenarios:

```tsx
import {
  createSimpleChat,
  createChatWithToolCalls,
  createUserMessage,
  createAssistantMessage,
} from '../../../.storybook/mocks/chat-data';

// Use preset scenarios
const chat = createSimpleChat();

// Or create custom messages
const userMsg = createUserMessage('Hello!');
const assistantMsg = createAssistantMessage('Hi there!', {
  toolParts: [createOverwriteFileToolPart('file.ts', 'content')],
});
```

## Available Helpers

### Chat Scenarios

- `createEmptyChat()` - Empty chat with no messages
- `createSimpleChat()` - Simple back-and-forth conversation
- `createChatWithManyMessages()` - Long conversation with 10+ messages
- `createStreamingChat()` - Chat with incomplete streaming message
- `createChatWithToolCalls()` - Chat with tool call examples
- `createChatWithError()` - Chat with error state
- `createChatWithFileAttachments()` - Chat with file attachments

### Message Builders

- `createUserMessage(text, options?)` - Create user message
- `createAssistantMessage(text, options?)` - Create assistant message
- `createTextPart(text)` - Create text message part
- `createFilePart(filename, mediaType, url)` - Create file attachment

### Tool Part Builders

- `createOverwriteFileToolPart(path, content, state?, oldContent?)` - File overwrite tool with diff support
- `createReadFileToolPart(path, content, state?)` - File read tool
- `createMultiEditToolPart(path, newContent, state?, oldContent?)` - Multi-edit tool with diff support

### States

Tool calls can be in different states:
- `'streaming'` - Tool call in progress (no result yet)
- `'complete'` - Tool call completed successfully
- `'error'` - Tool call failed

## Streaming Simulation

The mock system supports simulating streaming assistant responses for realistic story development and debugging.

### Basic Usage

Use the `withStreamingMessage` decorator to animate message content progressively:

```tsx
import { withStreamingMessage } from '../../../.storybook/decorators/with-streaming-message';
import { createStreamingConfig } from '../../../.storybook/mocks/streaming-configs';

export const StreamingExample: Story = {
  decorators: [withStreamingMessage, withMockKarton],
  args: {
    message: createAssistantMessage('', { id: 'streaming-msg' }),
    isLastMessage: true,
  },
  parameters: {
    streamingConfig: createStreamingConfig(
      'streaming-msg',
      "Hey there! I hope you're doing well.",
      'normalWord'  // preset: 'fastChar', 'normalWord', 'slowSentence', 'oneShot'
    ),
    mockKartonState: {
      workspace: {
        agentChat: {
          activeChatId: 'test-chat',
          chats: {
            'test-chat': {
              messages: [
                createAssistantMessage('', { id: 'streaming-msg' }),
              ],
              // ...
            },
          },
          isWorking: true,
        },
      },
    },
  },
};
```

### Available Presets

- `'fastChar'` - Character-by-character at 10ms intervals
- `'normalWord'` - Word-by-word at 50ms intervals (most realistic)
- `'slowSentence'` - Sentence-by-sentence at 200ms intervals
- `'oneShot'` - Plays once without looping

### Advanced Configuration

For fine-grained control, use the full `StreamingConfig` interface:

```tsx
parameters: {
  streamingConfig: {
    messageId: 'msg-id',
    fullContent: 'The complete message text...',
    chunkStrategy: 'word',  // 'char' | 'word' | 'sentence'
    intervalMs: 50,          // milliseconds between chunks
    loop: true,              // restart after completion
  },
}
```

### How It Works

1. The decorator splits the full text into chunks based on the strategy
2. A timer progressively reveals chunks at the specified interval
3. The message part gets `state: 'streaming'` during animation
4. When complete, the decorator pauses briefly (1s), then restarts if `loop: true`
5. The `isWorking` state is managed automatically

### Examples

See streaming examples in:
- `ChatBubble.stories.tsx` - `StreamingSimulation`, `StreamingLongResponse`, `StreamingFastCharacters`

## Mock Hooks

If your component imports hooks directly, you can import mock versions:

```tsx
// Instead of:
// import { useKartonState } from '@/hooks/use-karton';

// Use:
import { useKartonState } from '../../../.storybook/mocks/mock-hooks';
```

However, when using the `withMockKarton` decorator, components that use the hooks via context will automatically use the mocked state.

## Examples

See the existing stories for examples:

- `ChatHistory.stories.tsx` - Full chat history component with various states
- `ChatBubble.stories.tsx` - Individual chat bubbles in different configurations

## Architecture

```
.storybook/
├── decorators/
│   ├── mock-karton-provider.tsx     # Core mock provider implementation
│   ├── with-mock-karton.tsx         # Storybook decorator for static state
│   └── with-streaming-message.tsx   # Storybook decorator for streaming simulation
└── mocks/
    ├── chat-data.ts                 # Mock data generators
    ├── mock-hooks.tsx               # Mock hook implementations
    ├── streaming-configs.ts         # Streaming configuration and presets
    └── README.md                    # This file
```

The mock system works by:
1. `MockKartonProvider` creates a React context that mimics the real Karton context
2. Mock hooks read from this context instead of WebSocket connections
3. Stories pass state via parameters, which the provider uses
4. Components render normally, unaware they're using mocked data
5. `withStreamingMessage` decorator adds progressive state updates for streaming simulation
