import { net, session } from 'electron';
import type { Logger } from './logger';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

declare const PAGES_VITE_DEV_SERVER_URL: string;
declare const PAGES_VITE_NAME: string;

/**
 * Service responsible for registering the custom protocol handler for the pages renderer.
 * This service registers the "stagewise" protocol handler on the default browsing session
 * used by tabs, enabling client-side routing and asset serving.
 */
export class PagesService {
  private logger: Logger;

  private constructor(logger: Logger) {
    this.logger = logger;
  }

  public static async create(logger: Logger): Promise<PagesService> {
    const instance = new PagesService(logger);
    await instance.initialize();
    logger.debug('[PagesService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    // Get the default browsing session used by tabs (same partition as tab-controller)
    const ses = session.fromPartition('persist:browser-content');

    ses.protocol.handle('stagewise', (request) => {
      this.logger.debug(
        `[PagesService] Custom protocol request received: ${request.url}`,
      );

      // Normalize the URL - ensure it has an origin (hostname)
      // "stagewise://" needs an origin to be valid, default to "internal"
      let normalizedRequestUrl = request.url;
      if (
        normalizedRequestUrl === 'stagewise://' ||
        normalizedRequestUrl.endsWith('://')
      ) {
        normalizedRequestUrl = 'stagewise://internal/';
      }

      // Parse URL and check if origin is "internal"
      let url: URL;
      try {
        url = new URL(normalizedRequestUrl);
      } catch (err) {
        this.logger.error(
          `[PagesService] Failed to parse URL: ${err}. Redirecting to not-found page.`,
        );
        // Redirect to not-found page for invalid URLs
        return Response.redirect('stagewise://internal/not-found', 302);
      }

      // Only serve the app if the origin (hostname) is "internal"
      if (url.hostname !== 'internal') {
        this.logger.debug(
          `[PagesService] Redirecting request with origin: ${url.hostname} to not-found page. Only "internal" origin is allowed.`,
        );
        // Redirect to not-found page
        return Response.redirect('stagewise://internal/not-found', 302);
      }

      // In dev mode, forward all requests to the dev server
      if (PAGES_VITE_DEV_SERVER_URL) {
        const devServerUrl = `${PAGES_VITE_DEV_SERVER_URL}${url.pathname}${url.search}`;
        return net.fetch(devServerUrl);
      }

      // In production, serve files if they exist, otherwise serve index.html
      const requestPath = url.pathname || '/';

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const pagesBaseDir = path.resolve(
        __dirname,
        `../pages/${PAGES_VITE_NAME}`,
      );

      // If path is empty or just "/", serve index.html
      if (!requestPath || requestPath === '/') {
        const indexPath = path.resolve(pagesBaseDir, 'index.html');
        const normalizedIndexPath = indexPath.replace(/\\/g, '/');
        const fileUrl = `file:///${normalizedIndexPath}`;
        return net.fetch(fileUrl);
      }

      // Remove leading slash and resolve the file path
      const normalizedPath = requestPath.startsWith('/')
        ? requestPath.slice(1)
        : requestPath;
      const filePath = path.resolve(pagesBaseDir, normalizedPath);

      // If file exists, serve it; otherwise serve index.html for client-side routing
      const targetPath = existsSync(filePath)
        ? filePath
        : path.resolve(pagesBaseDir, 'index.html');
      const normalizedTargetPath = targetPath.replace(/\\/g, '/');
      const fileUrl = `file:///${normalizedTargetPath}`;
      return net.fetch(fileUrl);
    });

    this.logger.debug(
      '[PagesService] Registered stagewise protocol handler for browsing session',
    );
  }
}
