import { net, type Session } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getAgentAppsDir, getPluginsPath } from '@/utils/paths';
import { inferMimeType } from '@shared/mime-utils';
import type { Logger } from './logger';

function decodePathParts(pathname: string): string[] | null {
  try {
    return pathname
      .replace(/^\//, '')
      .split('/')
      .map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}

function isSafePathPart(part: string): boolean {
  return (
    part.length > 0 &&
    part !== '.' &&
    part !== '..' &&
    !part.includes('/') &&
    !part.includes('\\') &&
    !part.includes('\0')
  );
}

function isNavigationRequest(request: Request): boolean {
  const secFetchDest = request.headers.get('Sec-Fetch-Dest');
  const secFetchMode = request.headers.get('Sec-Fetch-Mode');
  return (
    secFetchMode === 'navigate' ||
    secFetchDest === 'iframe' ||
    secFetchDest === 'document'
  );
}

function getAppIdentity(url: URL): {
  namespace: string;
  entityId: string;
  appId: string;
} | null {
  const pathParts = decodePathParts(url.pathname);
  if (!pathParts) return null;

  const namespace = url.hostname;
  const entityId = pathParts[0];
  const appId = pathParts[1];

  if (
    (namespace !== 'agents' && namespace !== 'plugins') ||
    !entityId ||
    !appId ||
    !isSafePathPart(entityId) ||
    !isSafePathPart(appId)
  ) {
    return null;
  }

  return { namespace, entityId, appId };
}

function isSameAppReferer(
  referer: string,
  targetIdentity: NonNullable<ReturnType<typeof getAppIdentity>>,
): boolean {
  try {
    const refererUrl = new URL(referer);
    if (refererUrl.protocol === 'stagewise:') return true;
    if (refererUrl.protocol !== 'app:') return false;

    const refererIdentity = getAppIdentity(refererUrl);
    return (
      refererIdentity?.namespace === targetIdentity.namespace &&
      refererIdentity.entityId === targetIdentity.entityId &&
      refererIdentity.appId === targetIdentity.appId
    );
  } catch {
    return false;
  }
}

function isTrustedAppProtocolRequest(
  request: Request,
  targetIdentity: NonNullable<ReturnType<typeof getAppIdentity>>,
): boolean {
  const isNavigation = isNavigationRequest(request);
  const referer = request.headers.get('Referer');
  const hasTrustedReferer = referer
    ? isSameAppReferer(referer, targetIdentity)
    : false;

  const secFetchSite = request.headers.get('Sec-Fetch-Site');
  if (secFetchSite === 'cross-site' && !isNavigation && !hasTrustedReferer)
    return false;

  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null') {
    try {
      const originProtocol = new URL(origin).protocol;
      if (originProtocol === 'stagewise:') return true;
      if (originProtocol !== 'app:') return false;
      return hasTrustedReferer;
    } catch {
      return false;
    }
  }

  if (referer) return hasTrustedReferer;

  // Electron custom-protocol iframe navigations can omit Fetch Metadata,
  // Origin, and Referer entirely. Permit requests with no initiator context;
  // cross-app script fetches still carry app:// Origin/Referer and are checked
  // above against the target app identity.
  return true;
}

/**
 * Register the app:// protocol handler on a specific Electron session.
 *
 * URL format:
 *   app://agents/{agentId}/{appId}/{relativePath}
 *   app://plugins/{pluginId}/{appId}/{relativePath}
 */
export function registerAppProtocol(
  targetSession: Session,
  logger: Logger,
): void {
  targetSession.protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      const targetIdentity = getAppIdentity(url);
      if (!targetIdentity)
        return new Response('Invalid app URL', { status: 400 });

      if (!isTrustedAppProtocolRequest(request, targetIdentity)) {
        return new Response('Forbidden', { status: 403 });
      }

      const pathParts = decodePathParts(url.pathname);
      if (!pathParts) return new Response('Invalid app URL', { status: 400 });

      const { namespace, entityId, appId } = targetIdentity;
      const relativePathParts = pathParts.slice(2);

      if (
        !entityId ||
        !appId ||
        relativePathParts.length === 0 ||
        !isSafePathPart(entityId) ||
        !isSafePathPart(appId) ||
        relativePathParts.some((part) => !isSafePathPart(part))
      ) {
        return new Response('Invalid app URL', { status: 400 });
      }

      let appDir: string;
      if (namespace === 'agents') {
        appDir = path.resolve(getAgentAppsDir(entityId), appId);
      } else if (namespace === 'plugins') {
        appDir = path.resolve(getPluginsPath(), entityId, 'apps', appId);
      } else return new Response('Unknown app namespace', { status: 400 });

      const relativePath = relativePathParts.join('/');
      const requestedPath = path.resolve(appDir, ...relativePathParts);
      if (!requestedPath.startsWith(appDir + path.sep))
        return new Response('Path traversal denied', { status: 400 });

      let realAppDir: string;
      let realRequestedPath: string;
      try {
        [realAppDir, realRequestedPath] = await Promise.all([
          fs.realpath(appDir),
          fs.realpath(requestedPath),
        ]);
      } catch {
        return new Response('File not found', { status: 404 });
      }

      if (!realRequestedPath.startsWith(realAppDir + path.sep))
        return new Response('Path traversal denied', { status: 400 });

      const mime = inferMimeType(relativePath);
      const responseHeaders = {
        'Content-Type': mime,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'same-origin',
      };
      const fileUrl = pathToFileURL(realRequestedPath).href;
      const fileResponse = await net.fetch(fileUrl);

      if (mime === 'text/html') {
        const html = await fileResponse.text();
        const snippet =
          '<style>*,*::before,*::after{scrollbar-width:thin;scrollbar-color:var(--color-surface-2,rgba(255,255,255,.15)) transparent}</style>';
        const patched = html.includes('</head>')
          ? html.replace('</head>', `${snippet}</head>`)
          : `${snippet}${html}`;
        return new Response(patched, {
          status: 200,
          headers: responseHeaders,
        });
      }

      return new Response(fileResponse.body, {
        status: 200,
        headers: responseHeaders,
      });
    } catch (err) {
      logger.error('[AppProtocol] app protocol error', {
        error: err,
        url: request.url,
      });
      return new Response('Internal error', { status: 500 });
    }
  });
}
