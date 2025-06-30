import { PluginProvider, usePlugins } from '@/hooks/use-plugins';
import type { ToolbarConfig } from '../config';
import { ChatStateProvider } from '@/hooks/use-chat-state';
import { useEffect, type ReactNode } from 'react';
import { SRPCBridgeProvider } from '@/hooks/use-srpc-bridge';
import { VSCodeProvider } from '@/hooks/use-vscode';
import { ConfigProvider } from '@/hooks/use-config';
import { Button } from '@/plugin-ui/components/button';
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelFooter,
} from '@/plugin-ui/components/panel';
import { Badge } from '@/plugin-ui/components/badge';

export function ContextProviders({
  children,
  config,
}: {
  children?: ReactNode;
  config?: ToolbarConfig;
}) {
  return (
    <ConfigProvider config={config}>
      <VSCodeProvider>
        <SRPCBridgeProvider>
          <PluginProvider>
            <PluginInteropProvider>
              <ChatStateProvider>{children}</ChatStateProvider>
            </PluginInteropProvider>
          </PluginProvider>
        </SRPCBridgeProvider>
      </VSCodeProvider>
    </ConfigProvider>
  );
}

function useToolbar() {
  const plugins = usePlugins();
  return plugins.toolbarContext;
}

function PluginInteropProvider({ children }: { children?: ReactNode }) {
  useEffect(() => {
    globalThis['plugin-ui-Panel'] = Panel.bind(this);
    globalThis['plugin-ui-PanelContent'] = PanelContent.bind(this);
    globalThis['plugin-ui-PanelHeader'] = PanelHeader.bind(this);
    globalThis['plugin-ui-PanelFooter'] = PanelFooter.bind(this);

    globalThis['plugin-ui-Badge'] = Badge.bind(this);

    globalThis['plugin-ui-Button'] = Button.bind(this);

    globalThis['plugin-ui-useToolbar'] = useToolbar.bind(this);
  }, []);

  return children;
}
