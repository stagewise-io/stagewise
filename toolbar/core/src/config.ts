import type { ToolbarPlugin } from './plugin.ts';

export interface ToolbarConfig {
  /** A list of plugoins that the toolbar should use. */
  plugins: ToolbarPlugin[];

  /** Experimental features that are not yet stable and might change in the future. */
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
