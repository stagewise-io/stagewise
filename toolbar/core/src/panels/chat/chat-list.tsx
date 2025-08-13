import { Trash2Icon } from 'lucide-react';
import TimeAgo from 'react-timeago';
import { useEffect } from 'react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@/hooks/use-karton';
import type { Chat } from '@stagewise/karton-contract';
import { cn } from '@/utils';

export function ChatList({ onClose }: { onClose: () => void }) {
  const { chats, activeChatId, isWorking } = useKartonState(
    useComparingSelector((s) => ({
      chats: s.chats,
      activeChatId: s.activeChatId,
      isWorking: s.isWorking,
    })),
  );

  useEffect(() => {
    if (Object.keys(chats).length === 0 || isWorking) {
      onClose();
    }
  }, [chats, isWorking, onClose]);

  return (
    <div className="flex flex-col divide-y divide-zinc-500/10">
      {Object.entries(chats).map(([chatId, chat]) => (
        <ChatListEntry
          key={chatId}
          chatId={chatId}
          chat={chat}
          isActive={chatId === activeChatId}
          isOnly={Object.keys(chats).length === 1}
          onClose={onClose}
        />
      ))}
    </div>
  );
}

function ChatListEntry({
  chat,
  chatId,
  isActive,
  onClose,
  isOnly,
}: {
  chatId: string;
  chat: Chat;
  isActive: boolean;
  onClose: () => void;
  isOnly: boolean;
}) {
  const deleteChat = useKartonProcedure((p) => p.deleteChat);
  const switchChat = useKartonProcedure((p) => p.switchChat);

  return (
    <div className="py-0.5">
      <div
        className="flex shrink-0 cursor-pointer flex-row items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-zinc-500/5"
        role="button"
        onClick={() => {
          switchChat(chatId);
          onClose();
        }}
      >
        <div className="flex flex-1 flex-col items-start justify-start gap-0">
          <span
            className={cn(
              'truncate font-medium text-sm text-zinc-950',
              isActive && 'text-blue-600',
            )}
          >
            {chat.title}
          </span>
          <span className="text-xs text-zinc-600">
            <TimeAgo date={chat.createdAt} />
          </span>
        </div>
        <div className="flex flex-row gap-1">
          <button
            className="pointer-cursor flex size-8 items-center justify-center rounded-full text-zinc-500 transition-all duration-150 hover:bg-rose-600/10 hover:text-rose-600"
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              deleteChat(chatId);
              if (isOnly) {
                onClose();
              }
            }}
          >
            <Trash2Icon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
