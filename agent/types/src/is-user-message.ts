import type { ChatUserMessage } from '@stagewise/agent-interface-internal/agent';
import type { CoreMessage } from 'ai';

export function isUserMessage(
  message: CoreMessage | ChatUserMessage,
): message is ChatUserMessage {
  return 'metadata' in message;
}
