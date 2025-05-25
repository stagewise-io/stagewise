# Enhanced MCP Tool Call UI Implementation

## Overview

This document summarizes the implementation of the enhanced MCP tool call
notification system that displays input schema and arguments in the Stagewise
toolbar UI.

## ✅ What Was Accomplished

### 1. Enhanced Data Structures

**Extension Side:**

- Extended `McpNotificationData` interface in
  `apps/vscode-extension/src/http-server/handlers/mcp-notifications.ts` to
  include:
  - `toolName?: string` - Name of the MCP tool being called
  - `inputSchema?: Record<string, any>` - Tool's input schema with property
    types and descriptions
  - `inputArguments?: Record<string, any>` - Actual arguments passed to the tool

**Toolbar Side:**

- Updated `McpToolCallState` interface in
  `toolbar/core/src/hooks/use-app-state.tsx` with matching fields
- Modified `startMcpTask` function signature to accept these new parameters

### 2. SRPC Contract Enhancement

**Contract Updates:**

- Enhanced `notifyMcpStart` request schema in
  `packages/extension-toolbar-srpc-contract/src/contract.ts`
- Added optional fields for `toolName`, `inputSchema`, and `inputArguments`
- Maintained backward compatibility with existing implementations

### 3. UI Components

**New ToolDetailsSection Component:**

- Created collapsible component in
  `toolbar/core/src/components/toolbar/desktop-only/draggable-box.tsx`
- Features:
  - Toggle-able display with puzzle piece icon
  - Shows tool name in highlighted code format
  - Displays formatted JSON input arguments in scrollable container
  - Shows input schema with property types and descriptions
  - Color-coded blue theme to distinguish from other UI elements

**Integration Points:**

- Integrated into both 'starting' and 'in-progress' states of
  `McpToolCallStatusContent`
- Automatically hidden when no tool details are available
- Responsive design with max-height scrolling for large schemas

### 4. Communication System Fix

**Root Problem Solved:**

- The extension's `broadcastToToolbars` function was only logging, not actually
  sending notifications

**Solution Implemented:**

- Rewritten `broadcastToToolbars` function to use SRPC calls instead of just
  logging
- Added proper async/await handling for SRPC communication
- Enhanced error handling and logging throughout the communication chain
- Added `setExtensionBridge()` function and global bridge management
- Updated `apps/vscode-extension/src/activation/activate.ts` to set the bridge
  for notifications

### 5. HTTP Server Endpoints

**Correct Endpoint Configuration:**

- `/start` - Start MCP task notification
- `/progress` - Progress update notification
- `/completion` - Task completion notification
- `/error` - Error notification

**Default Port:** 5746 (with fallback to 5747-5756 if occupied)

### 6. Testing Infrastructure

**Test Script Created:**

- `test-mcp-input-schema.mjs` demonstrates the enhanced functionality
- Shows step-by-step progress updates with detailed input schema and arguments
- Includes both success and error case scenarios
- Fixed endpoint paths and port configuration

## 🔧 Key Technical Implementation Details

### SRPC Integration

```typescript
// Extension side - broadcasting via SRPC
await extensionBridge.call.notifyMcpStart({
  task: data.task!,
  estimatedSteps: data.estimatedSteps,
  toolName: data.toolName,
  inputSchema: data.inputSchema,
  inputArguments: data.inputArguments,
});
```

### Toolbar State Management

```typescript
// Toolbar side - enhanced state with input schema
startMcpTask: ((
  task: string,
  estimatedSteps?: number,
  toolName?: string,
  inputSchema?: Record<string, any>,
  inputArguments?: Record<string, any>,
) => {
  // Implementation handles timeout, state transitions, etc.
});
```

### UI Component Structure

```typescript
<ToolDetailsSection
  toolName={mcpToolCall.toolName}
  inputSchema={mcpToolCall.inputSchema}
  inputArguments={mcpToolCall.inputArguments}
/>;
```

## 🚀 How to Test

1. **Ensure Extension is Running:**
   - VS Code with Stagewise extension active
   - Extension HTTP server on port 5746 (or next available)

2. **Run Test Script:**
   ```bash
   node test-mcp-input-schema.mjs
   ```

3. **Expected Behavior:**
   - Toolbar shows enhanced MCP status with tool details
   - Input schema and arguments are displayed in collapsible section
   - Progress updates with step counters
   - File modification results on completion

## 📋 Features Demonstrated

✅ **Tool Information Display:**

- Tool name prominently shown
- Input schema with full type information
- Actual arguments passed to the tool

✅ **Real-time Progress Tracking:**

- Step-by-step progress with counters (e.g., "Step 2/4")
- Detailed descriptions for each step
- Progress bar visualization

✅ **Enhanced Status States:**

- Starting state with tool details
- In-progress with live updates
- Completion with success/failure indication
- Error handling with context and recoverability

✅ **User Experience:**

- Collapsible tool details to avoid UI clutter
- Color-coded status indicators
- Auto-reset after successful completion
- Backward compatibility with legacy completion flow

## 🔄 System Architecture

```
Agent Tool Call → Extension HTTP Server → SRPC Bridge → Toolbar State → UI Components
     ↓                    ↓                   ↓              ↓             ↓
Input Schema      Notification Handler    Bridge Call    State Update   Display
& Arguments       Enhanced Data          SRPC Contract   App State      Tool Details
```

## 📦 Files Modified

### Core Implementation:

- `apps/vscode-extension/src/http-server/handlers/mcp-notifications.ts`
- `toolbar/core/src/hooks/use-app-state.tsx`
- `packages/extension-toolbar-srpc-contract/src/contract.ts`

### UI Components:

- `toolbar/core/src/components/toolbar/desktop-only/draggable-box.tsx`
- `toolbar/core/src/srpc.ts`

### System Integration:

- `apps/vscode-extension/src/activation/activate.ts`
- `apps/vscode-extension/src/mcp/mcp-server-manager.ts`

### Testing:

- `test-mcp-input-schema.mjs`

## ✨ Benefits

1. **Enhanced Developer Experience:** Developers can see exactly what tools are
   being called and with what parameters
2. **Better Debugging:** Input schema and arguments help debug agent behavior
3. **Improved Transparency:** Clear visibility into the agent's tool usage
4. **Professional UI:** Clean, collapsible interface that doesn't overwhelm
5. **Backward Compatibility:** Existing functionality continues to work
   unchanged

## 🔮 Future Enhancements

- **Tool Output Display:** Show tool results/outputs in addition to inputs
- **Tool Call History:** Keep a log of recent tool calls
- **Schema Validation UI:** Visual indicators for schema validation errors
- **Performance Metrics:** Track tool call duration and success rates
