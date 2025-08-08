# Agent Interface Examples

This directory contains examples demonstrating how to use the `@stagewise/agent-interface` package.

## Examples

### 1. Standalone Server (`standalone-server.ts`)

Demonstrates how to create a standalone stagewise agent server with custom configuration.

**Features:**

- Custom agent name and description
- Custom port configuration
- Custom endpoint paths
- Custom CORS configuration
- Agent availability and state management
- Message sending
- Tool calling support

**Run the example:**

```bash
# From the agent-interface package directory
pnpm tsx examples/standalone-server.ts
```

**Expected output:**

```
🚀 Starting standalone stagewise agent server...
✅ Agent server started successfully!
📍 Server running on port: 3000
📋 Info endpoint: http://localhost:3000/agent/info
🔌 WebSocket endpoint: ws://localhost:3000/agent/ws
🔄 Server is running. Press Ctrl+C to stop.
```

### 2. Express Integration (`express-integration.ts`)

Demonstrates how to hook stagewise agent endpoints into an existing Express application.

**Features:**

- Integration with existing Express app
- Custom endpoint paths
- Agent interface access
- Graceful server shutdown

**Run the example:**

```bash
# From the agent-interface package directory
pnpm tsx examples/express-integration.ts
```

**Expected output:**

```
🚀 Starting Express application with stagewise agent integration...
✅ Express app with agent integration started!
📍 Main app: http://localhost:3000/
📋 Agent info: http://localhost:3000/api/agent/info
🔌 Agent WebSocket: ws://localhost:3000/api/agent/ws
🔄 Express server running on port 3000
Press Ctrl+C to stop.
```

## Testing the Examples

After running either example, you can test the endpoints:

### Test the Info Endpoint

```bash
# For standalone server
curl http://localhost:3000/agent/info

# For Express integration
curl http://localhost:3000/api/agent/info
```

### Test the Main Application (Express integration only)

```bash
curl http://localhost:3000/
```

### Test Health Endpoint (Express integration only)

```bash
curl http://localhost:3000/health
```

## Prerequisites

- Node.js 18+
- pnpm package manager
- TypeScript support (tsx for running examples)

## Notes

- Both examples use port 3000 by default
- The WebSocket endpoints are available for stagewise toolbar connections
- Press `Ctrl+C` to gracefully shut down the servers
- The examples demonstrate basic agent functionality; in a real application, you would implement more sophisticated agent logic
