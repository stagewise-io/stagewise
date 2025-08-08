import type { ToolbarPlugin } from './plugin-sdk/plugin.js';

export interface InternalToolbarConfig {
  /** A list of plugins that the toolbar should use. */
  plugins: ToolbarPlugin[];

  /** The port on which the dev app is running. */
  devAppPort: number;

  /** The port that should be displayed in the iframe's location API. */
  appPort?: number;

  /** Configuration for URL synchronization behavior */
  urlSync?: {
    /** Enable or disable location monkey-patching */
    enableLocationPatching?: boolean;
    /** Maximum time to wait for navigation lock (ms) */
    navigationTimeout?: number;
    /** Debounce delay for URL change detection (ms) */
    debounceDelay?: number;
  };

  /**
   * If true, the toolbar will connect to a Stagewise agent hosted on the same port as the app.
   * This disables agent scanning and uses permanent reconnection logic.
   */
  usesStagewiseAgent?: boolean;

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

export interface ToolbarPluginLoader {
  loader: true; // Used to identify new plugins that are loaded into the toolbar via loader mechanism
  mainPlugin: string; // The main plugin code that will be loaded into the toolbar
}

export interface ToolbarConfig
  extends Omit<InternalToolbarConfig, 'plugins' | 'devAppPort'> {
  plugins: ToolbarPluginLoader[];
}
