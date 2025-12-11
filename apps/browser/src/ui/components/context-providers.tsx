import { PluginProvider } from '@/hooks/use-plugins';
import type { InternalToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ReactNode } from 'react';
import { ConfigProvider } from '@/hooks/use-config';
import { KartonProvider } from '@/hooks/use-karton';
import { TooltipProvider } from '@stagewise/stage-ui/components/tooltip';
import { ContextChipHoverProvider } from '@/hooks/use-context-chip-hover';
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
              <ContextChipHoverProvider>
                <ChatStateProvider>
                  <TabStateUIProvider>{children}</TabStateUIProvider>
                </ChatStateProvider>
              </ContextChipHoverProvider>
            </PluginProvider>
          </PostHogProvider>
        </KartonProvider>
      </ConfigProvider>
    </TooltipProvider>
  );
}
