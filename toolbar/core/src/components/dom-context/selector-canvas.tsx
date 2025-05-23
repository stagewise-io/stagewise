// SPDX-License-Identifier: AGPL-3.0-only
// Selector canvas component for the toolbar
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { useCallback, useMemo, useState } from 'preact/hooks';
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
