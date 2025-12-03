import { PanelHeader } from '@/components/ui/panel';
import { cn } from '@/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { XIcon, PlusIcon, AlignJustifyIcon } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { ChatList } from './chat-list';
import {
  useKartonProcedure,
  useKartonState,
  useComparingSelector,
} from '@/hooks/use-karton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

export function ChatPanelHeader({
  multiChatControls,
}: {
  multiChatControls: boolean;
}) {
  const [chatListOpen, setChatListOpen] = useState(false);

  const createChatProcedure = useKartonProcedure((p) => p.agentChat.create);
  const chats = useKartonState(
    useComparingSelector((s) => s.agentChat?.chats || {}),
  );
  const activeChatId = useKartonState((s) => s.agentChat?.activeChatId || null);
  const isWorking = useKartonState((s) => s.agentChat?.isWorking || false);

  const createChat = useCallback(() => {
    createChatProcedure().then(() => {
      setChatListOpen(false);
    });
  }, [createChatProcedure, setChatListOpen]);

  const emptyChatExists = useMemo(
    () =>
      Object.values(chats).length === 0 ||
      Object.values(chats).some((chat) => chat.messages.length === 0),
    [chats],
  );

  const showChatListButton = Object.keys(chats).length > 1;
  const showNewChatButton = activeChatId && !emptyChatExists;

  if (!multiChatControls) {
    return null;
  }

  return (
    <PanelHeader
      className={cn(
        '-inset-3 pointer-events-none absolute z-20 origin-bottom p-4 transition-all duration-300 ease-out *:pointer-events-auto',
        chatListOpen
          ? 'rounded-[inherit] bg-background/30 backdrop-blur-lg'
          : '!h-[calc-size(auto,size)] h-auto',
      )}
      title={chatListOpen && <span className="mt-0.5 ml-2">Chats</span>}
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
                      className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg"
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
                      className={cn(
                        '!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 backdrop-blur-lg transition-all duration-150 ease-out',
                        chatListOpen && 'w-fit px-2.5',
                      )}
                      disabled={isWorking}
                      onClick={createChat}
                    >
                      {chatListOpen && <span>New chat</span>}
                      <PlusIcon className="size-4 stroke-2" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New chat</TooltipContent>
                </Tooltip>
              )}
            </div>
          }
          {chatListOpen && (
            <div className="mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_16px,black_calc(100%-16px),transparent_100%)] scrollbar-subtle absolute top-16 right-4 bottom-4 left-4 overflow-hidden overflow-y-auto rounded-md py-4">
              <ChatList onClose={() => setChatListOpen(false)} />
            </div>
          )}
        </>
      }
    />
  );
}
