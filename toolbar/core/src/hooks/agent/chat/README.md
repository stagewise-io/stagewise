# Agent Chat Hook Module

This module provides React hooks and components for managing chat functionality with connected agents.

## Structure

The module is organized into several files for better maintainability:

### Core Files

- **`use-agent-chat.tsx`** - Main hook and provider component
  - `AgentChatProvider` - React context provider that manages all chat state
  - `useAgentChat` - Primary hook for accessing chat functionality

- **`types.ts`** - TypeScript type definitions
  - `ChatState` - Core state interface for chats
  - `MessageStreamingState` - State for streaming messages
  - `PendingToolCall` - Tool calls awaiting approval
  - `ChatContextValue` - Complete context interface

- **`context.ts`** - React context definition
  - Defines the ChatContext with default values
  - Separates context creation from the provider logic

- **`update-handler.ts`** - Chat update processing
  - `createChatUpdateHandler` - Factory for handling real-time updates
  - Processes different update types (chat-list, message-added, etc.)
  - Manages state transitions and extracts pending tool calls

- **`helper-hooks.ts`** - Convenience hooks for common use cases
  - `useActiveChatMessages` - Get messages from active chat
  - `useActiveChatPendingTools` - Get pending tool calls for active chat
  - `useIsMessageStreaming` - Check if a message is streaming
  - `useChatStats` - Get chat statistics
  - `useStreamingMessage` - Get streaming content for a message
  - `useIsChatReady` - Check if chat is ready for interaction
  - `useChatError` - Get error state and clear function

## Usage

### Basic Setup

```tsx
import { AgentChatProvider, useAgentChat } from '@/hooks/agent/chat';

// Wrap your app with the provider
function App() {
  return (
    <AgentChatProvider>
      <ChatInterface />
    </AgentChatProvider>
  );
}

// Use the hook in components
function ChatInterface() {
  const { 
    activeChat, 
    sendMessage, 
    createChat,
    isSupported 
  } = useAgentChat();
  
  // Your chat UI logic
}
```

### Using Helper Hooks

```tsx
import { 
  useActiveChatMessages,
  useChatStats,
  useIsChatReady 
} from '@/hooks/agent/chat';

function MessageList() {
  const messages = useActiveChatMessages();
  const { totalMessages } = useChatStats();
  const isReady = useIsChatReady();
  
  if (!isReady) {
    return <div>Chat not ready...</div>;
  }
  
  return (
    <div>
      <h3>Messages ({totalMessages})</h3>
      {messages.map(msg => (
        <Message key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

## Architecture

The module follows these design principles:

1. **Separation of Concerns** - Each file has a single, clear responsibility
2. **Type Safety** - All types are explicitly defined and exported
3. **Performance** - Uses React optimization hooks (useMemo, useCallback)
4. **Maintainability** - Clear file structure and comprehensive documentation
5. **Backward Compatibility** - The original `use-agent-chat.tsx` re-exports everything

## Data Flow

1. **Agent Connection** - The provider subscribes to chat updates from the connected agent
2. **Update Processing** - Updates are processed by the update handler and deduplicated
3. **State Management** - State is managed via React hooks and context
4. **UI Updates** - Components using the hooks automatically re-render on state changes
5. **User Actions** - Functions like sendMessage trigger agent API calls

## Testing

The refactored structure makes testing easier:

- Test update handlers in isolation
- Mock the context for component testing
- Test helper hooks independently
- Verify type safety with TypeScript