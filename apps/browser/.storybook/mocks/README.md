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
import { createDefaultAgentState, createUserMessage } from '@sb/decorators/scenarios/shared-utilities';

export const MyStory: Story = {
  parameters: {
    mockKartonState: createDefaultAgentState(
      {
        activeModelId: 'anthropic-claude-3-5-sonnet',
        history: [
          createUserMessage('Hello, how can you help?'),
        ],
        isWorking: false,
      },
      {
        // Global configuration (defaults provided)
        globalConfig: {
          openFilesInIde: 'vscode', // or 'cursor', 'webstorm', 'other'
        },
        // Workspace state (defaults provided)
        workspace: {
          agent: {
            accessPath: '/mock/workspace/path', // Required for file IDE links
          },
        },
      }
    ),
  },
};
```

**Note:** The `createDefaultAgentState` helper automatically provides defaults for common fields. The `withMockKarton` decorator also provides `MockOpenAgentProvider` context for components that use the `useOpenAgent` hook.

### 3. Using Mock Data Helpers

The `shared-utilities.ts` file provides helper functions to create agent state and messages:

```tsx
import {
  createUserMessage,
  createAssistantMessage,
  createAssistantMessageWithText,
  createDefaultAgentState,
  createOverwriteFileToolPart,
  DEFAULT_STORY_AGENT_ID,
} from '@sb/decorators/scenarios/shared-utilities';

// Create default agent state with messages
const state = createDefaultAgentState({
  activeModelId: 'model-id',
  history: [
    createUserMessage('Hello!'),
    createAssistantMessageWithText('Hi there!', {
      toolParts: [createOverwriteFileToolPart('file.ts', 'content', 'complete')],
    }),
  ],
});
```

## Available Helpers

### State Builders

- `createDefaultAgentState(options?, additionalState?)` - Create complete agent state
- `createAgentInstance(type?, options?)` - Create a single agent instance
- `createStateWithAgent(agentId, agentInstance, additionalState?)` - Create state with specific agent

### Message Builders

- `createUserMessage(text, options?)` - Create user message
- `createAssistantMessage(options?)` - Create assistant message with parts
- `createAssistantMessageWithText(text, options?)` - Convenience wrapper that auto-creates text part
- `createTextPart(text, state?)` - Create text message part
- `createReasoningPart(text, state?)` - Create thinking/reasoning part
- `createFilePart(filename, mediaType, url)` - Create file attachment

### Tool Part Builders

- `createOverwriteFileToolPart(path, content, state?, oldContent?)` - File overwrite tool with diff support
- `createReadToolPart(path, content, state?)` - File read tool
- `createMultiEditToolPart(path, newContent, state?, oldContent?)` - Multi-edit tool with diff support
- `createLsToolPart(path, result, state?)` - List files tool
- `createGlobToolPart(pattern, result, state?)` - Glob pattern search tool
- `createGrepSearchToolPart(query, result, state?)` - Grep search tool
- `createDeleteFileToolPart(path, state?)` - Delete file tool

### States

Tool calls can be in different states:

- `'input-streaming'` - Tool input being generated
- `'input-available'` - Tool input complete, awaiting execution
- `'output-available'` - Tool executed successfully
- `'output-error'` - Tool execution failed

## Streaming Simulation

The mock system supports simulating streaming assistant responses for realistic story development and debugging.

### Basic Usage

Use the `withStreamingMessage` decorator to animate message content progressively:

```tsx
import { withStreamingMessage } from '@sb/decorators/with-streaming-message';
import { createStreamingConfig } from '@sb/mocks/streaming-configs';
import { createDefaultAgentState, createAssistantMessage } from '@sb/decorators/scenarios/shared-utilities';

export const StreamingExample: Story = {
  decorators: [withStreamingMessage, withMockKarton],
  parameters: {
    streamingConfig: createStreamingConfig(
      'streaming-msg',
      "Hey there! I hope you're doing well.",
      'normalWord'  // preset: 'fastChar', 'normalWord', 'slowSentence', 'oneShot'
    ),
    mockKartonState: createDefaultAgentState({
      history: [
        createAssistantMessage({ id: 'streaming-msg', parts: [] }),
      ],
      isWorking: true,
    }),
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
│   ├── with-mock-karton.tsx         # Storybook decorator for static state
│   ├── with-streaming-message.tsx   # Storybook decorator for streaming simulation
│   ├── with-tool-streaming.tsx      # Storybook decorator for tool streaming
│   └── scenarios/
│       ├── shared-utilities.ts      # Mock data generators and state helpers
│       ├── timeline-engine.ts       # Timeline-based scenario execution
│       └── with-*-scenario.tsx      # Various scenario decorators
└── mocks/
    ├── mock-hooks.tsx               # Mock hook implementations (MockKartonProvider, MockOpenAgentProvider)
    ├── streaming-configs.ts         # Streaming configuration and presets
    └── README.md                    # This file
```

The mock system works by:

1. `MockKartonProvider` creates a React context that mimics the real Karton context
2. Mock hooks read from this context instead of WebSocket connections
3. Stories pass state via parameters, which the provider uses
4. Components render normally, unaware they're using mocked data
5. `withStreamingMessage` decorator adds progressive state updates for streaming simulation
