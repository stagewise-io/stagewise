import { MessageCircleIcon } from 'lucide-react';
import { ChatPanel } from './_components/index';
import { Button } from '@stagewise/stage-ui/components/button';

export function SidebarChatSection({
  openChatPanel,
}: {
  openChatPanel: () => void;
}) {
  return (
    <div className="relative size-full p-4">
      <div className="size-full group-data-[collapsed=true]:hidden">
        <ChatPanel />
      </div>
      <div className="hidden size-full flex-col items-center justify-end gap-4 group-data-[collapsed=true]:flex">
        <Button
          variant="ghost"
          size="icon-md"
          aria-label="Open chat"
          onClick={openChatPanel}
        >
          <MessageCircleIcon className="size-5" />
        </Button>
      </div>
    </div>
  );
}
