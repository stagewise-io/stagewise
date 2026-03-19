import { createContext, useContext } from 'react';
import type { BrowserTabSnapshot } from '@shared/karton-contracts/ui/agent/metadata';

export interface MessageBrowserContext {
  /**
   * The `browserSessionId` that was active when this message was sent.
   * `null` means the message predates session tracking (treat as unknown → no stale check).
   */
  sessionId: string | null;
  /**
   * Tab snapshots resolved from the nearest environment snapshot at or before
   * this message's position in history. Keyed by tab ID.
   * `null` when rendering outside the chat history (e.g. the composer) — callers
   * should fall back to live Karton state.
   */
  tabs: Map<string, BrowserTabSnapshot> | null;
}

const MessageBrowserContextInstance = createContext<MessageBrowserContext>({
  sessionId: null,
  tabs: null,
});

export const MessageBrowserContextProvider =
  MessageBrowserContextInstance.Provider;

/**
 * Returns the browser context (session ID + tab snapshots) that was active when
 * the currently-rendered message was sent.
 *
 * When rendered outside of a sent message (e.g. inside the composer), both
 * `sessionId` and `tabs` are `null` — consumers should fall back to live state.
 */
export function useMessageBrowserContext(): MessageBrowserContext {
  return useContext(MessageBrowserContextInstance);
}
