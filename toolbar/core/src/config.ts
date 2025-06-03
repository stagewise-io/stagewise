import type { ToolbarPlugin } from './plugin.ts';

export interface ToolbarConfig {
  plugins: ToolbarPlugin[];
  experimental?: {
    /**
     * If true, the toolbar will use the stagewise MCP server.
     */
    enableStagewiseMCP: boolean;
    /**
     * If true, the toolbar will allow tool calls to sync progress with the agent.
     */
    enableToolCalls: boolean;
  };
}
