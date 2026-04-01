import { useCallback } from 'react';
import { useKartonProcedure } from './use-karton';
import { useOpenAgent } from './use-open-chat';
import { generateId } from '@ui/utils';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';

/**
 * Returns a stable callback that sends a synthetic `/implement`
 * slash-command message to the currently open agent.
 *
 * Handles:
 * - Building the `AgentMessage` with the `[/implement](slash:command:implement)` link
 * - Dispatching `chat-message-sent` for optimistic rendering + auto-scroll
 * - Calling `sendUserMessage` on the Karton procedure
 *
 * No-ops silently when no agent is open.
 */
export function useSendImplement(): () => void {
  const [openAgentId] = useOpenAgent();
  const sendUserMessage = useKartonProcedure((p) => p.agents.sendUserMessage);

  return useCallback(() => {
    if (!openAgentId) return;

    const message: AgentMessage & { role: 'user' } = {
      id: generateId(),
      role: 'user',
      parts: [
        {
          type: 'text',
          text: '[/implement](slash:command:implement)',
        },
      ],
      metadata: {
        createdAt: new Date(),
        partsMetadata: [],
      },
    };

    // Dispatch for optimistic rendering + auto-scroll
    window.dispatchEvent(
      new CustomEvent('chat-message-sent', { detail: { message } }),
    );

    void sendUserMessage(openAgentId, message);
  }, [openAgentId, sendUserMessage]);
}
