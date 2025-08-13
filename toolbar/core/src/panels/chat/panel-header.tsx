import { PanelHeader } from '@/components/ui/panel';
import { cn } from '@/utils';
import { Button } from '@/components/ui/button';
import { XIcon, PlusIcon, AlignJustifyIcon } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { ChatList } from './chat-list';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useChatState } from '@/hooks/use-chat-state';

export function ChatPanelHeader() {
  const [chatListOpen, setChatListOpen] = useState(false);

  const createChatProcedure = useKartonProcedure((p) => p.createChat);
  const chats = useKartonState((s) => s.chats);
  const activeChatId = useKartonState((s) => s.activeChatId);
  const isWorking = useKartonState((s) => s.isWorking);

  const { startPromptCreation } = useChatState();

  const createChat = useCallback(() => {
    createChatProcedure().then(() => {
      setChatListOpen(false);
      startPromptCreation();
    });
  }, [createChatProcedure, setChatListOpen, startPromptCreation]);

  const emptyChatExists = useMemo(
    () =>
      Object.values(chats).length === 0 ||
      Object.values(chats).some((chat) => chat.messages.length === 0),
    [chats],
  );

  const showChatListButton = Object.keys(chats).length > 1;
  const showNewChatButton = activeChatId && !emptyChatExists;

  return (
    <PanelHeader
      className={cn(
        'pointer-events-none absolute top-px right-px left-px z-20 mb-0 origin-bottom px-3 py-3 pl-4.5 transition-all duration-300 ease-out *:pointer-events-auto',
        chatListOpen
          ? 'h-[calc(100%-2px)] rounded-[inherit] bg-white/60 backdrop-blur-lg'
          : '!h-[calc-size(auto,size)] h-auto',
      )}
      title={chatListOpen && <span className="mt-0.5">Chats</span>}
      clear
      actionArea={
        <>
          {
            <div className="flex flex-row-reverse gap-1">
              {(showChatListButton || chatListOpen) && (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      aria-label={
                        chatListOpen ? 'Close chat list' : 'Open chat list'
                      }
                      variant="secondary"
                      glassy
                      className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg hover:bg-white/60 active:bg-zinc-50/60 disabled:bg-transparent disabled:shadow-none disabled:*:stroke-zinc-500/50"
                      onClick={() => setChatListOpen(!chatListOpen)}
                      disabled={isWorking}
                    >
                      {chatListOpen ? (
                        <XIcon className="size-4 stroke-2" />
                      ) : (
                        <AlignJustifyIcon className="size-4 stroke-2" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {chatListOpen ? 'Close chat list' : 'Open chat list'}
                  </TooltipContent>
                </Tooltip>
              )}
              {showNewChatButton && (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      aria-label="New chat"
                      variant="secondary"
                      glassy
                      className={cn(
                        '!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg transition-all duration-150 ease-out hover:bg-white/60 active:bg-zinc-50/60 disabled:bg-transparent disabled:shadow-none disabled:*:stroke-zinc-500/50',
                        chatListOpen && 'w-fit px-2.5',
                      )}
                      disabled={isWorking}
                      onClick={createChat}
                    >
                      {chatListOpen && <span className="mr-1">New chat</span>}
                      <PlusIcon className="size-4 stroke-2" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New chat</TooltipContent>
                </Tooltip>
              )}
            </div>
          }
          {chatListOpen && (
            <div className="mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_16px,black_calc(100%-16px),transparent_100%)] scrollbar-thin scrollbar-thumb-black/10 scrollbar-track-transparent absolute top-16 right-4 bottom-4 left-4 overflow-hidden overflow-y-auto rounded-md py-4">
              <ChatList onClose={() => setChatListOpen(false)} />
            </div>
          )}
        </>
      }
    />
  );
}
