import { PluginProvider } from '@/hooks/use-plugins';
import type { InternalToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ReactNode } from 'react';
import { ConfigProvider } from '@/hooks/use-config';
import { PanelsProvider } from '@/hooks/use-panels';
import { KartonProvider } from '@/hooks/use-karton';
import { Tooltip } from '@base-ui-components/react/tooltip';

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
              <ChatStateProvider>{children}</ChatStateProvider>
            </PluginProvider>
          </PanelsProvider>
        </KartonProvider>
      </ConfigProvider>
    </Tooltip.Provider>
  );
}
