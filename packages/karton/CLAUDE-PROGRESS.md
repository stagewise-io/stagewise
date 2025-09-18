# Karton Development Progress

## Current Task: Refactor Server Interface for Lazy Procedure Registration

### Requirements
- Move from registration of server procedure handlers at instantiation to a lazy approach
- Add `registerServerProcedureHandler` function for type-safe procedure registration
- Add `removeServerProcedureHandler` function to unregister handlers
- Throw exception when server procedure is called without handler
- Prevent multiple handler registrations for same procedure
- Update documentation and specs

### Understanding Current Implementation

The current implementation:
1. Server procedures are passed during instantiation via `KartonServerConfig.procedures`
2. Procedures are registered in constructor via `extractProceduresFromTree` and `rpcManager.registerProcedure`
3. The registration happens per-client connection in `handleNewConnection`

### Design Decisions

1. **Lazy Registration Interface**:
   - Keep initial state in config, but make procedures optional
   - Add methods to KartonServer interface:
     - `registerServerProcedureHandler<Path>(path: Path, handler: Handler)` 
     - `removeServerProcedureHandler(path: string[])`
   - Store registered handlers in server instance
   - Apply handlers to all existing and new client connections

2. **Error Handling**:
   - Create new error: `KartonProcedureNotRegisteredError` - thrown when procedure is called without handler
   - Create new error: `KartonProcedureAlreadyRegisteredError` - thrown when trying to register duplicate handler
   - Both should extend base `Error` with clear messaging
   - Use error name `KartonProcedureError` with different messages for clarity

3. **Type Safety**:
   - Use dot-notation paths for procedure registration (e.g., "auth.login")
   - Handler type should match the procedure signature with clientId added as last param
   - Validate types at compile time through TypeScript generics

4. **Implementation Details**:
   - Store handlers in Map with dot-notation path as key
   - Update RPCManager to support dynamic handler registration/removal
   - Need to update all connected client RPCManagers when handlers change

### Implementation Plan

1. ✅ Understand current implementation
2. ✅ Design new interface structure
3. ✅ Write tests for new functionality
4. ✅ Implement lazy registration
5. ✅ Update documentation
6. ✅ Create commit

### Implementation Complete

Successfully refactored the karton server interface to support lazy registration of server procedure handlers. The implementation includes:

1. **New Methods Added to KartonServer**:
   - `registerServerProcedureHandler(path, handler)` - Register handlers after server creation
   - `removeServerProcedureHandler(path)` - Remove existing handlers

2. **Key Features**:
   - Type-safe procedure registration with dot-notation paths
   - Handlers immediately available to all connected clients
   - Prevention of duplicate registrations (must remove first)
   - Clear error messages via KartonProcedureError

3. **Tests**:
   - Full test coverage for lazy registration
   - Error handling scenarios
   - Mixed initial and lazy registration scenarios
   - Multi-client support verification

4. **Documentation**:
   - Updated SPEC.md with new interface definitions
   - Added lazy registration section with examples
   - Documented error types and handling