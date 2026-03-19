import { createContext, useContext } from 'react';

/**
 * The `browserSessionId` captured at message creation time.
 * `null` means the message predates session tracking (treat as unknown → no stale check).
 */
const MessageBrowserSessionContext = createContext<string | null>(null);

export const MessageBrowserSessionProvider =
  MessageBrowserSessionContext.Provider;

/**
 * Returns the browser session ID that was active when the currently-rendered
 * message was created, or `null` if unavailable.
 */
export function useMessageBrowserSession(): string | null {
  return useContext(MessageBrowserSessionContext);
}
