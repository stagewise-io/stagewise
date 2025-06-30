import { useCallback, useMemo, useState } from 'react';
import { ElementSelector } from './element-selector';
import { useChatState } from '@/hooks/use-chat-state';
import { ContextItemProposal } from './item-proposal';
import { ContextItem } from './item';

export function SelectorCanvas() {
  const {
    chats,
    currentChatId,
    addChatDomContext,
    isPromptCreationActive,
    promptState,
  } = useChatState();

  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId),
    [currentChatId, chats],
  );

  const shouldShow = isPromptCreationActive && promptState !== 'loading';

  const contextElements = useMemo(() => {
    return currentChat?.domContextElements || [];
  }, [currentChat]);

  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(
    null,
  );

  const addElementToContext = useCallback(
    (el: HTMLElement) => {
      addChatDomContext(currentChatId, el);
    },
    [addChatDomContext, currentChatId],
  );

  if (!shouldShow) return null;
  return (
    <>
      {hoveredElement && <ContextItemProposal refElement={hoveredElement} />}
      <ElementSelector
        ignoreList={contextElements.map((el) => el.element)}
        onElementHovered={setHoveredElement}
        onElementSelected={addElementToContext}
        onElementUnhovered={() => setHoveredElement(null)}
      />
      {contextElements.map((el) => (
        <ContextItem refElement={el.element} pluginContext={el.pluginContext} />
      ))}
    </>
  );
}
