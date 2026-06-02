import { useCallback, useEffect, type RefObject } from 'react';
import { useKartonProcedure, useKartonState } from '@pages/hooks/use-karton';

export function useIframeAppBridge({
  iframeRef,
  agentId,
  appId,
  pluginId,
  iframeLoaded,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  agentId?: string;
  appId: string;
  pluginId?: string;
  iframeLoaded: boolean;
}) {
  const forwardAppMessage = useKartonProcedure((p) => p.forwardAppMessage);
  const clearPendingAppMessage = useKartonProcedure(
    (p) => p.clearPendingAppMessage,
  );

  const pendingAppMessage = useKartonState((s) => {
    if (!agentId) return null;
    return s.pendingAppMessagesByAgentInstanceId[agentId] ?? null;
  });

  useEffect(() => {
    if (!pendingAppMessage || !agentId || !iframeLoaded) return;
    if (
      pendingAppMessage.appId !== appId ||
      pendingAppMessage.pluginId !== pluginId
    )
      return;

    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    iframe.contentWindow.postMessage(pendingAppMessage.data, '*');
    void clearPendingAppMessage(agentId);
  }, [
    pendingAppMessage,
    agentId,
    appId,
    pluginId,
    iframeRef,
    iframeLoaded,
    clearPendingAppMessage,
  ]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!agentId) return;
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      if (event.source !== iframe.contentWindow) return;

      void forwardAppMessage(agentId, appId, pluginId, event.data);
    },
    [agentId, appId, pluginId, iframeRef, forwardAppMessage],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);
}
