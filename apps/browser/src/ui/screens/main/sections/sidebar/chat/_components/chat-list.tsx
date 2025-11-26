import { Trash2Icon } from 'lucide-react';
import TimeAgo from 'react-timeago';
import { useEffect } from 'react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@/hooks/use-karton';
import type { Chat } from '@shared/karton-contracts/ui';
import { cn } from '@/utils';

export function ChatList({ onClose }: { onClose: () => void }) {
  const { chats, activeChatId, isWorking } = useKartonState(
    useComparingSelector((s) => ({
      chats: s.workspace?.agentChat?.chats || {},
      activeChatId: s.workspace?.agentChat?.activeChatId || null,
      isWorking: s.workspace?.agentChat?.isWorking || false,
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
  const deleteChat = useKartonProcedure((p) => p.agentChat.delete);
  const switchChat = useKartonProcedure((p) => p.agentChat.switch);

  return (
    <div className="py-0.5">
      <div
        className="flex shrink-0 cursor-pointer flex-row items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted-foreground/5"
        role="button"
        onClick={() => {
          switchChat(chatId);
          onClose();
        }}
      >
        <div className="flex flex-1 flex-col items-start justify-start gap-0">
          <span
            className={cn(
              'max-w-full truncate font-medium text-foreground text-sm',
              isActive && 'text-blue-600',
            )}
          >
            {chat.title}
          </span>
          <span className="text-muted-foreground text-xs">
            <TimeAgo date={chat.createdAt} />
          </span>
        </div>
        <div className="flex flex-row gap-1">
          <button
            className="pointer-cursor flex size-8 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-foreground/10 hover:text-foreground"
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
