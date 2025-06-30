import { usePlugins } from '@/hooks/use-plugins';
import type { ToolbarContext } from '@/plugin';

export type { ToolbarContext }; // Necessary to make the type available in the built package

export {
  Panel,
  PanelContent,
  PanelHeader,
  PanelFooter,
} from '@/plugin-ui/components/panel';

export { Badge } from '@/plugin-ui/components/badge';

export { Button } from '@/plugin-ui/components/button';

// Create proxies that always delegate to the current value from globalThis
export const useToolbar = () => {
  const plugins = usePlugins();
  return plugins.toolbarContext;
};
