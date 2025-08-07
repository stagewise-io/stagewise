import { PluginProvider } from '@/hooks/use-plugins';
import type { InternalToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ReactNode } from 'react';
import { ConfigProvider } from '@/hooks/use-config';
import { AgentProvider } from '@/hooks/agent/use-agent-provider';
import { AgentStateProvider } from '@/hooks/agent/use-agent-state';
import { AgentMessagingProvider } from '@/hooks/agent/use-agent-messaging';
import { PanelsProvider } from '@/hooks/use-panels';
import { ChatHistoryStateProvider } from '@/hooks/use-chat-history-state';

export function ContextProviders({
  children,
  config,
}: {
  children?: ReactNode;
  config?: InternalToolbarConfig;
}) {
  return (
    <ConfigProvider config={config}>
      <AgentProvider>
        <AgentStateProvider>
          <AgentMessagingProvider>
            <PanelsProvider>
              <PluginProvider>
                <ChatStateProvider>
                  <ChatHistoryStateProvider>
                    {children}
                  </ChatHistoryStateProvider>
                </ChatStateProvider>
              </PluginProvider>
            </PanelsProvider>
          </AgentMessagingProvider>
        </AgentStateProvider>
      </AgentProvider>
    </ConfigProvider>
  );
}
