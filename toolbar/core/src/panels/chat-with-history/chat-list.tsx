import { Trash2Icon } from 'lucide-react';
import TimeAgo from 'react-timeago';

export function ChatList() {
  return (
    <div className="flex flex-col divide-y divide-zinc-500/10">
      <ChatListItem
        chatId="1"
        chatTitle="Chat 1"
        chatStartingDate={new Date()}
      />
      <ChatListItem
        chatId="2"
        chatTitle="Chat 2"
        chatStartingDate={new Date()}
      />
      <ChatListItem
        chatId="3"
        chatTitle="Chat 3"
        chatStartingDate={new Date()}
      />
      <ChatListItem
        chatId="4"
        chatTitle="Chat 4"
        chatStartingDate={new Date()}
      />
      <ChatListItem
        chatId="5"
        chatTitle="Chat 5"
        chatStartingDate={new Date()}
      />
      <ChatListItem
        chatId="6"
        chatTitle="Chat 6"
        chatStartingDate={new Date()}
      />
    </div>
  );
}

function ChatListItem({
  chatId,
  chatTitle,
  chatStartingDate,
}: {
  chatId: string;
  chatTitle: string;
  chatStartingDate: Date;
}) {
  return (
    <div className="py-0.5">
      <div className="flex shrink-0 cursor-pointer flex-row items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-zinc-500/5">
        <div className="flex flex-1 flex-col items-start justify-start gap-0">
          <span className="truncate font-medium text-sm text-zinc-950">
            {chatTitle}
          </span>
          <span className="text-xs text-zinc-600">
            <TimeAgo date={chatStartingDate} />
          </span>
        </div>
        <div className="flex flex-row gap-1">
          <button
            className="pointer-cursor flex size-8 items-center justify-center rounded-full text-zinc-500 transition-all duration-150 hover:bg-rose-600/10 hover:text-rose-600"
            type="button"
          >
            <Trash2Icon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
