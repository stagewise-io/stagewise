import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';
import { useKartonState } from '@/hooks/use-karton';
import { Layout, MainTab } from '@stagewise/karton-contract';
import { useEffect, useRef, useCallback } from 'react';

export const DevAppPreviewPanel = () => {
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

  const updateFrameSize = useCallback(() => {
    // If there is no custom size configured, we simply< set the iframe scale to 1 since it just fills up the container. Otherwise, we need to calculate the scale based on the container size and the custom size.
    if (!iframeRef.current || !containerRef.current) return;

    if (!size) {
      iframeRef.current.style.transform = 'scale(1)';
    } else {
      const container = containerRef.current;

      // Calculate ratio of container to (iframe + 16px) size (height and width). take the smallest scale and apply it, if it's smaller than 1.
      const widthRatio = container.clientWidth / (size.width + 32);
      const heightRatio =
        container.clientHeight / (size.height + (isFullScreen ? 96 : 32));
      const scale = Math.min(widthRatio, heightRatio);
      if (scale < 1) {
        iframeRef.current.style.transform = `scale(${scale})`;
      }
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

  return (
    <div
      ref={containerRef}
      className="flex size-full flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-200"
    >
      <iframe
        ref={iframeRef}
        src="/"
        title="Main user app"
        className="size-full p-0"
        style={{
          width: size?.width ?? '100%',
          height: size?.height ?? '100%',
          border: size ? '12px solid black' : 'none',
          borderRadius: size ? '32px' : '0px',
        }}
        id="user-app-iframe"
      />
      <DOMContextSelector />
    </div>
  );
};
