import { useChatState } from '@/hooks/use-chat-state';
import { SelectedElementsChipsFlexible } from './selected-elements-chips-flexible';

export function SelectedElementsChips() {
  const { selectedElements, removeSelectedElement } = useChatState();

  return (
    <SelectedElementsChipsFlexible
      selectedElements={selectedElements}
      removeSelectedElementById={removeSelectedElement}
    />
  );
}
