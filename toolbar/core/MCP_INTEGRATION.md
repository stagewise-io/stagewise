# MCP Integration Guide

This guide explains how to integrate Model Context Protocol (MCP) servers with
Stagewise plugins and the core toolbar.

## Overview

Stagewise supports MCP servers at two levels:

1. **Core-level**: The toolbar core automatically includes a `stagewise-core`
   MCP server that provides workflow tools
2. **Plugin-level**: Each plugin can define its own MCP server

When `initToolbar()` is called, all MCP servers are automatically:

- Collected from plugins and core
- Registered with the IDE (VS Code, Cursor, Windsurf)
- Started and managed by the extension

## Core MCP Server

Stagewise automatically includes a core MCP server (`stagewise-core`) that
provides essential workflow tools using a custom TypeScript implementation built
with Vite:

### Implementation Details

- **Source**: `src/mcp-server.ts` - TypeScript MCP server implementation
- **Build**: Vite compiles it to `dist/mcp-server.js` as an executable ESM
  module
- **Dependencies**: Uses official `@modelcontextprotocol/sdk` for MCP protocol
  handling
- **Format**: ESM with shebang for direct execution (`#!/usr/bin/env node`)

### stagewise_notify_completion

This tool **must** be called by the agent after successfully implementing user
requests. It enables the Stagewise toolbar to show completion feedback.

**Usage:**

```json
stagewise_notify_completion({
  "success": true,
  "message": "Successfully implemented the requested login form component with validation"
})
```

**Parameters:**

- `success` (boolean): Whether the changes were implemented successfully
- `message` (string): Brief description of what was accomplished

**Returns:**

- `content`: Array with text content confirming the completion was recorded
- The return value can be used by the UI to show success/failure messages

The prompts automatically instruct agents to call this tool after completing
tasks.

## Build Process

The MCP server is built automatically as part of the standard build process:

```bash
pnpm build  # Builds main library + MCP server
```

**Vite Configuration:**

- Compiles TypeScript to ESM JavaScript
- Adds executable shebang (`#!/usr/bin/env node`)
- Externalizes MCP SDK dependencies
- Makes output file executable via chmod

## MCP Server Configuration

### Basic Configuration

MCP servers are configured using the `McpServerConfig` interface, which follows
the official MCP client configuration format:

```typescript
interface McpServerConfig {
  /** Command to run (for stdio transport) */
  command?: string;
  /** Arguments for the command (for stdio transport) */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Path to environment file */
  envFile?: string;
  /** URL for SSE/HTTP transport */
  url?: string;
  /** Headers for HTTP requests */
  headers?: Record<string, string>;
  /** Additional server-specific settings */
  [key: string]: any;
}
```

### Transport Types

#### Stdio Transport (Local Process)

```typescript
{
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-memory'],
  env: {
    DEBUG: 'mcp:*'
  }
}
```

#### SSE Transport (HTTP/Network)

```typescript
{
  url: 'https://my-mcp-server.com/sse',
  headers: {
    'Authorization': 'Bearer token123'
  }
}
```

## Plugin-Level MCP Integration

### Basic Plugin with MCP

```typescript
import type { ToolbarPlugin } from "@stagewise/toolbar-core";

export const myPlugin: ToolbarPlugin = {
  displayName: "My Plugin",
  pluginName: "my-plugin",
  description: "Plugin with MCP server",
  iconSvg: null,

  // MCP server configuration
  mcp: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    env: {
      API_KEY: "your-api-key",
    },
  },

  onLoad: (toolbar) => {
    console.log(
      "Plugin loaded - MCP server will be registered automatically",
    );
  },

  onPromptSend: async (prompt) => {
    return {
      contextSnippets: [
        {
          promptContextName: "my_plugin_context",
          content: "MCP server is available for agent interaction",
        },
      ],
    };
  },
};
```

### Advanced Plugin Examples

#### Database Plugin

```typescript
export const databasePlugin: ToolbarPlugin = {
  displayName: "Database Access",
  pluginName: "database",
  description: "Provides database query capabilities via MCP",
  iconSvg: null,

  mcp: {
    command: "node",
    args: ["./mcp-servers/database-server.js"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_TYPE: "postgresql",
    },
  },
};
```

#### API Integration Plugin

```typescript
export const apiPlugin: ToolbarPlugin = {
  displayName: "API Integration",
  pluginName: "api-integration",
  description: "Connects to external APIs via MCP",
  iconSvg: null,

  mcp: {
    url: "https://api-mcp-server.example.com/sse",
    headers: {
      "Authorization": `Bearer ${process.env.API_TOKEN}`,
      "X-Client-Version": "1.0.0",
    },
  },
};
```

## Initialization Flow

1. **Developer calls `initToolbar()`** with plugins
2. **MCP Collection**: System collects MCP servers from:
   - Core `stagewise-core` server (automatic)
   - Plugin `mcp` properties
3. **Extension Registration**: All servers are registered with the IDE via SRPC
   using the simplified API:
   ```typescript
   {
     servers: [...], // Array of named MCP servers
     source: 'toolbar-initialization' // Optional source identifier
   }
   ```
4. **Server Management**: Extension starts and monitors MCP server processes
5. **Agent Access**: AI agents can now use MCP tools, including
   `stagewise_notify_completion`

## IDE-Specific Behavior

### VS Code

- MCP servers registered via workspace configuration
- Configuration stored in `.vscode/settings.json`

### Cursor

- MCP servers written to `.cursor/mcp.json` in workspace
- Supports project-specific MCP configurations

### Windsurf

- MCP servers written to `~/.codeium/windsurf/mcp_config.json`
- Global configuration across all projects

## Environment Variables and Security

### Environment File Support

```typescript
{
  command: 'node',
  args: ['./my-mcp-server.js'],
  envFile: './.env.mcp'  // Load additional env vars from file
}
```

### Best Practices

- Store sensitive data in environment variables
- Use `.env` files for development
- Never commit API keys or tokens to version control
- Use different configurations for development/production

## Debugging and Monitoring

### Extension Commands

- `stagewise.mcpStatus` - View status of all MCP servers
- Check "Stagewise MCP Servers" output channel for logs

### Common Issues

#### "No tools available" in Cursor

This is a known bug with Cursor 0.48.x where MCP servers connect but tools
aren't recognized. See
[this forum thread](https://forum.cursor.com/t/bug-report-mcp-sse-server-connects-but-cursor-shows-no-tools-available-despite-server-responding-correctly/77126/5)
for more details.

**Workarounds:**

1. Try restarting Cursor
2. Check that the MCP server command is valid by testing manually:
   ```bash
   echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node ./toolbar/core/dist/mcp-server.js
   ```
3. Verify the MCP server path exists and is executable

#### Development vs Production Paths

The extension automatically resolves the MCP server path using multiple fallback
strategies:

1. **Installed Package**: `require.resolve('@stagewise/toolbar/mcp-server')` -
   for projects with the published package
2. **Workspace Development**: `./toolbar/core/dist/mcp-server.js` - for the
   Stagewise development workspace
3. **Relative Development**: `./toolbar/core/dist/mcp-server.js` - relative to
   current working directory
4. **NPX Fallback**: `npx @stagewise/toolbar/mcp-server` - last resort (will
   fail if not published)

Make sure the toolbar is built before testing in development:

```bash
cd toolbar/core && pnpm build
```

The extension will automatically choose the first available option and log which
path was resolved.

### Plugin Debugging

```typescript
onLoad: (toolbar) => {
  console.log('Plugin loaded, MCP server should be starting...');
},

onPromptSend: async (prompt) => {
  console.log('Prompt sent, MCP tools should be available to agent');
  return null;
}
```

## Error Handling

The system provides robust error handling:

- **Server Start Failures**: Individual server failures don't block other
  servers
- **Configuration Errors**: Clear error messages for invalid configurations
- **IDE Detection**: Graceful fallback if IDE is not recognized
- **Network Issues**: Retry logic for extension communication

## Popular MCP Servers

### Official Servers

```typescript
// Memory server for persistent context
{
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-memory']
}

// File system access
{
  command: 'npx', 
  args: ['-y', '@modelcontextprotocol/server-filesystem'],
  env: { ALLOWED_PATHS: '/project' }
}

// GitHub integration
{
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'token' }
}
```

### Community Servers

Check the
[MCP Servers Repository](https://github.com/modelcontextprotocol/servers) for
more examples.

## Migration from Previous Versions

If you have existing plugins using the old `type` field:

```typescript
// Old format (deprecated)
mcp: {
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'server']
}

// New format
mcp: {
  command: 'npx',  // type inferred from presence of command
  args: ['-y', 'server']  
}
```

The system automatically detects transport type based on configuration
properties.
