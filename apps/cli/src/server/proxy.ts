import { createProxyMiddleware } from 'http-proxy-middleware';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { configResolver } from '../config';
import { errorPage } from './error-page';
import { log } from '../utils/logger';
import { applyHeaderRewrites } from './proxy-utils/headers-rewrites';

export const proxy = createProxyMiddleware({
  changeOrigin: true,
  secure: false, // Allow self-signed certificates
  pathFilter: (pathname: string, req: IncomingMessage) => {
    // Don't proxy if:
    // - path starts with "stagewise-toolbar-app" (including agent server routes)
    // - sec-fetch-dest header equals "document"
    const isToolbarPath = pathname.startsWith('/stagewise-toolbar-app');
    const isDocument = req.headers['sec-fetch-dest'] === 'document';

    if (isToolbarPath || isDocument) {
      log.debug(
        `Not proxying ${pathname} - toolbar: ${isToolbarPath}, document: ${isDocument}`,
      );
      return false;
    }

    // Proxy all other requests
    log.debug(`Proxying request: ${pathname}`);
    return true;
  },
  followRedirects: false, // Don't automatically follow redirects to prevent loops
  router: () => {
    const config = configResolver.getConfig();
    // Use HTTPS if configured, otherwise HTTP
    const protocol = config.appHttps ? 'https' : 'http';
    return `${protocol}://localhost:${config.appPort}`;
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
      log.error(`Proxy error: ${err.message}`);
      const config = configResolver.getConfig();
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end(errorPage(config.appPort));
    },
    proxyRes: (proxyRes) => {
      applyHeaderRewrites(proxyRes);
    },
    proxyReqWs: (_proxyReq, req, _socket, _options, _head) => {
      log.debug(`WebSocket proxy request: ${req.url}`);
    },
  },
});
