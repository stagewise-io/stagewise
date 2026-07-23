import { useCallback } from 'react';
import { useKartonProcedure } from './use-karton';
import { useContentCollapsed } from '@ui/screens/main/_components/content-collapsed-context';
import { useOpenAgent } from './use-open-chat';

export function useOpenSideChat() {
  const [parentAgentId] = useOpenAgent();
  const createSideChat = useKartonProcedure((p) => p.agents.createSideChat);
  const createSideChatTab = useKartonProcedure(
    (p) => p.browser.createSideChatTab,
  );
  const discardSideChat = useKartonProcedure((p) => p.agents.discardSideChat);
  const { setCollapsed } = useContentCollapsed();

  return useCallback(async () => {
    if (!parentAgentId) return;
    setCollapsed(false);
    let sideChatAgentId: string | undefined;
    try {
      sideChatAgentId = await createSideChat(parentAgentId);
      const tabId = await createSideChatTab(parentAgentId, sideChatAgentId);
      if (!tabId) throw new Error('Failed to open side chat tab');
    } catch (error) {
      if (sideChatAgentId) await discardSideChat(sideChatAgentId);
      console.error('Failed to create side chat:', error);
    }
  }, [
    parentAgentId,
    createSideChat,
    createSideChatTab,
    discardSideChat,
    setCollapsed,
  ]);
}
