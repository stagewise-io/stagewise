import { PluginProvider } from '@/hooks/use-plugins';
import type { InternalToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ReactNode } from 'react';
import { ConfigProvider } from '@/hooks/use-config';
import { PanelsProvider } from '@/hooks/use-panels';
import { KartonProvider } from '@/hooks/use-karton';

export function ContextProviders({
  children,
  config,
}: {
  children?: ReactNode;
  config?: InternalToolbarConfig;
}) {
  return (
    <ConfigProvider config={config}>
      <KartonProvider>
        <PanelsProvider>
          <PluginProvider>
            <ChatStateProvider>{children}</ChatStateProvider>
          </PluginProvider>
        </PanelsProvider>
      </KartonProvider>
    </ConfigProvider>
  );
}
