import { useCallback, useState } from 'preact/hooks';
import { ElementSelector } from './element-selector';
import { useChatState } from '@/hooks/use-chat-state';
import { ContextItemProposal } from './item-proposal';
import { ContextItem } from './item';

export function SelectorCanvas() {
  const {
    domContextElements,
    addChatDomContext,
    isPromptCreationActive,
    promptState,
  } = useChatState();

  const shouldShow = isPromptCreationActive && promptState !== 'loading';

  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(
    null,
  );

  const addElementToContext = useCallback(
    (el: HTMLElement) => {
      addChatDomContext(el);
    },
    [addChatDomContext],
  );

  if (!shouldShow) return null;
  return (
    <>
      {hoveredElement && <ContextItemProposal refElement={hoveredElement} />}
      <ElementSelector
        ignoreList={domContextElements.map((el) => el.element)}
        onElementHovered={setHoveredElement}
        onElementSelected={addElementToContext}
        onElementUnhovered={() => setHoveredElement(null)}
      />
      {domContextElements.map((el) => (
        <ContextItem refElement={el.element} pluginContext={el.pluginContext} />
      ))}
    </>
  );
}
