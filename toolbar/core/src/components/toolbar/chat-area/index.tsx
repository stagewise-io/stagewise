// SPDX-License-Identifier: AGPL-3.0-only
// Chat area component for the toolbar
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

/** The chat area is the top section of the toolbar that can either be hidden or expanded, based on the likings and the ations of the user. */

import { useChatState } from '@/hooks/use-chat-state';
import { Plus } from 'lucide-react';
import { Button } from '@headlessui/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ComponentChildren } from 'preact';
import { memo, useCallback } from 'preact/compat';
import { cn } from '@/utils';

export const ChatArea = memo(() => {
  const { chatAreaState } = useChatState();

  if (chatAreaState === 'hidden') return null;

  return (
    <ChatAreaBox>
      <ChatAreaResizeBar />
      {chatAreaState === 'compact' && <ChatAreaCompact />}
      {chatAreaState === 'expanded' && <ChatAreaExpanded />}
    </ChatAreaBox>
  );
});

const ChatAreaBox = memo(({ children }: { children: ComponentChildren }) => (
  <div className="h-auto w-full overflow-x-hidden">{children}</div>
));

const ChatAreaResizeBar = memo(() => {
  const { chatAreaState, setChatAreaState, stopPromptCreation } =
    useChatState();

  const handleResizeBarClick = useCallback(() => {
    setChatAreaState(chatAreaState === 'compact' ? 'expanded' : 'compact');
  }, [chatAreaState, setChatAreaState]);

  const handleCloseChatArea = useCallback(() => {
    stopPromptCreation();
    setChatAreaState('hidden');
  }, [setChatAreaState, stopPromptCreation]);

  return (
    <div className="flex w-full flex-row items-center justify-center rounded-t-3xl px-3 py-1">
      <Button
        className="size-5 bg-transparent text-muted-foreground/30 transition-colors duration-100 hover:text-muted-foreground"
        onClick={handleResizeBarClick}
      >
        {chatAreaState === 'compact' ? (
          <ChevronUp className="size-5" />
        ) : (
          <ChevronDown className="size-5" />
        )}
      </Button>
      <Button
        className="absolute right-2 flex h-fit w-fit flex-row items-center gap-1 bg-transparent p-1 text-xs text-zinc-950 opacity-50 transition-all duration-100 hover:opacity-100"
        onClick={handleCloseChatArea}
      >
        Close menu
        <div className="rounded-md bg-zinc-600 px-0.5 py-0 text-xs text-zinc-50">
          esc
        </div>
      </Button>
    </div>
  );
});

const ChatAreaCompact = memo(() => (
  <div className="flex w-full flex-col gap-1 p-3">
    <span className="text-sm text-zinc-950/50">
      This is the compact chat area... Showing just the last response from the
      assistant.
    </span>
  </div>
));

const ChatAreaExpanded = memo(() => {
  const { chats, currentChatId, setCurrentChat, createChat } = useChatState();
  const currentChat = chats.find((chat) => chat.id === currentChatId);
  const hasNewChat = chats.some((chat) => chat.id === 'new_chat');

  const handleCreateChat = useCallback(() => {
    createChat();
  }, [createChat]);

  const handleSetCurrentChat = useCallback(
    (chatId: string) => {
      setCurrentChat(chatId);
    },
    [setCurrentChat],
  );

  return (
    <div className="flex max-h-[50vh] w-full flex-col gap-3 p-3 pb-0">
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-1">
        {currentChat?.messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.sender === 'assistant' ? 'justify-start' : 'justify-end'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-2 py-1 text-sm ${
                message.sender === 'assistant'
                  ? 'bg-zinc-950/5 text-zinc-950'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-row items-center justify-start gap-2 overflow-x-auto overflow-y-visible border-border/10 border-t pt-2 pb-2">
        {!hasNewChat && (
          <Button
            className="h-6 flex-shrink-0 rounded-full bg-zinc-950/5 px-2 font-semibold text-foreground text-xs"
            onClick={handleCreateChat}
          >
            <Plus className="size-3" />
          </Button>
        )}
        {chats.map((chat) => (
          <Button
            key={chat.id}
            className={cn(
              'h-5 max-w-48 flex-shrink-0 overflow-hidden truncate rounded-full bg-zinc-950/5 px-2 text-muted-foreground text-xs',
              chat.id === currentChatId &&
                'bg-white/60 text-zinc-950 shadow-blue-600/50 shadow-sm',
            )}
            onClick={() => handleSetCurrentChat(chat.id)}
          >
            {chat.title || 'New chat'}
          </Button>
        ))}
      </div>
    </div>
  );
});
