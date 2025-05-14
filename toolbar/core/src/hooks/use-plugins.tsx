// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar plugins hook
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import {
  type ComponentChildren,
  createContext,
  type FunctionComponent,
} from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type {
  ToolbarContext,
  ToolbarPlugin,
  PanelOptions,
  PanelHandle,
} from '@/plugin';
import { useSRPCBridge } from './use-srpc-bridge';

export interface PluginContextType {
  plugins: ToolbarPlugin[];
  toolbarContext: ToolbarContext;
  pluginToolbarActions: Record<string, FunctionComponent>;
  pluginPanels: Record<
    string,
    {
      component: FunctionComponent;
      options: PanelOptions;
    }
  >;
  panelHandles: Record<string, PanelHandle>;
}

const PluginContext = createContext<PluginContextType>({
  plugins: [],
  toolbarContext: {
    sendPrompt: () => {},
    renderToolbarAction: () => ({ remove: () => {} }),
    openPanel: () => ({
      remove: () => {},
      updateContent: () => {},
      updateTitle: () => {},
    }),
  },
  pluginToolbarActions: {},
  pluginPanels: {},
  panelHandles: {},
});

export function PluginProvider({
  children,
  plugins,
}: {
  children: ComponentChildren;
  plugins: ToolbarPlugin[];
}) {
  const { bridge } = useSRPCBridge();

  const [pluginToolbarActions, setPluginToolbarActions] = useState<
    Record<string, FunctionComponent>
  >({});

  const [pluginPanels, setPluginPanels] = useState<
    Record<
      string,
      {
        component: FunctionComponent;
        options: PanelOptions;
      }
    >
  >({});

  const [panelHandles, setPanelHandles] = useState<Record<string, PanelHandle>>(
    {},
  );

  const toolbarContext = useMemo(() => {
    return {
      sendPrompt: async (prompt: string) => {
        if (!bridge) throw new Error('No connection to the agent');
        const result = await bridge.call.triggerAgentPrompt(
          { prompt },
          {
            onUpdate: (update) => {},
          },
        );
      },
      renderToolbarAction: (component: FunctionComponent) => {
        const key =
          Date.now().toString() + Math.random().toString(36).substring(2);
        setPluginToolbarActions((prev) => ({ ...prev, [key]: component }));
        return {
          remove: () => {
            setPluginToolbarActions((prev) => {
              const newState = { ...prev };
              delete newState[key];
              return newState;
            });
          },
        };
      },
      openPanel: (
        component: FunctionComponent,
        options: PanelOptions = { title: 'Plugin Panel' },
      ) => {
        const key =
          Date.now().toString() + Math.random().toString(36).substring(2);

        const defaultOptions: PanelOptions = {
          title: options.title || 'Plugin Panel',
          width: options.width || 400,
          height: options.height,
          position: options.position || 'centerRight',
          resizable: options.resizable !== undefined ? options.resizable : true,
        };

        // Create the panel handle first
        const panelHandle: PanelHandle = {
          remove: () => {
            console.log('Removing panel:', key);
            setPluginPanels((prev) => {
              const newState = { ...prev };
              delete newState[key];
              return newState;
            });
            setPanelHandles((prev) => {
              const newState = { ...prev };
              delete newState[key];
              return newState;
            });
          },
          updateContent: (newComponent: FunctionComponent) => {
            setPluginPanels((prev) => {
              const panel = prev[key];
              if (!panel) return prev;

              return {
                ...prev,
                [key]: {
                  ...panel,
                  component: newComponent,
                },
              };
            });
          },
          updateTitle: (newTitle: string) => {
            setPluginPanels((prev) => {
              const panel = prev[key];
              if (!panel) return prev;

              return {
                ...prev,
                [key]: {
                  ...panel,
                  options: {
                    ...panel.options,
                    title: newTitle,
                  },
                },
              };
            });
          },
        };

        // Store the handle
        setPanelHandles((prev) => ({
          ...prev,
          [key]: panelHandle,
        }));

        // Add the panel to state
        setPluginPanels((prev) => ({
          ...prev,
          [key]: {
            component,
            options: defaultOptions,
          },
        }));

        console.log('Created panel:', key, panelHandle);
        return panelHandle;
      },
    };
  }, [bridge]);

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
      pluginToolbarActions,
      pluginPanels,
      panelHandles,
    };
  }, [
    plugins,
    toolbarContext,
    pluginToolbarActions,
    pluginPanels,
    panelHandles,
  ]);

  return (
    <PluginContext.Provider value={value}>{children}</PluginContext.Provider>
  );
}

export function usePlugins() {
  return useContext(PluginContext);
}
