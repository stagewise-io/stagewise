import { useKartonState } from '@ui/hooks/use-karton';
import { ChatPanel } from './_components/index';
import { NotSignedIn } from './_components/not-signed-in';
import { cn } from '@ui/utils';

export function SidebarChatSection() {
  const signedIn = useKartonState(
    (s) =>
      s.userAccount?.status === 'authenticated' ||
      s.userAccount?.status === 'server_unreachable',
  );
  const allProvidersUseStagewise = useKartonState((s) => {
    const configs = s.preferences?.providerConfigs;
    if (!configs) return true;
    return (
      configs.anthropic.mode === 'stagewise' &&
      configs.openai.mode === 'stagewise' &&
      configs.google.mode === 'stagewise'
    );
  });

  const showAuthPrompt = !signedIn && allProvidersUseStagewise;

  return (
    <div className={cn('size-full group-data-[collapsed=true]:hidden')}>
      {showAuthPrompt ? <NotSignedIn /> : <ChatPanel />}
    </div>
  );
}
