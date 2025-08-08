import { createContext, type ReactNode } from 'react';
import { useContext, useEffect, useMemo, useRef } from 'react';
import type {
  PluginUserMessage,
  ToolbarContext,
  ToolbarPlugin,
} from '@/plugin-sdk/plugin';
import { useConfig } from './use-config';
import { collectUserMessageMetadata, getIFrameWindow } from '@/utils';
import { usePanels } from './use-panels';
import { useAgentChat } from './agent/use-agent-chat';

export interface PluginContextType {
  plugins: ToolbarPlugin[];
  toolbarContext: ToolbarContext;
}

const PluginContext = createContext<PluginContextType>({
  plugins: [],
  toolbarContext: {
    sendPrompt: () => {},
    mainAppWindow: getIFrameWindow(),
  },
});

export function PluginProvider({ children }: { children?: ReactNode }) {
  const { config } = useConfig();

  const { sendMessage } = useAgentChat();

  const { openChat } = usePanels();

  const plugins = config?.plugins || [];

  const toolbarContext = useMemo(() => {
    return {
      sendPrompt: async (prompt: PluginUserMessage) => {
        // Reject messages that contain approval content parts since plugins shouldn't be able to do that
        if (prompt.content.some((part) => part.type === 'tool-approval')) {
          console.error('Plugins are not allowed to send tool call approvals');
          return;
        }

        // We don't collect additional pluginContentItems when plugins send messages since it's probably a very specific message anyway

        sendMessage(prompt.content, collectUserMessageMetadata([], true));
        openChat();
      },
      mainAppWindow: getIFrameWindow(),
    };
  }, [sendMessage]);

  // call plugins once on initial load
  const pluginsLoadedRef = useRef(false);
  useEffect(() => {
    if (pluginsLoadedRef.current) return;
    pluginsLoadedRef.current = true;
    plugins.forEach((plugin) => {
      plugin.onLoad?.(toolbarContext);
    });
  }, [plugins, toolbarContext]);

  const value = useMemo(() => {
    return {
      plugins,
      toolbarContext,
    };
  }, [plugins, toolbarContext]);

  return (
    <PluginContext.Provider value={value}>{children}</PluginContext.Provider>
  );
}

export function usePlugins() {
  return useContext(PluginContext);
}
