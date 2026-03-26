import { session, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../logger';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';
import { getIDEFileUrl } from '@shared/ide-url';

/**
 * Protocols that the browser can natively handle and should open in a tab.
 * Other protocols (mailto:, tel:, vscode:, etc.) will be opened externally.
 */
const BROWSER_HANDLED_PROTOCOLS = new Set(['http:', 'https:', 'stagewise:']);

/**
 * Check if the browser can handle the given URL's protocol.
 * URLs with unhandled protocols should be opened externally via shell.openExternal.
 *
 * Supported protocols:
 * - http: and https: (standard web protocols)
 * - stagewise: (internal app protocol)
 * - Any custom protocol registered on the browser-content session
 *
 * @param url The URL to check
 * @returns true if the browser can handle the URL, false otherwise
 */
export function canBrowserHandleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Check if it's a protocol we handle natively
    if (BROWSER_HANDLED_PROTOCOLS.has(parsed.protocol)) {
      return true;
    }
    // Additionally check if it's a custom protocol registered on the browsing session
    const ses = session.fromPartition('persist:browser-content');
    // isProtocolRegistered checks for custom protocols registered with protocol.handle/registerXxx
    if (ses.protocol.isProtocolRegistered(parsed.protocol.slice(0, -1))) {
      return true;
    }
    return false;
  } catch {
    // Invalid URL - can't be handled
    return false;
  }
}

/**
 * Handles `stagewise://open-folder-in-ide/<absPath>?ide=<ide>` URLs.
 * Reads the directory, picks the alphabetically first file, and opens it
 * in the requested IDE. Falls back to revealing the folder in
 * Finder / Explorer if no files exist.
 */
export async function openFolderFirstFileInIde(
  url: string,
  logger: Logger,
): Promise<void> {
  const withoutScheme = url.replace('stagewise://open-folder-in-ide/', '');
  const qIdx = withoutScheme.indexOf('?');
  const folderPath = qIdx >= 0 ? withoutScheme.slice(0, qIdx) : withoutScheme;
  const params = new URLSearchParams(
    qIdx >= 0 ? withoutScheme.slice(qIdx) : '',
  );
  const ide = (params.get('ide') ?? 'other') as OpenFilesInIde;

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    if (files.length > 0) {
      const target = path.join(folderPath, files[0]);
      const ideUrl = getIDEFileUrl(target, ide);
      logger.debug(`[openFolderFirstFileInIde] Opening first file: ${target}`);
      if (ideUrl.startsWith('stagewise://reveal-file/')) {
        shell.showItemInFolder(target);
      } else {
        shell.openExternal(ideUrl);
      }
    } else {
      logger.debug(
        `[openFolderFirstFileInIde] Folder empty, revealing: ${folderPath}`,
      );
      shell.showItemInFolder(folderPath);
    }
  } catch (err) {
    logger.error(
      `[openFolderFirstFileInIde] Failed to read folder: ${folderPath}`,
      err,
    );
    shell.showItemInFolder(folderPath);
  }
}
