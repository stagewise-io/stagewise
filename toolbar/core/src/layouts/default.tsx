// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import { cn } from '@/utils';
import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';
import { ContextChipHoverProvider } from '@/hooks/use-context-chip-hover';
import { ContextChipHoverOverlay } from '@/components/context-chip-hover-overlay';
import {
  type DraggableContextType,
  DraggableProvider,
  useDraggable,
} from '@/hooks/use-draggable';
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Toolbar } from '@/toolbar';
import { usePanels } from '@/hooks/use-panels';
import { SettingsPanel } from '@/panels/settings';
import { ChatPanel } from '@/panels/chat';
import { AgentConnectivityPanel } from '@/panels/agent-connectivity';
import { usePlugins } from '@/hooks/use-plugins';

const TOOLBAR_POSITION_KEY = 'stagewise_toolbar_toolbar_position';

/**
 * Get the stored toolbar position from localStorage
 */
function getStoredToolbarPosition():
  | keyof DraggableContextType['snapAreas']
  | null {
  try {
    const stored = localStorage.getItem(TOOLBAR_POSITION_KEY);
    if (stored) {
      // Add a check to ensure the stored value is a valid snap area
      return stored as keyof DraggableContextType['snapAreas'];
    }
  } catch (error) {
    console.warn('Failed to load toolbar position from localStorage:', error);
  }
  return null;
}

/**
 * Save the toolbar position to localStorage
 */
function saveToolbarPosition(
  position: keyof DraggableContextType['snapAreas'] | null,
) {
  try {
    if (position) {
      localStorage.setItem(TOOLBAR_POSITION_KEY, position);
    }
  } catch (error) {
    console.warn('Failed to save toolbar position to localStorage:', error);
  }
}

export function DefaultLayout() {
  return (
    <ContextChipHoverProvider>
      <div className={cn('fixed inset-0 h-screen w-screen')}>
        <DOMContextSelector />
        <ContextChipHoverOverlay />
        <DraggingArea />
      </div>
    </ContextChipHoverProvider>
  );
}

/**
 * This component hosts the main area where the toolbar can be dragged around
 */
function DraggingArea() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="absolute z-50 size-full">
      <div className="absolute inset-4" ref={containerRef}>
        <DraggableProvider
          containerRef={containerRef}
          snapAreas={{
            topLeft: true,
            topRight: true,
            bottomLeft: true,
            bottomRight: true,
            topCenter: false,
            bottomCenter: false,
          }}
        >
          <ToolbarAndPanelArea />
        </DraggableProvider>
      </div>
    </div>
  );
}

/**
 * This component hosts the toolbar and panel area
 */
function ToolbarAndPanelArea() {
  const onNewSnapArea = useCallback(
    (snapArea: keyof DraggableContextType['snapAreas'] | null) => {
      saveToolbarPosition(snapArea);
    },
    [],
  );

  // Get initial position from localStorage or default to 'bottomRight'
  const initialSnapArea = useMemo(() => {
    return getStoredToolbarPosition() || 'bottomRight';
  }, []);

  const draggable = useDraggable({
    startThreshold: 10,
    initialSnapArea,
    onDragEnd: onNewSnapArea,
  });

  const clickHandleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (draggable.wasDragged) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };
    window.addEventListener('click', listener, { capture: true });
    return () => {
      window.removeEventListener('click', listener, { capture: true });
    };
  }, [draggable]);

  return (
    <div className="absolute inset-0 z-50 size-full">
      <Toolbar
        draggableHandleRef={(ref) => {
          draggable.handleRef(ref);
          draggable.draggableRef(ref);
          clickHandleRef.current = ref;
        }}
        isDragged={draggable.isDragging}
        position={draggable.position}
      />
      <PanelsArea
        position={draggable.position}
        isToolbarDragged={draggable.isDragging}
      />
    </div>
  );
}

/**
 * This component contains the panel area itself
 */
function PanelsArea({
  position,
  isToolbarDragged,
}: {
  position: {
    isTopHalf: boolean;
    isLeftHalf: boolean;
  };
  isToolbarDragged: boolean;
}) {
  const {
    isChatOpen,
    isSettingsOpen,
    isAgentConnectivityOpen,
    openPluginName,
  } = usePanels();

  const plugins = usePlugins();

  const pluginPanel = useMemo(() => {
    if (!openPluginName) {
      return null;
    }

    const plugin = plugins.plugins.find(
      (plugin) => plugin.pluginName === openPluginName,
    );
    if (!plugin) {
      return null;
    }

    const panelResult = plugin.onActionClick();

    if (panelResult) {
      return panelResult;
    }

    return null;
  }, [openPluginName, plugins]);

  return (
    <div
      className={cn(
        'absolute z-0 flex h-full w-96 max-w-[calc(100%-48px)] transition-all duration-500 ease-spring',
        position.isLeftHalf ? 'left-12' : 'right-12',
        position.isTopHalf ? 'top-0 flex-col' : 'bottom-0 flex-col-reverse',
        isToolbarDragged
          ? 'scale-95 opacity-50 blur-md brightness-90'
          : 'opacity-100',
      )}
    >
      <PanelWrapper position={position} isOpen={isChatOpen}>
        <ChatPanel />
      </PanelWrapper>

      <PanelWrapper position={position} isOpen={isSettingsOpen}>
        <SettingsPanel />
      </PanelWrapper>

      <PanelWrapper position={position} isOpen={isAgentConnectivityOpen}>
        <AgentConnectivityPanel />
      </PanelWrapper>

      <PanelWrapper position={position} isOpen={!!pluginPanel}>
        {pluginPanel}
      </PanelWrapper>
    </div>
  );
}

function PanelWrapper({
  children,
  position,
  isOpen,
}: {
  children: React.ReactNode;
  position: {
    isTopHalf: boolean;
    isLeftHalf: boolean;
  };
  isOpen: boolean;
}) {
  // if the panel is not open, we wait until the exit animation is complete and then stop rendering it
  const [shouldRender, setShouldRender] = useState(isOpen);
  const stopRenderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debug logging for AgentConnectivityPanel specifically
  const isAgentPanel =
    children &&
    typeof children === 'object' &&
    'type' in children &&
    typeof children.type === 'function' &&
    children.type.name === 'AgentConnectivityPanel';

  useEffect(() => {
    if (isAgentPanel) {
      console.debug('[PanelWrapper] AgentConnectivityPanel isOpen changed:', {
        isOpen,
        shouldRender,
        hasTimeout: !!stopRenderTimeoutRef.current,
      });
    }

    if (!isOpen) {
      stopRenderTimeoutRef.current = setTimeout(() => {
        if (isAgentPanel) {
          console.debug(
            '[PanelWrapper] AgentConnectivityPanel setting shouldRender to false after timeout',
          );
        }
        setShouldRender(false);
      }, 500);
    } else {
      if (isAgentPanel) {
        console.debug(
          '[PanelWrapper] AgentConnectivityPanel setting shouldRender to true immediately',
        );
      }
      setShouldRender(true);
      if (stopRenderTimeoutRef.current) {
        clearTimeout(stopRenderTimeoutRef.current);
        stopRenderTimeoutRef.current = null;
      }
    }
  }, [isOpen, isAgentPanel]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (stopRenderTimeoutRef.current) {
        clearTimeout(stopRenderTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        'h-[calc-size(auto,size)] transition-all duration-150 ease-out',
        position.isTopHalf ? 'mb-3' : 'mt-3',
        position.isLeftHalf ? 'origin-left' : 'origin-right',
        isOpen ? '' : 'mt-0 mb-0 h-0 scale-0 opacity-0 blur-md',
      )}
    >
      {shouldRender && children}
    </div>
  );
}
