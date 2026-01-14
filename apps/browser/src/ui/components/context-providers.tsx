import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ReactNode } from 'react';
import { KartonProvider } from '@/hooks/use-karton';
import { TooltipProvider } from '@stagewise/stage-ui/components/tooltip';
import { PostHogProvider } from '@/hooks/use-posthog';
import { TabStateUIProvider } from '../hooks/use-tab-ui-state';

export function ContextProviders({ children }: { children?: ReactNode }) {
  return (
    <TooltipProvider>
      <KartonProvider>
        <PostHogProvider>
          <ChatStateProvider>
            <TabStateUIProvider>{children}</TabStateUIProvider>
          </ChatStateProvider>
        </PostHogProvider>
      </KartonProvider>
    </TooltipProvider>
  );
}
