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
import type { ToolbarContext, ToolbarPlugin } from '@/plugin';
import { useSRPCBridge } from './use-srpc-bridge';

export interface PluginContextType {
  plugins: ToolbarPlugin[];
  toolbarContext: ToolbarContext;
  pluginToolbarActions: Record<string, FunctionComponent>;
}

const PluginContext = createContext<PluginContextType>({
  plugins: [],
  toolbarContext: {
    sendPrompt: () => {},
    renderToolbarAction: () => ({ remove: () => {} }),
  },
  pluginToolbarActions: {},
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
    };
  }, [plugins, toolbarContext, pluginToolbarActions]);

  return (
    <PluginContext.Provider value={value}>{children}</PluginContext.Provider>
  );
}

export function usePlugins() {
  return useContext(PluginContext);
}
