import { PluginProvider } from '@/hooks/use-plugins';
import type { InternalToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ReactNode } from 'react';
import { ConfigProvider } from '@/hooks/use-config';
import { PanelsProvider } from '@/hooks/use-panels';
import { KartonProvider } from '@/hooks/use-karton';
import { Tooltip } from '@base-ui-components/react/tooltip';
import { ContextChipHoverProvider } from '@/hooks/use-context-chip-hover';

export function ContextProviders({
  children,
  config,
}: {
  children?: ReactNode;
  config?: InternalToolbarConfig;
}) {
  return (
    <Tooltip.Provider>
      <ConfigProvider config={config}>
        <KartonProvider>
          <PanelsProvider>
            <PluginProvider>
              <ContextChipHoverProvider>
                <ChatStateProvider>{children}</ChatStateProvider>
              </ContextChipHoverProvider>
            </PluginProvider>
          </PanelsProvider>
        </KartonProvider>
      </ConfigProvider>
    </Tooltip.Provider>
  );
}
