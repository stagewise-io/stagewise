'use client';
import type { ToolbarPlugin } from '@stagewise/toolbar';
import { ExampleComponent } from './component';

export const ExamplePlugin: ToolbarPlugin = {
  displayName: 'Example',
  description: 'Example Plugin',
  iconSvg: null,
  pluginName: 'example',
  onActionClick: () => <ExampleComponent />,
  // MCP server configuration for a simple memory server
  mcp: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {
      // Add any required environment variables here
      DEBUG: 'mcp:*',
    },
  },

  onLoad: (toolbar) => {
    console.log('Example MCP Plugin loaded');

    // You can access the toolbar context here
    // The MCP server will be automatically registered when the plugin loads
  },

  onPromptSend: async (prompt) => {
    // This runs when a prompt is sent
    // The MCP server is available to the agent at this point
    return {
      contextSnippets: [
        {
          promptContextName: 'example_mcp_context',
          content:
            'The example MCP plugin is active and memory server is available for storing information.',
        },
      ],
    };
  },

  onContextElementSelect: (element) => {
    return {
      annotation: `MCP: ${element.tagName.toLowerCase()}`,
    };
  },
};
