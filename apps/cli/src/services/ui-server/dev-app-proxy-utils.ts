import { createProxyMiddleware } from 'http-proxy-middleware';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@/services/logger';
import { stagewiseAppPrefix } from './shared';
import type { WorkspaceManagerService } from '@/services/workspace-manager';

export const getProxyMiddleware = (
  logger: Logger,
  workspaceManager: WorkspaceManagerService,
) => {
  const proxy = createProxyMiddleware({
    changeOrigin: true,
    pathFilter: (pathname: string, req: IncomingMessage) => {
      // Don't proxy if:
      // - path starts with "stagewise-toolbar-app" (including agent server routes)
      // - sec-fetch-dest header equals "document"
      // - no workspace is active
      const isToolbarPath = pathname.startsWith(stagewiseAppPrefix);
      const isDocument = req.headers['sec-fetch-dest'] === 'document';
      const isWorkspaceActive =
        workspaceManager.workspace !== null &&
        workspaceManager.workspace?.configService !== null;

      if (isToolbarPath || isDocument || !isWorkspaceActive) {
        logger.debug(
          `[DevAppProxy] Not proxying ${pathname} - toolbar: ${isToolbarPath}, document: ${isDocument}, workspace loaded: ${isWorkspaceActive ? 'yes' : 'no'}`,
        );
        return false;
      }

      // Proxy all other requests
      logger.debug(`[DevAppProxy] Proxying request: ${pathname}`);
      return true;
    },
    followRedirects: false, // Don't automatically follow redirects to prevent loops
    router: () => {
      const useAutoFoundAppPort =
        workspaceManager.workspace?.configService?.get().useAutoFoundAppPort;
      const targetPort = useAutoFoundAppPort
        ? workspaceManager.workspace?.devAppStateService?.getPort()
        : workspaceManager.workspace?.configService?.get().appPort;
      if (!targetPort) {
        throw new Error(
          "[DevAppProxy] Proxy request received while no app port is configured. This shouldn't happen...",
        );
      }
      return `http://localhost:${targetPort}`;
    },
    ws: false, // we handle websocket upgrades manually because we have multiple potential websocket servers
    cookieDomainRewrite: {
      '*': '',
    },
    autoRewrite: true,
    preserveHeaderKeyCase: true,
    xfwd: true,
    on: {
      // @ts-expect-error
      error: (err, _req, res: ServerResponse<IncomingMessage>) => {
        const useAutoFoundAppPort =
          workspaceManager.workspace?.configService?.get().useAutoFoundAppPort;
        const targetPort = useAutoFoundAppPort
          ? workspaceManager.workspace?.devAppStateService?.getPort()
          : workspaceManager.workspace?.configService?.get().appPort;
        logger.error(`[DevAppProxy] Proxy error: ${err}`);
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 503;
        res.end(errorPage(targetPort ?? 0));
        // TODO: Forward this error to the UI or somewhere else so that the UI can render a proper fallback UI for this case
      },
      proxyRes: (proxyRes) => {
        applyHeaderRewrites(proxyRes);
      },
      proxyReqWs: (_proxyReq, req, _socket, _options, _head) => {
        logger.debug(`[DevAppProxy] WebSocket proxy request: ${req.url}`);
      },
    },
  });

  return proxy;
};

export type ProxyWSUpgradeHandler = ReturnType<
  typeof getProxyMiddleware
>['upgrade'];

const applyHeaderRewrites = async (proxyRes: IncomingMessage) => {
  // We patch x-frame-options to allow loading the website in an iframe
  if (
    proxyRes.headers['x-frame-options'] === 'DENY' ||
    proxyRes.headers['x-frame-options'] === 'DENY-FROM-ALL'
  ) {
    proxyRes.headers['x-frame-options'] = 'SAMEORIGIN';
  }

  // We check CSP allowed frame-ancestors
  if (
    'content-security-policy' in proxyRes.headers &&
    proxyRes.headers['content-security-policy']!.includes('frame-ancestors')
  ) {
    const csp = disassembleCSP(
      proxyRes.headers['content-security-policy'] as string,
    );
    if (
      csp.directives['frame-ancestors'] &&
      csp.directives['frame-ancestors'].length > 0
    ) {
      if (csp.directives['frame-ancestors'].includes('none')) {
        csp.directives['frame-ancestors'] = csp.directives[
          'frame-ancestors'
        ]!.filter((value) => value !== 'none');
      }
      if (
        !csp.directives['frame-ancestors'].includes("'self'") &&
        csp.directives['frame-ancestors'].length > 0
      ) {
        csp.directives['frame-ancestors'].push("'self'");
      }
      proxyRes.headers['content-security-policy'] = assembleCSP(csp);
    }
  }
};

type CSP = {
  directives: Record<string, string[]>;
};

const disassembleCSP = (csp: string): CSP => {
  const directives: Record<string, string[]> = {};
  const lines = csp.split(';');
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 1) {
      directives[parts[0]!] = parts.slice(1);
    }
  }
  return { directives };
};

const assembleCSP = (csp: CSP): string => {
  return Object.entries(csp.directives)
    .filter(([_, values]) => values.length > 0)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
};

export const errorPage = (appPort: number) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dev app not reachable</title>
  <link rel="preconnect" href="https://rsms.me/">
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css">
  <style>
  :root {
    --bg-color: #f4f4f5;
    --text-color: #09090b;
    --text-muted-color: #71717a;
  }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #09090b;
        --text-color: #fff;
        --text-muted-color: #d4d4d8;
      }
    }

    body {
      background-color: var(--bg-color);
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      margin: 0px;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: 'Inter', sans-serif;
    }

    #error-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px;
      gap: 4px;
    }

    h1 {
      color: var(--text-color);
      font-size: 24px;
      font-weight: 600;
      margin: 0px;
      text-align:center;
    }

    p {
      color: var(--text-muted-color);
      font-size: 16px;
      font-weight: 400;
      text-align:center;
      line-height: 1.5;
    }
  </style>
</head>
<body>
<div id="error-container">
  <h1>Dev App not reachable :(</h1>
  <p>Your app is not reachable under the configured port ${appPort}.<br/>Please check if the dev server of your project is running and try again.</p>
</div>
</body>
</html>`;
