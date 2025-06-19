import { type ComponentChildren, createContext } from 'preact';
import { useContext, useEffect, useMemo, useRef } from 'preact/hooks';
import type { ToolbarContext, ToolbarPlugin } from '@/plugin';
import { useSRPCBridge } from './use-srpc-bridge';
import type { PromptRequest } from '@stagewise/extension-toolbar-srpc-contract';
import { useVSCode } from './use-vscode';
import { useConfig } from './use-config';

export interface PluginContextType {
  plugins: ToolbarPlugin[];
  toolbarContext: ToolbarContext;
}

const PluginContext = createContext<PluginContextType>({
  plugins: [],
  toolbarContext: {
    sendPrompt: () => {},
  },
});

export function PluginProvider({ children }: { children: ComponentChildren }) {
  const { bridge } = useSRPCBridge();
  const { selectedSession } = useVSCode();
  const { config } = useConfig();

  const plugins = config?.plugins || [];

  const toolbarContext = useMemo(() => {
    return {
      sendPrompt: async (prompt: string | PromptRequest) => {
        if (!bridge) throw new Error('No connection to the agent');

        const result = await bridge.call.triggerAgentPrompt(
          typeof prompt === 'string'
            ? {
                prompt,
                ...(selectedSession && {
                  sessionId: selectedSession.sessionId,
                }),
              }
            : {
                prompt: prompt.prompt,
                model: prompt.model,
                files: prompt.files,
                images: prompt.images,
                mode: prompt.mode,
                ...(selectedSession && {
                  sessionId: selectedSession.sessionId,
                }),
              },
          {
            onUpdate: (_update) => {},
          },
        );
        return result;
      },
    };
  }, [bridge, selectedSession]);

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
