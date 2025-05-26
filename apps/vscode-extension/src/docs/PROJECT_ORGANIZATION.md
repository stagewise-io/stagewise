# Project Organization Improvements

## File Structure Enhancements

The project structure has been improved with better organization of test files
and documentation:

### Test Files Organization

- **New Location**: `apps/vscode-extension/src/test/`
- **Files Moved**:
  - `test-mcp-registration.mjs` - MCP server registration testing
  - `test-mcp-input-schema.mjs` - Enhanced MCP UI testing with input schema
    display
  - `extension.test.ts` - VS Code extension unit tests

### Documentation Organization

- **New Location**: `apps/vscode-extension/src/docs/`
- **Files Moved**:
  - `MCP_INPUT_SCHEMA_IMPLEMENTATION.md` - Complete implementation guide
  - `MULTI-WINDOW-DISCOVERY.md` - Multi-window discovery documentation
  - `MCP_TOOLBAR_UI_FIX.md` - Fix documentation for toolbar UI issue

## Benefits

1. **Clear Separation**: Tests and documentation are now properly separated from
   source code
2. **Better Discoverability**: Developers can easily find relevant test files
   and documentation
3. **Maintainability**: Organized structure makes it easier to maintain and
   expand the project
4. **Standards Compliance**: Follows common project organization patterns

## Usage

### Running Tests

```bash
# Run MCP input schema test
node apps/vscode-extension/src/test/test-mcp-input-schema.mjs

# Run MCP registration test  
node apps/vscode-extension/src/test/test-mcp-registration.mjs
```

### Accessing Documentation

- Implementation details:
  `apps/vscode-extension/src/docs/MCP_INPUT_SCHEMA_IMPLEMENTATION.md`
- UI fix documentation: `apps/vscode-extension/src/docs/MCP_TOOLBAR_UI_FIX.md`
- Multi-window features:
  `apps/vscode-extension/src/docs/MULTI-WINDOW-DISCOVERY.md`
