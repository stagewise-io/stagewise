import { ChatPanel } from './_components/index';
import { cn } from '@ui/utils';

export function Chat() {
  return (
    <div className={cn('size-full group-data-[collapsed=true]:hidden')}>
      <ChatPanel />
    </div>
  );
}
