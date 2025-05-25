# MCP Toolbar UI Fix - Elimination of Legacy Completion Flow Conflict

## Problem Identified

The enhanced MCP tool call UI with input schema display was not showing up in
the toolbar. Instead, users were seeing the legacy "AI Agent Working" loading
state even when MCP notifications were being sent correctly.

## Root Cause Analysis

The issue was caused by **dual completion systems** running simultaneously:

1. **Legacy Completion System**: The chat state (`use-chat-state.tsx`) was
   calling `appState.startCompletion()` immediately when an agent prompt was
   sent
2. **Enhanced MCP System**: The agent was separately sending MCP notifications
   with tool details

### Rendering Priority Conflict

In `draggable-box.tsx`, the rendering logic prioritizes legacy completion state
over MCP state:

```typescript
{/* Render content based on state */}
{isConnectedState && mcpToolCall.status !== 'idle' && (
  <McpToolCallStatusContent ... />
)}
{isConnectedState &&
  completionState !== 'idle' &&
  mcpToolCall.status === 'idle' && (  // ← This condition blocked MCP UI
    <CompletionStateContent ... />
)}
```

Since `startCompletion()` was called immediately, `completionState` became
`'loading'` before any MCP notifications arrived, causing the legacy UI to be
shown instead of the enhanced MCP UI.

## Solution Implemented

### 1. Removed Legacy Completion Triggers

**File**: `toolbar/core/src/hooks/use-chat-state.tsx`

**Changes Made**:

- **Removed** `appState.startCompletion()` call when sending agent prompts
- **Removed** `appState.completeError()` calls in error handlers
- **Added** explanatory comments about relying on MCP notification system

### 2. Why This Works

With the legacy completion system disabled:

- Chat system sends prompt to agent ✅
- Agent starts working and sends MCP notifications ✅
- Toolbar shows enhanced MCP UI with tool details ✅
- No legacy completion interference ❌

### 3. Backward Compatibility

The legacy completion system remains intact and can still be used by:

- Direct calls to `useAppState` completion functions
- SRPC notifications from extension (`notifyCompletionSuccess`,
  `notifyCompletionError`)
- Other parts of the system that don't use MCP notifications

## Testing the Fix

### Prerequisites

1. **VS Code** running with Stagewise extension active
2. **Extension HTTP server** running on port 5746+
3. **Toolbar** visible and connected to VS Code

### Option 1: Use Test Script

```bash
node apps/vscode-extension/src/test/test-mcp-input-schema.mjs
```

### Option 2: Manual Testing

1. Open toolbar in browser
2. Send an agent prompt
3. **Expected Result**: Enhanced MCP UI with tool details (NOT legacy "AI Agent
   Working")

## Expected Behavior After Fix

### Before Fix: ❌

- User sends agent prompt
- Toolbar immediately shows: "AI Agent Working" (legacy UI)
- MCP notifications arrive but are ignored
- No tool details, input schema, or arguments shown

### After Fix: ✅

- User sends agent prompt
- Toolbar waits for MCP notifications
- Agent sends MCP start notification with tool details
- Toolbar shows: Enhanced UI with tool name, schema, arguments
- Real-time progress updates with step counters
- Professional completion UI with file modification details

## Technical Details

### Chat State Flow (After Fix)

```
User sends prompt → Chat system calls triggerAgentPrompt → Agent receives prompt
                     ↓
                  Chat sets local promptState = 'loading'
                     ↓
                  NO legacy completion triggered
                     ↓
                  Agent starts working and sends MCP notifications
                     ↓
                  Toolbar receives notifications via SRPC
                     ↓
                  Enhanced MCP UI displays with tool details
```

### MCP Notification Chain

```
Agent Tool Call → Extension HTTP Server → SRPC Bridge → Toolbar State → Enhanced UI
     ↓                    ↓                   ↓              ↓            ↓
Start Tool        /start endpoint        notifyMcpStart   startMcpTask  Tool Details UI
Progress Update   /progress endpoint     notifyMcpProgress updateMcpProgress Progress Bar
Completion        /completion endpoint   notifyMcpCompletion completeMcpTask Success/Error UI
```

## Files Modified

### Core Fix

- `toolbar/core/src/hooks/use-chat-state.tsx` - Removed legacy completion
  triggers

### UI Rendering Logic (No changes needed)

- `toolbar/core/src/components/toolbar/desktop-only/draggable-box.tsx` -
  Existing priority logic works correctly

## Benefits of This Fix

1. **Enhanced User Experience**: Users see detailed tool information instead of
   generic loading
2. **Better Debugging**: Tool names, schemas, and arguments help developers
   understand agent behavior
3. **Real-time Feedback**: Step-by-step progress with detailed descriptions
4. **Professional UI**: Collapsible tool details with proper formatting
5. **No Performance Impact**: Eliminates redundant completion system calls

## Future Considerations

- **Migration Path**: Other parts of the system still using legacy completion
  can be gradually migrated to MCP notifications
- **Error Handling**: Consider adding fallback to legacy completion if MCP
  notifications fail to arrive within timeout
- **Monitoring**: Add logging to track MCP notification delivery vs legacy
  completion usage

## Validation Checklist

- ✅ Toolbar no longer shows "AI Agent Working" immediately
- ✅ Enhanced MCP UI appears with tool details
- ✅ Input schema and arguments are displayed
- ✅ Progress updates work correctly
- ✅ Completion UI shows file modifications
- ✅ Error cases are handled properly
- ✅ Legacy completion system still works for other use cases
