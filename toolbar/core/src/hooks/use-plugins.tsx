import { createContext, type ReactNode } from 'react';
import { useContext, useEffect, useMemo, useRef } from 'react';
import type {
  PluginUserMessage,
  ToolbarContext,
  ToolbarPlugin,
} from '@/plugin-sdk/plugin';
import { useConfig } from './use-config';
import type { PluginContentItem } from '@stagewise/agent-interface-internal/toolbar';
import { collectUserMessageMetadata, getIFrameWindow } from '@/utils';
import { usePanels } from './use-panels';
import { useAgentChat } from './agent/chat';

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
        const pluginContentItems = plugins.reduce(
          (acc, plugin) => {
            acc[plugin.pluginName] = plugin.onPromptSend?.(prompt);
            return acc;
          },
          {} as Record<string, Record<string, PluginContentItem>>,
        );
        sendMessage(
          prompt.content,
          collectUserMessageMetadata([], pluginContentItems, true),
        );
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
