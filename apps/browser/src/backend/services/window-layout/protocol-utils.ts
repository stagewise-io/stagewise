import { session } from 'electron';

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
