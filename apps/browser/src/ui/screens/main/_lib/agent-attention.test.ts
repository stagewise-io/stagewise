import { describe, expect, it } from 'vitest';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import {
  buildAgentAttentionEntries,
  findNextAgentAttentionTarget,
} from './agent-attention';

describe('agent attention', () => {
  it('includes unread history chats without duplicating live agents', () => {
    const instances = {
      live: {
        type: AgentTypes.CHAT,
        sideChatParentId: null,
        state: {
          title: 'Live chat',
          history: [],
          isWorking: false,
          unread: false,
        },
      },
    } as unknown as Parameters<typeof buildAgentAttentionEntries>[0];
    const entries = buildAgentAttentionEntries(instances, {}, [
      { id: 'history', title: 'Read later', status: 'success' },
      { id: 'live', title: 'Stale live title', status: 'success' },
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(['live', 'history']);
    expect(findNextAgentAttentionTarget(entries, 'live')).toMatchObject({
      id: 'history',
      status: 'success',
    });
  });
});
