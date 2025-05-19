import { usePlugins } from '@/hooks/use-plugins';

export {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'preact/hooks';

export * from 'preact';

export const useToolbar = () => {
  const plugins = usePlugins();

  return plugins.toolbarContext;
};

export {
  PluginBox as Panel,
  PluginBoxHeader as Header,
  PluginBoxContent as Content,
  PluginBoxFooter as Footer,
  PluginBox,
  PluginBoxHeader,
  PluginBoxContent,
  PluginBoxFooter,
  Button,
  Badge,
} from '@/plugin-ui/components/plugin-box';
