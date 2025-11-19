import { useChatState } from '@/hooks/use-chat-state';
import { ContextElementsChipsFlexible } from './context-elements-chips-flexible';

export function ContextElementsChips() {
  const { selectedElements, removeSelectedElement } = useChatState();

  return (
    <ContextElementsChipsFlexible
      selectedElements={selectedElements}
      removeSelectedElement={removeSelectedElement}
    />
  );
}
