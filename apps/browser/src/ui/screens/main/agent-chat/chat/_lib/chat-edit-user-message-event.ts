export const CHAT_EDIT_USER_MESSAGE_REQUESTED_EVENT =
  'chat-edit-user-message-requested';

export type ChatEditUserMessageRequestedEvent = CustomEvent<{
  messageId: string;
}>;

declare global {
  interface WindowEventMap {
    [CHAT_EDIT_USER_MESSAGE_REQUESTED_EVENT]: ChatEditUserMessageRequestedEvent;
  }
}
