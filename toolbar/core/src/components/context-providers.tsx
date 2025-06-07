import { PluginProvider } from '@/hooks/use-plugins';
import type { ToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import type { ComponentChildren } from 'preact';
import { SRPCBridgeProvider } from '@/hooks/use-srpc-bridge';
import { VSCodeProvider } from '@/hooks/use-vscode';
import { ConfigProvider } from '@/hooks/use-config';
import { AppStateProvider } from '@/hooks/use-app-state';

export function ContextProviders({
  children,
  config,
}: {
  children?: ComponentChildren;
  config?: ToolbarConfig;
}) {
  return (
    <ConfigProvider config={config}>
      <SRPCBridgeProvider>
        <VSCodeProvider>
          <PluginProvider>
            <AppStateProvider>
              <ChatStateProvider>{children}</ChatStateProvider>
            </AppStateProvider>
          </PluginProvider>
        </VSCodeProvider>
      </SRPCBridgeProvider>
    </ConfigProvider>
  );
}
