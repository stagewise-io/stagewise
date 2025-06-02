// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

/**
 * MCP Server configuration that follows the official MCP client configuration format
 * This aligns with Claude Desktop and other MCP clients
 */
export interface McpServerConfig {
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

interface NamedMcpServer {
  name: string;
  config: McpServerConfig;
}

export interface UserMessage {
  id: string;
  text: string;
  contextElements: HTMLElement[];
  sentByPlugin: boolean;
}

export interface UIHandle {
  remove: () => void;
}

import type { PromptRequest } from '@stagewise/extension-toolbar-srpc-contract';
import type { VNode } from 'preact';
export interface ToolbarContext {
  sendPrompt: (prompt: string | PromptRequest) => void;
}

/** A context snippet that get's added into the prompt. */
export interface ContextSnippet {
  promptContextName: string;
  content: (() => string | Promise<string>) | string;
}

/** A user-selectable context snippet offer that optionally get's added into the prompt. */
export interface ContextSnippetOffer extends ContextSnippet {
  displayName: string;
}

/** Additional information that a plugin may provide once the user get's into prompting mode.
 *
 * Used to provide user selectable context snippets that get added to the prompt once it's sent.
 */
export interface PromptingExtension {
  contextSnippetOffers: ContextSnippetOffer[];
}

/** Additional information that a plugin can provide automatically (without user triggering) when the user sends a prompt */
export interface PromptContext {
  contextSnippets: ContextSnippet[];
}

/** Additional information that a plugin can provide when the user selects a context element */
export interface ContextElementContext {
  /** Up to ~50 characters of information (element name, whatever...) that get's rendered when selecting an element */
  annotation: string | null;
}

export interface ToolbarPlugin {
  /** The name of the plugin shown to the user. */
  displayName: string;

  /** The name of the plugin used for internal identification. */
  pluginName: string;

  /** A short description of what the plugin does. */
  description: string;

  /** A monochrome svg icon that will be rendered in places where the plugin is shown */
  iconSvg: VNode | null;

  onActionClick?: () => undefined | VNode;

  /** MCP server configuration that will be registered with the IDE when the plugin loads. */
  mcp?: McpServerConfig | null;

  /** Called when the toolbar and the plugin is loaded. */
  onLoad?: ((toolbar: ToolbarContext) => void) | null;

  /** Called when the prompting mode get's started. Plugins may provide some additional */
  onPromptingStart?: (() => PromptingExtension | null) | null;

  /** Called when the prompting mode get's aborted. */
  onPromptingAbort?: (() => void) | null;

  /** Not implemented right now. */
  onResponse?: (() => void) | null;

  /** Called just before a prompt is sent. Plugins can use this to automatically provide additional context for the prompt or simply listen to some change. */
  onPromptSend?:
    | ((prompt: UserMessage) => PromptContext | Promise<PromptContext> | null)
    | null;

  /** Called when a context element is hovered in the context menu. This only happens in prompting mode. */
  onContextElementHover?:
    | ((element: HTMLElement) => ContextElementContext)
    | null;

  /** Called when a context element is selected in the context menu. This only happens in prompting mode. */
  onContextElementSelect?:
    | ((element: HTMLElement) => ContextElementContext)
    | null;
}

/**
 * Utility function to collect MCP servers from loaded plugins
 */
export function collectMcpServersFromPlugins(
  plugins: ToolbarPlugin[],
): NamedMcpServer[] {
  return plugins
    .filter(
      (plugin): plugin is ToolbarPlugin & { mcp: McpServerConfig } =>
        plugin.mcp !== null && plugin.mcp !== undefined,
    )
    .map((plugin) => ({
      name: plugin.pluginName,
      config: plugin.mcp,
    }));
}
