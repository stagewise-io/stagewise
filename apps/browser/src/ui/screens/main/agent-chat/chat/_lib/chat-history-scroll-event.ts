export const CHAT_HISTORY_SCROLL_EVENT = 'chat-history-scroll';

export type ChatHistoryScrollDirection = 'up' | 'down';

export interface ChatHistoryScrollEventDetail {
  direction: ChatHistoryScrollDirection;
}

declare global {
  interface WindowEventMap {
    [CHAT_HISTORY_SCROLL_EVENT]: CustomEvent<ChatHistoryScrollEventDetail>;
  }
}

export function dispatchChatHistoryScroll(
  direction: ChatHistoryScrollDirection,
) {
  window.dispatchEvent(
    new CustomEvent(CHAT_HISTORY_SCROLL_EVENT, {
      detail: { direction },
    }),
  );
}
