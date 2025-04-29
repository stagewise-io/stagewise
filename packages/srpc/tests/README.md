# sRPC Package Tests

This directory contains tests for the sRPC (Strongly-typed Remote Procedure Call) package, a WebSocket-based RPC system with TypeScript type safety and streaming updates support.

## Test Files

The test suite consists of three main test files:

1. **srpc.test.ts** - Tests the high-level API and end-to-end functionality between client and server.
2. **bridge.test.ts** - Tests the core WebSocketRpcBridge functionality with a focus on internal methods.
3. **zod-bridge.test.ts** - Tests the zod-bridge functionality end to end.
3. **options.test.ts** - Tests specific WebSocketBridgeOptions configurations and their effects.

## Running the Tests

To run the tests, use the following command from the `packages/srpc` directory:

```bash
pnpm test
```

Or to run in watch mode:

```bash
pnpm test -- --watch
```

To run a specific test file:

```bash
pnpm test -- tests/srpc.test.ts
```

## Test Coverage

The tests cover the following key aspects of the package:

### Core Functionality

- Method registration and invocation
- Type safety of the API
- Error handling
- WebSocket message exchange

### Client-Server Communication

- Client connecting to server
- Method calls in both directions (client → server and server → client)
- Request-response pattern
- Streaming updates during method execution

### Configuration and Options

- Request timeout behavior
- Reconnection settings and behavior
- Default option values

### Error Scenarios

- Handling non-existent methods
- Server-side errors during method execution
- WebSocket disconnection and reconnection

## Test Structure

Each test file follows a similar structure:

1. **Setup** - Creating necessary server/client instances, registering methods
2. **Teardown** - Properly closing connections and cleaning up after tests
3. **Test Cases** - Individual tests for specific functionality
4. **Mock/Spies** - Using Vitest's mocking capabilities to test behavior

## Test Utilities

The test suite utilizes several utilities:

- TestWebSocketRpcBridge: A concrete implementation of the abstract WebSocketRpcBridge for testing internal methods
- Mock WebSockets: Simulating WebSocket behavior without actual network connections
- Spies on key methods to verify correct behavior

## Notes

- Tests use different ports (3001, 3002) to avoid conflicts between test files
- Some tests use TypeScript type assertions to verify type safety at compile time
- Async operations use appropriate await/Promise handling for reliable testing 