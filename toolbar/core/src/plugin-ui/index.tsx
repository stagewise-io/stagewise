import { usePlugins } from '@/hooks/use-plugins';
import type { ToolbarContext } from '@/plugin';

export type { ToolbarContext }; // Necessary to make the type available in the built package
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

export * from '@/plugin-ui/components/panel';
export * from '@/plugin-ui/components/badge';
export * from '@/plugin-ui/components/button';
