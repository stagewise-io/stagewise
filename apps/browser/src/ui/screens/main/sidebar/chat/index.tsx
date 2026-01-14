import { useKartonState } from '@/hooks/use-karton';
import { ChatPanel } from './_components/index';
import { NotSignedIn } from './_components/not-signed-in';
import { cn } from '@/utils';

export function SidebarChatSection() {
  const signedIn = useKartonState(
    (s) => s.userAccount?.status === 'authenticated',
  );
  return (
    <div
      className={cn(
        'size-full rounded-lg bg-background group-data-[collapsed=true]:hidden',
      )}
    >
      {signedIn ? <ChatPanel /> : <NotSignedIn />}
    </div>
  );
}
