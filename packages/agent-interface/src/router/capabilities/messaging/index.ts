import { procedure, router } from '../../trpc';
import { zAsyncIterable } from '../../../utils';
import { type AgentMessageUpdate, agentMessageUpdateSchema } from './types';
import { type UserMessage, userMessageSchema } from './types';

// 2. DEFINE THE IMPLEMENTATION INTERFACE
export interface MessagingImplementation {
  /** Returns the currently active message to the toolbar.
   *
   * ***Always send over the last known state over to the toolbar immediately after connection.***
   *
   * *In order to clear the agent message, simply send an empty message with a new message ID. Agent's should do so only once they added the message to the chat history (not implemented yet), or after setting the state to "idle".*
   *
   * ***You should not return in this function, as this closes the subscription and will prompt the toolbar to subscribe again.***
   */
  getMessage: () => AsyncIterable<AgentMessageUpdate>;

  onUserMessage: (message: UserMessage) => void;
}

// 3. DEFINE THE SUB-ROUTER
export const messagingRouter = (impl: MessagingImplementation) =>
  router({
    getMessage: procedure
      .output(
        zAsyncIterable({
          yield: agentMessageUpdateSchema,
        }),
      )
      .subscription(impl.getMessage),
    sendUserMessage: procedure
      .input(userMessageSchema)
      .mutation(({ input }) => impl.onUserMessage(input)),
  });
