import { usePlugins } from '@/hooks/use-plugins';
import type { ToolbarContext } from '@/plugin-sdk/plugin';

export type { ToolbarContext }; // Necessary to make the type available in the built package

export {
  Panel,
  PanelContent,
  PanelHeader,
  PanelFooter,
} from '@/components/ui/panel';

export { Badge } from '@/components/ui/badge';

export { Button } from '@/components/ui/button';

export * from '@/plugin-sdk/plugin';

// Create proxies that always delegate to the current value from globalThis
export const useToolbar = () => {
  const plugins = usePlugins();
  return plugins.toolbarContext;
};
