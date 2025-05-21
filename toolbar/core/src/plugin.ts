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

export type MCPPrompt = {
  name: string;
  description: string;
  arguments: {
    name: string;
    description: string;
    required: boolean;
  }[];
  generator: () => MCPPromptMessage | Promise<MCPPromptMessage>;
};

export type MCPPromptList = {
  prompts: MCPPrompt[];
  nextCursor?: string;
};

export type MCPPromptMessage = {
  role: 'user' | 'assistant';
  content:
    | {
        type: 'text';
        text: string;
      }
    | {
        type: 'image' | 'audio';
        data: string;
        mimeType: string;
      }
    | {
        type: 'resource';
        resource: {
          uri: string;
          mimeType: string;
          text: string;
        };
      };
};

export type MCPResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  size: number;
};

export type MCPResourceList = {
  resources: MCPResource[];
  nextCursor?: string;
};

export type MCPResourceContent = {
  uri: string;
  mimeType: string;
} & (
  | {
      text: string;
    }
  | {
      data: string;
    }
);

export type MCPTool = {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for the tool's parameters */
  inputSchema: object;
  /** Optional hints about tool behavior */
  annotations?: {
    /** Human-readable title for the tool */
    title?: string;
    /** If true, the tool does not modify its environment */
    readOnlyHint?: boolean;
    /** If true, the tool may perform destructive updates */
    destructiveHint?: boolean;
    /** If true, repeated calls with same args have no additional effect */
    idempotentHint?: boolean;
    /** If true, tool interacts with external entities */
    openWorldHint?: boolean;
  };
};

export type MCPToolList = {
  tools: MCPTool[];
  nextCursor?: string;
};

export type MCPToolResponse = {
  content: (
    | {
        type: 'text';
        text: string;
      }
    | {
        type: 'image' | 'audio';
        data: string;
        mimeType: string;
      }
    | {
        type: 'resource';
        resource: {
          uri: string;
          mimeType: string;
          text: string;
        };
      }
  )[];
  isError: boolean;
};

export interface MCP {
  prompts: {
    list: (cursor?: string) => MCPPromptList | Promise<MCPPromptList>;
    get: (name: string) => MCPPromptMessage | Promise<MCPPromptMessage>;
  };
  resources: {
    list: (cursor?: string) => MCPResourceList | Promise<MCPResourceList>;
    read: (uri: string) => MCPResourceContent | Promise<MCPResourceContent>;
  };
  tools: {
    list: (cursor?: string) => MCPToolList | Promise<MCPToolList>;
    call: (name: string) => MCPToolResponse | Promise<MCPToolResponse>;
  };
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

  /** Not yet implemented. Add a MCP server to the plugin that will be accessible to the agent. */
  mcp?: MCP | null;

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

  /** Called when a context element is selected in the context menu. This only happens in prompting mode. */
  onContextElementSelect?:
    | ((element: HTMLElement) => ContextElementContext)
    | null;
}
