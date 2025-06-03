import { type ComponentChildren, createContext } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import type { ToolbarConfig } from '@/config';

export interface ConfigContextType {
  config: ToolbarConfig | undefined;
}

const ConfigContext = createContext<ConfigContextType>({
  config: undefined,
});

/**
 * Provider component that makes toolbar configuration available throughout the component tree.
 * This should be placed at the root of your toolbar application.
 *
 * @param children - Child components that will have access to the config
 * @param config - The toolbar configuration object from initToolbar()
 */
export function ConfigProvider({
  children,
  config,
}: {
  children: ComponentChildren;
  config?: ToolbarConfig;
}) {
  const value = useMemo(() => {
    return {
      config,
    };
  }, [config]);

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}

/**
 * Hook to access the toolbar configuration throughout the application.
 * Returns the config object that was passed to initToolbar().
 *
 * @returns Object containing the toolbar config
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { config } = useConfig();
 *
 *   if (!config) {
 *     return <div>No configuration available</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h2>Available Plugins: {config.plugins.length}</h2>
 *       {config.plugins.map(plugin => (
 *         <div key={plugin.pluginName}>{plugin.displayName}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useConfig() {
  return useContext(ConfigContext);
}
