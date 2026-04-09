import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { Button } from '@stagewise/stage-ui/components/button';
import { XIcon } from 'lucide-react';
import { useRef, useEffect, useCallback } from 'react';

let cachedVarNames: Set<string> | null = null;

function collectThemeVariables(): Record<string, string> {
  if (!cachedVarNames) {
    cachedVarNames = new Set<string>();
    const computed = getComputedStyle(document.documentElement);
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      if (prop?.startsWith('--')) cachedVarNames.add(prop);
    }
  }

  const computed = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  cachedVarNames.forEach((name) => {
    const val = computed.getPropertyValue(name).trim();
    if (val) result[name] = val;
  });
  return result;
}

function sendThemeToIframe(iframe: HTMLIFrameElement | null) {
  if (!iframe?.contentWindow) return;
  const vars = collectThemeVariables();
  iframe.contentWindow.postMessage(
    { type: '__stagewise_theme', variables: vars },
    '*',
  );
}

export function InternalAppFrame() {
  const [openAgent] = useOpenAgent();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const dismissActiveApp = useKartonProcedure(
    (p) => p.toolbox.dismissActiveApp,
  );
  const forwardAppMessage = useKartonProcedure(
    (p) => p.toolbox.forwardAppMessage,
  );
  const clearPendingAppMessage = useKartonProcedure(
    (p) => p.toolbox.clearPendingAppMessage,
  );

  const activeApp = useKartonState((s) => {
    if (!openAgent) return null;
    return s.toolbox[openAgent]?.activeApp ?? null;
  });

  const pendingAppMessage = useKartonState((s) => {
    if (!openAgent) return null;
    return s.toolbox[openAgent]?.pendingAppMessage ?? null;
  });

  // Outbound: forward pendingAppMessage to iframe via postMessage
  useEffect(() => {
    if (!pendingAppMessage || !openAgent) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !activeApp) return;

    iframe.contentWindow.postMessage(pendingAppMessage.data, '*');
    void clearPendingAppMessage(openAgent);
  }, [pendingAppMessage, openAgent, activeApp, clearPendingAppMessage]);

  // Inbound: listen for messages from the iframe and forward to backend
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!openAgent || !activeApp) return;
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      if (event.source !== iframe.contentWindow) return;

      void forwardAppMessage(
        openAgent,
        activeApp.appId,
        activeApp.pluginId,
        event.data,
      );
    },
    [openAgent, activeApp, forwardAppMessage],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const handleIframeLoad = useCallback(() => {
    sendThemeToIframe(iframeRef.current);
  }, []);

  // Re-inject theme variables when dark mode changes
  useEffect(() => {
    if (!activeApp) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => sendThemeToIframe(iframeRef.current);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [activeApp]);

  if (!activeApp) return null;

  return (
    <div
      className="scrollbar-subtle relative shrink-0 overflow-hidden rounded-md bg-background shadow-elevation-1 ring-1 ring-derived-strong dark:bg-surface-1"
      style={{
        height: activeApp.height ?? 300,
        maxHeight: '50vh',
      }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-0 right-0 z-10"
        aria-label="Close app"
        onClick={() => {
          if (openAgent) void dismissActiveApp(openAgent);
        }}
      >
        <XIcon className="size-3.5" />
      </Button>
      <iframe
        ref={iframeRef}
        src={activeApp.src}
        className="size-full border-0"
        sandbox="allow-scripts allow-same-origin"
        title={activeApp.appId}
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
