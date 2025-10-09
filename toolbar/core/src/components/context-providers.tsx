import { PluginProvider } from '@/hooks/use-plugins';
import type { InternalToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ReactNode } from 'react';
import { ConfigProvider } from '@/hooks/use-config';
import { PanelsProvider } from '@/hooks/use-panels';
import { KartonProvider } from '@/hooks/use-karton';
import { TooltipProvider } from '@stagewise/stage-ui/components/tooltip';
import { ContextChipHoverProvider } from '@/hooks/use-context-chip-hover';
import { PostHogProvider } from '@/hooks/use-posthog';

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
            <PanelsProvider>
              <PluginProvider>
                <ContextChipHoverProvider>
                  <ChatStateProvider>{children}</ChatStateProvider>
                </ContextChipHoverProvider>
              </PluginProvider>
            </PanelsProvider>
          </PostHogProvider>
        </KartonProvider>
      </ConfigProvider>
    </TooltipProvider>
  );
}
