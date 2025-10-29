import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { cn } from '@/utils';
import { Layout, MainTab } from '@stagewise/karton-contract';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useCallback } from 'react';

export const DevAppPreviewPanel = () => {
  const workspaceStatus = useKartonState((s) => s.workspaceStatus);
  // Whenever the main website is resized, calculate the maximum size of the iframe that can fit within the toolbar and scale the iframe to that size.

  // The size of the iframe itself is the size that the user defined.
  const size = useKartonState((s) =>
    s.userExperience.activeLayout === Layout.MAIN &&
    s.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW
      ? s.userExperience.devAppPreview.customScreenSize
      : null,
  );

  const isFullScreen = useKartonState((s) =>
    s.userExperience.activeLayout === Layout.MAIN &&
    s.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW
      ? s.userExperience.devAppPreview.isFullScreen
      : false,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const selectorCanvasRef = useRef<HTMLDivElement | null>(null);

  const updateFrameSize = useCallback(() => {
    // If there is no custom size configured, we simply set the iframe scale to 1 since it just fills up the container. Otherwise, we need to calculate the scale based on the container size and the custom size.
    if (!iframeRef.current || !containerRef.current) return;

    if (!size) {
      iframeRef.current.style.transform = 'scale(1)';
    } else {
      const container = containerRef.current;

      // Calculate ratio of container to (iframe + 16px) size (height and width). take the smallest scale and apply it, if it's smaller than 1.
      const widthRatio = container.clientWidth / (size.width + 32);
      const heightRatio =
        container.clientHeight / (size.height + (isFullScreen ? 128 : 32));
      const scale = Math.min(widthRatio, heightRatio, 1);
      iframeRef.current.style.transform = `scale(${scale})`;
    }
    if (selectorCanvasRef.current) {
      const iframeRect = iframeRef.current.getBoundingClientRect();
      selectorCanvasRef.current.style.width = `${iframeRect.width}px`;
      selectorCanvasRef.current.style.height = `${iframeRect.height}px`;
    }
  }, [size, isFullScreen]);

  useEffect(() => {
    updateFrameSize();

    const observer = containerRef.current
      ? new ResizeObserver(updateFrameSize)
      : null;
    observer?.observe(containerRef.current!);

    return () => {
      observer?.disconnect();
    };
  }, [updateFrameSize]);

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

  // If the app state change to be running (or the port changes), we should reload the iframe
  const lastAppRunningState = useRef<boolean>(false);
  const lastAppPort = useRef<number>(0);
  const appRunningState = useKartonState(
    (s) => s.workspace?.devAppStatus?.childProcessRunning ?? false,
  );
  const appPort = useKartonState(
    (s) => s.workspace?.devAppStatus?.childProcessOwnedPorts[0] ?? 0,
  );
  useEffect(() => {
    if (
      (appRunningState !== lastAppRunningState.current ||
        appPort !== lastAppPort.current) &&
      appRunningState
    ) {
      iframeRef.current?.contentWindow?.location.reload();
    }
    lastAppRunningState.current = appRunningState;
    lastAppPort.current = appPort;
  }, [appRunningState, appPort]);

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
      className={cn(
        'flex size-full select-none flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-200',
        isFullScreenMode
          ? 'fixed inset-0 z-30 rounded-none bg-black/40 p-3 shadow-[0_0_16px_16px_rgba(0,0,0,0.2)] backdrop-blur-sm'
          : 'glass-body',
      )}
      onClick={() => stopFullScreen()}
    >
      <iframe
        ref={iframeRef}
        src="/"
        title="Main user app"
        className={cn(
          'size-full overflow-hidden rounded-xl p-0',
          size && 'rounded-2xl ring-8 ring-black',
        )}
        style={{
          width: size?.width ?? '100%',
          height: size?.height ?? '100%',
        }}
        id="user-app-iframe"
      />
      <DOMContextSelector
        ref={selectorCanvasRef as React.RefObject<HTMLDivElement>}
      />
    </div>
  );
};
