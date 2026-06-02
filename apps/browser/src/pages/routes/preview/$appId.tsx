import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sendThemeToIframe } from '@shared/iframe-theme';
import { useIframeAppBridge } from '@pages/lib/iframe-app-bridge';

interface PreviewSearch {
  agentId?: string;
  pluginId?: string;
  t?: string;
}

function readStringSearchParam(
  search: Record<string, unknown>,
  key: keyof PreviewSearch,
): string | undefined {
  const value = search[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

export const Route = createFileRoute('/preview/$appId')({
  component: PreviewPage,
  validateSearch: (search: Record<string, unknown>): PreviewSearch => ({
    agentId: readStringSearchParam(search, 'agentId'),
    pluginId: readStringSearchParam(search, 'pluginId'),
    t: readStringSearchParam(search, 't'),
  }),
  head: () => ({
    meta: [
      {
        title: 'Preview',
      },
    ],
  }),
});

function PreviewPage() {
  const { appId } = Route.useParams();
  const search = Route.useSearch();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  const src = useMemo(() => {
    const cacheBust = search.t ? `?_t=${encodeURIComponent(search.t)}` : '';

    if (search.pluginId) {
      return `app://plugins/${segment(search.pluginId)}/${segment(appId)}/index.html${cacheBust}`;
    }

    if (search.agentId) {
      return `app://agents/${segment(search.agentId)}/${segment(appId)}/index.html${cacheBust}`;
    }

    return null;
  }, [appId, search.agentId, search.pluginId, search.t]);

  useIframeAppBridge({
    iframeRef,
    agentId: search.agentId,
    appId,
    pluginId: search.pluginId,
    iframeLoaded: loadedSrc === src,
  });

  const handleIframeLoad = useCallback(() => {
    sendThemeToIframe(iframeRef.current);
    setLoadedSrc(src);
  }, [src]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => sendThemeToIframe(iframeRef.current);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!src) {
    return (
      <div className="flex size-full min-h-screen min-w-screen items-center justify-center bg-background p-6 text-center text-muted-foreground text-sm">
        Missing preview target.
      </div>
    );
  }

  return (
    <div className="flex size-full min-h-screen min-w-screen bg-background">
      <iframe
        ref={iframeRef}
        src={src}
        className="size-full border-0 bg-background"
        // Keep app:// same-origin semantics for mini-app storage and app-local
        // fetches. The parent shell is stagewise://internal, so this does not
        // make preview content same-origin with the privileged shell.
        sandbox="allow-scripts allow-same-origin"
        title={`${appId} preview`}
        referrerPolicy="origin"
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
