import { useChatState } from '@/hooks/use-chat-state';
import { ContextElementsChipsFlexible } from './context-elements-chips-flexible';

export function ContextElementsChips() {
  const { domContextElements, removeChatDomContext } = useChatState();

  return (
    <ContextElementsChipsFlexible
      domContextElements={domContextElements}
      removeChatDomContext={removeChatDomContext}
    />
  );
}
