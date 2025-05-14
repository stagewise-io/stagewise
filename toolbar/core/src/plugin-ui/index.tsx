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

  // Debug the toolbar context
  console.log('useToolbar: plugins =', plugins);

  // Check if context methods are available
  const toolbarContext = plugins.toolbarContext;
  console.log('useToolbar: toolbarContext =', toolbarContext);
  console.log('useToolbar methods:', {
    sendPrompt: typeof toolbarContext.sendPrompt === 'function',
    renderToolbarAction:
      typeof toolbarContext.renderToolbarAction === 'function',
    openPanel: typeof toolbarContext.openPanel === 'function',
  });

  return toolbarContext;
};

export { ToolbarButton } from '@/components/toolbar/button';
export * as styles from '@/app.css';
