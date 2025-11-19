export interface UIHandle {
  remove: () => void;
}

import type { ReactNode } from 'react';
import type { ChatMessage } from '@stagewise/karton-contract';

export type PluginChatMessage = Omit<ChatMessage, 'role' | 'metadata'> & {
  role: 'plugin';
};
export interface ToolbarContext {
  sendPrompt: (prompt: PluginChatMessage) => void;
  mainAppWindow: Window;
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

export type { SelectedElement } from '@stagewise/karton-contract';

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
  iconSvg: ReactNode | null;

  onActionClick?: () => undefined | ReactNode;

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
    | ((
        prompt: Omit<ChatMessage, 'id'>,
      ) => PromptContext | Promise<PromptContext> | null)
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
