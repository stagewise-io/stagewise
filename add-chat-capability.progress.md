# Add Chat Capability Progress

## Current Status: Starting Analysis

### Summary of Requirements
- Add new "chat" capability to stagewise agent interface package
- Remove old toolCalling capability
- Implement chat history functionality with proper synchronization
- Support multi-chat functionality
- Support 4 message types: UserMessage, AssistantMessage, ToolMessage
- Extend "agent" adapter with functional interface
- Thoroughly test new capability

### Next Steps
1. Analyze existing capabilities in agent-interface package
2. Understand current messaging capability implementation
3. Identify toolCalling capability for removal
4. Plan implementation approach
5. Gather any clarification questions for user

## Analysis Phase - COMPLETED

### Key Findings

1. **Package Structure**:
   - Located at `packages/agent-interface`
   - Has existing capabilities: availability, messaging, state, tool-calling
   - Uses tRPC for router implementation
   - Has comprehensive adapter pattern in `src/agent/adapter.ts`

2. **Messaging Capability**:
   - Current implementation is single-message focused
   - Uses `AgentMessageUpdate` for incremental updates
   - Supports text and image content parts
   - Has metadata (browser info, selected elements)
   - Messages are replaced entirely, no history preservation

3. **ToolCalling Capability**:
   - Located in `src/router/capabilities/tool-calling/`
   - Manages pending tool calls between agent and toolbar
   - Will be removed and integrated into chat capability
   - Has timeout handling and promise-based responses

4. **Adapter Pattern**:
   - `AgentTransportAdapter` provides functional interface
   - Uses PushController for async iterables
   - Manages state synchronization
   - Clean separation between transport and agent interfaces

## Implementation Plan

### Architecture Decisions

1. **Chat Storage**:
   - Chats stored agent-side (adapter maintains state)
   - Toolbar remains stateless, receives updates via subscriptions
   - Each chat has unique ID and maintains message history

2. **Message Types Integration**:
   - Align with Vercel AI SDK types as specified
   - UserMessage: text, image, file parts + metadata
   - AssistantMessage: text, file, reasoning, tool-call, tool-result parts
   - ToolMessage: tool-result parts

3. **Synchronization Strategy**:
   - Similar to messaging capability's incremental updates
   - Full resync on subscription (send complete chat history)
   - Incremental updates for new messages/edits

## Questions for User - ANSWERED

### Clarifications Received:

1. **Persistence**: Memory-only storage, with dummy functions for future persistence
2. **Message Editing**: Agent streams updates to current message; users can't edit but may delete history later
3. **Tool Approval**: Toolbar UI handles approval UI based on pending tool calls
4. **Chat Limits**: One active chat at a time, must be idle to switch, no fixed history limit
5. **Streaming**: Support parallel streaming of multiple parts
6. **Tool Runtime**: Toolbar registers callbacks for toolbar runtime tools
7. **Validation**: No validation needed for files
8. **Migration**: Not needed
9. **Metadata**: Chats have title and creation date
10. **Errors**: Tool errors shown as failed tool results

## Detailed Implementation Plan

### Phase 1: Remove toolCalling capability - COMPLETED
- ✓ Delete `/src/router/capabilities/tool-calling/` directory
- ✓ Remove toolCalling references from router index
- ✓ Remove toolCalling from TransportInterface
- ✓ Remove toolCalling from adapter
- ✓ Remove toolCalling from agent interface
- ✓ Clean up toolCalling-related state and methods

### Phase 2: Create chat capability types - COMPLETED
- ✓ Create `/src/router/capabilities/chat/types.ts`
- ✓ Define message types aligned with Vercel AI SDK
- ✓ Define chat management types (Chat, ChatListItem)
- ✓ Define streaming update types (MessagePartUpdate, ChatUpdate)
- ✓ Define user action types (CreateChat, SendMessage, ToolApproval)
- ✓ Create chat router with ChatImplementation interface
- ✓ Update main router to include chat capability

### Phase 3: Implement chat router
- Create `/src/router/capabilities/chat/index.ts`
- Define ChatImplementation interface
- Implement subscription for chat updates
- Implement user message handling
- Implement chat management (create, delete, switch)

### Phase 4: Update adapter for chat
- Add chat state management to adapter
- Implement message streaming with parallel parts
- Implement tool call handling within messages
- Add dummy persistence functions
- Implement chat switching logic

### Phase 5: Testing
- Write comprehensive tests for chat capability
- Test streaming behavior
- Test multi-chat management
- Test tool call flows

### Phase 6: Update exports and documentation
- Update package exports
- Add usage examples
- Document migration from messaging to chat