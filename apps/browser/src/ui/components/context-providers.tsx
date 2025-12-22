import { PluginProvider } from '@/hooks/use-plugins';
import type { InternalToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ReactNode } from 'react';
import { ConfigProvider } from '@/hooks/use-config';
import { KartonProvider } from '@/hooks/use-karton';
import { TooltipProvider } from '@stagewise/stage-ui/components/tooltip';
import { PostHogProvider } from '@/hooks/use-posthog';
import { TabStateUIProvider } from '../hooks/use-tab-ui-state';

export function ContextProviders({
  children,
  config,
}: {
  children?: ReactNode;
  config?: InternalToolbarConfig;
}) {
  return (
    <TooltipProvider>
      <ConfigProvider config={config}>
        <KartonProvider>
          <PostHogProvider>
            <PluginProvider>
              <ChatStateProvider>
                <TabStateUIProvider>{children}</TabStateUIProvider>
              </ChatStateProvider>
            </PluginProvider>
          </PostHogProvider>
        </KartonProvider>
      </ConfigProvider>
    </TooltipProvider>
  );
}
