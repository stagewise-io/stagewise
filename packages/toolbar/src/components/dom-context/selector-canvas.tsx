import { useCallback, useMemo, useState } from "preact/hooks";
import { ElementSelector } from "./element-selector";
import { useChatState } from "@/hooks/use-chat-state";
import { ContextItemProposal } from "./item-proposal";
import { ContextItem } from "./item";

export function SelectorCanvas() {
  const { chats, currentChatId, addChatDomContext, isPromptCreationActive } =
    useChatState();

  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId),
    [currentChatId, chats]
  );

  const shouldShow = isPromptCreationActive;

  const contextElements = useMemo(() => {
    return currentChat?.domContextElements || [];
  }, [currentChat]);

  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(
    null
  );

  const addElementToContext = useCallback(
    (el: HTMLElement) => {
      addChatDomContext(currentChatId, el);
    },
    [addChatDomContext, currentChatId]
  );

  if (!shouldShow) return null;
  return (
    <>
      {hoveredElement && <ContextItemProposal refElement={hoveredElement} />}
      <ElementSelector
        ignoreList={contextElements}
        onElementHovered={setHoveredElement}
        onElementSelected={addElementToContext}
        onElementUnhovered={() => setHoveredElement(null)}
      />
      {contextElements.map((el) => (
        <ContextItem refElement={el} />
      ))}
    </>
  );
}
