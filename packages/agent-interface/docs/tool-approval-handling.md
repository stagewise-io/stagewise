# Tool Approval Handling

## Overview

Tool approvals are now transmitted as part of `UserMessage` content, not as separate `ToolMessage` entries. This makes the conversation flow more natural and clearly shows that approvals are user decisions.

## Structure

When a user approves or rejects a tool call, it creates a `UserMessage` with a `tool-approval` content part:

```typescript
interface ToolApprovalPart {
  type: 'tool-approval';
  toolCallId: string;
  approved: boolean;
}
```

## Example UserMessage with Approval

```typescript
{
  id: 'user-msg-123',
  role: 'user',
  content: [{
    type: 'tool-approval',
    toolCallId: 'tool-call-456',
    approved: true
  }],
  metadata: {
    isToolApproval: true  // Helps identify this as an approval message
  },
  createdAt: new Date()
}
```

## How Agents Should Process Approvals

Agents should listen for chat updates and check for user messages containing tool-approval parts:

```typescript
agent.chat.addChatUpdateListener((update) => {
  if (update.type === 'message-added' && update.message.role === 'user') {
    const userMessage = update.message as UserMessage;
    
    // Check each content part for tool approvals
    for (const part of userMessage.content) {
      if (part.type === 'tool-approval') {
        const approval = part as ToolApprovalPart;
        
        if (approval.approved) {
          // Tool was approved
          console.log(`Tool ${approval.toolCallId} approved`);
          
          // Proceed with tool execution
        } else {
          // Tool was rejected
          console.log(`Tool ${approval.toolCallId} rejected`);
          
          // Handle rejection (e.g., ask for alternatives)
        }
      }
    }
  }
});
```

## Benefits of This Approach

1. **Natural Conversation Flow**: Approvals appear as user messages in the chat history
2. **Clear Attribution**: It's obvious that approvals come from the user
3. **Audit Trail**: User decisions are part of the conversation record
4. **Consistency**: All user actions (messages, approvals) use the same message type
5. **Simplicity**: Binary approve/reject decision keeps the interface clean and simple

## Migration from Old Approach

Previously, tool approvals created `ToolMessage` entries with `toolName: 'approval'`.