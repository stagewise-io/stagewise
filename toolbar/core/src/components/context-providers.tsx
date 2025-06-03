import { PluginProvider } from '@/hooks/use-plugins';
import type { ToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import { LocationProvider } from '../hooks/use-location';
import type { ComponentChildren } from 'preact';
import { SRPCBridgeProvider } from '@/hooks/use-srpc-bridge';
import { VSCodeProvider } from '@/hooks/use-vscode';
import { ConfigProvider } from '@/hooks/use-config';

export function ContextProviders({
  children,
  config,
}: {
  children?: ComponentChildren;
  config?: ToolbarConfig;
}) {
  return (
    <ConfigProvider config={config}>
      <LocationProvider>
        <SRPCBridgeProvider>
          <VSCodeProvider>
            <PluginProvider>
              <ChatStateProvider>{children}</ChatStateProvider>
            </PluginProvider>
          </VSCodeProvider>
        </SRPCBridgeProvider>
      </LocationProvider>
    </ConfigProvider>
  );
}
