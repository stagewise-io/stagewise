import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';

// Simple, in-memory panel state. No persistence or timing logic.

interface PanelsContext {
  /**
   * The content of the left panel
   */
  leftPanelContent: 'chat' | 'settings' | 'plugin' | null;

  /**
   * The name of the plugin that is open
   */
  leftPanelPluginName: string | null;

  /**
   * Open the left panel to the given content
   */
  openLeftPanel: (
    content: 'chat' | 'settings' | 'plugin',
    pluginName?: string,
  ) => void;

  /**
   * Close the left panel
   */
  closeLeftPanel: () => void;

  /**
   * Toggle the left panel to the given content and close if already open
   */
  toggleLeftPanel: (
    content: 'chat' | 'settings' | 'plugin',
    pluginName?: string,
  ) => void;
}

const PanelsContext = createContext<PanelsContext>({
  leftPanelContent: null,
  leftPanelPluginName: null,
  openLeftPanel: () => null,
  closeLeftPanel: () => null,
  toggleLeftPanel: () => null,
});

export const PanelsProvider = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const [leftPanelContent, setLeftPanelContent] =
    useState<PanelsContext['leftPanelContent']>(null);
  const currentPluginNameRef = useRef<string | null>(null);

  const openLeftPanel = useCallback(
    (content: 'chat' | 'settings' | 'plugin', pluginName?: string) => {
      if (content === 'plugin') {
        currentPluginNameRef.current = pluginName ?? null;
      } else {
        currentPluginNameRef.current = null;
      }
      setLeftPanelContent(content);
      currentPluginNameRef.current = pluginName ?? null;
    },
    [],
  );

  const closeLeftPanel = useCallback(() => {
    currentPluginNameRef.current = null;
    setLeftPanelContent(null);
  }, []);

  const toggleLeftPanel = useCallback(
    (content: 'chat' | 'settings' | 'plugin', pluginName?: string) => {
      const isSameContent = leftPanelContent === content;
      const isSamePlugin =
        content === 'plugin'
          ? currentPluginNameRef.current === (pluginName ?? null)
          : true;
      if (isSameContent && isSamePlugin) {
        closeLeftPanel();
      } else {
        openLeftPanel(content, pluginName);
      }
    },
    [leftPanelContent, openLeftPanel, closeLeftPanel],
  );

  const value = useMemo(
    () => ({
      leftPanelContent,
      leftPanelPluginName: currentPluginNameRef.current,
      openLeftPanel,
      closeLeftPanel,
      toggleLeftPanel,
    }),
    [leftPanelContent, openLeftPanel, closeLeftPanel, toggleLeftPanel],
  );

  return (
    <PanelsContext.Provider value={value}>{children}</PanelsContext.Provider>
  );
};

/**
 * This hook allows to open and close panels. Some panels that are rendered are controlled by the PanelsProvider itself.
 */
export const usePanels = () => useContext(PanelsContext);
