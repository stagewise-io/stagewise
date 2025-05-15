// SPDX-License-Identifier: AGPL-3.0-only
// Chat box component for the toolbar
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

import { useChatState } from '@/hooks/use-chat-state';
import { useHotkeyListenerComboText } from '@/hooks/use-hotkey-listener-combo-text';
import { cn, HotkeyActions } from '@/utils';
import { Button, Textarea } from '@headlessui/react';
import { Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useCallback } from 'preact/hooks';

export function ToolbarChatBox() {
  const chatState = useChatState();

  const currentChat = useMemo(
    () => chatState.chats.find((c) => c.id === chatState.currentChatId),
    [chatState.chats, chatState.currentChatId],
  );

  const currentInput = useMemo(
    () => currentChat?.inputValue || '',
    [currentChat?.inputValue],
  );

  const showBigBox = useMemo(() => {
    return currentInput.split('\n').length > 1 || currentInput.length > 30;
  }, [currentInput]);

  const handleInputChange = useCallback(
    (value: string) => {
      chatState.setChatInput(chatState.currentChatId, value);
    },
    [chatState.setChatInput, chatState.currentChatId],
  );

  const handleSubmit = useCallback(() => {
    if (!currentChat || !currentInput.trim()) return;
    chatState.addMessage(currentChat.id, currentInput);
  }, [currentChat, currentInput, chatState.addMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const blurHandler = () => inputRef.current?.focus();

    if (chatState.isPromptCreationActive) {
      inputRef.current?.focus();
      inputRef.current?.addEventListener('blur', blurHandler);
    } else {
      inputRef.current?.blur();
    }

    return () => {
      inputRef.current?.removeEventListener('blur', blurHandler);
    };
  }, [chatState.isPromptCreationActive]);

  const buttonClassName = useMemo(
    () =>
      cn(
        'flex size-6 items-center justify-center rounded-full bg-transparent p-1 text-zinc-950 opacity-20',
        currentInput.length > 0 && 'bg-blue-600 text-white opacity-100',
      ),
    [currentInput.length],
  );

  const textareaClassName = useMemo(
    () =>
      cn(
        'w-full flex-1 resize-none bg-transparent text-zinc-950 placeholder:text-zinc-950/50 focus:outline-none',
        showBigBox ? 'h-[4.5em]' : 'h-6',
      ),
    [showBigBox],
  );

  const ctrlAltCText = useHotkeyListenerComboText(HotkeyActions.CTRL_ALT_C);

  return (
    <div
      className={cn(
        'flex h-fit w-80 flex-1 flex-row items-end gap-1 rounded-2xl border border-border/10 bg-zinc-950/5 p-1.5 pl-2 text-sm text-zinc-950 shadow-inner transition-all duration-150 placeholder:text-zinc-950/70',
        chatState.isPromptCreationActive && 'ring-2 ring-blue-600',
      )}
      onClick={() => chatState.startPromptCreation()}
      role="button"
      tabIndex={0}
    >
      <Textarea
        ref={inputRef}
        className={textareaClassName}
        rows={showBigBox ? 4 : 1}
        value={currentInput}
        onChange={(e) => handleInputChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          chatState.isPromptCreationActive
            ? 'Enter prompt...'
            : `What do you want to change? (${ctrlAltCText})`
        }
      />
      <Button
        className={buttonClassName}
        disabled={currentInput.length === 0}
        onClick={handleSubmit}
      >
        <Send className="size-3" />
      </Button>
    </div>
  );
}
