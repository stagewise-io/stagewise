import { ChatPanel } from './_components/index';
import { cn } from '@/utils';

export function SidebarChatSection() {
  return (
    <div
      className={cn(
        'size-full rounded-lg bg-[#fcfcfc] p-2 group-data-[collapsed=true]:hidden dark:bg-background',
      )}
    >
      <div className="size-full group-data-[collapsed=true]:hidden">
        <ChatPanel />
      </div>
    </div>
  );
}
