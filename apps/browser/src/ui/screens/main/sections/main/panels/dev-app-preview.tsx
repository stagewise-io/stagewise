import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { cn } from '@/utils';
import { Layout, MainTab } from '@stagewise/karton-contract';
import { Loader2Icon } from 'lucide-react';
import { useCallback, useRef } from 'react';

export const DevAppPreviewPanel = () => {
  const workspaceStatus = useKartonState((s) => s.workspaceStatus);
  // Whenever the main website is resized, calculate the maximum size of the iframe that can fit within the toolbar and scale the iframe to that size.

  const containerRef = useRef<HTMLDivElement>(null);
  const selectorCanvasRef = useRef<HTMLDivElement | null>(null);

  const isFullScreenMode = useKartonState(
    (s) =>
      s.userExperience.activeLayout === Layout.MAIN &&
      s.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW &&
      s.userExperience.devAppPreview.isFullScreen,
  );

  const toggleFullScreen = useKartonProcedure(
    (p) =>
      p.userExperience.mainLayout.mainLayout.devAppPreview.toggleFullScreen,
  );

  const stopFullScreen = useCallback(() => {
    if (!isFullScreenMode) return;
    void toggleFullScreen();
  }, [toggleFullScreen, isFullScreenMode]);

  const appPort = useKartonState(
    (s) => s.workspace?.devAppStatus?.childProcessOwnedPorts[0],
  );

  const configuredAppPort = useKartonState((s) => s.workspace?.config?.appPort);

  const workspaceFullyOpened = useKartonState(
    (s) => s.workspaceStatus === 'open',
  );

  if (workspaceStatus === 'loading') {
    return (
      <div className="flex size-full flex-col items-center justify-center overflow-hidden rounded-xl">
        <Loader2Icon className="size-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      id="dev-app-preview-container"
      className={cn(
        'flex size-full select-none flex-col items-center justify-center overflow-hidden rounded-lg',
        isFullScreenMode &&
          'fixed inset-0 z-30 rounded-none bg-black/40 p-3 shadow-[0_0_16px_16px_rgba(0,0,0,0.2)] backdrop-blur-sm',
      )}
      onClick={() => stopFullScreen()}
    >
      <div
        id="dev-app-interactivity-area"
        className="non-interactive absolute inset-0 size-full"
      />
      {workspaceFullyOpened && (appPort || configuredAppPort) ? (
        <DOMContextSelector
          ref={selectorCanvasRef as React.RefObject<HTMLDivElement>}
        />
      ) : (
        <Loader2Icon className="size-10 animate-spin text-blue-600" />
      )}
    </div>
  );
};
