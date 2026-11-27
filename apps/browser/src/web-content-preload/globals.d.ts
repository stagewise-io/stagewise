import type { MessagePortProxy } from '@stagewise/karton/client';

// We simply use global variable shere in order to avoid any unnecessary overhead. We're in an isolated context anyway.
export declare global {
  interface Window {
    __CTX_SELECTION_UPDATE__:
      | ((
          element: Element,
          type: 'hover' | 'selected',
          active: boolean,
        ) => void)
      | undefined;
    __CTX_EXTRACT_INFO__:
      | ((element: Element, backendNodeId: number) => TrackedElement)
      | undefined;
    /**
     * PagesAPI karton connection - only available on stagewise://internal origin
     * This is exposed via contextBridge and is only available when the page
     * origin is "stagewise://internal". The origin check is performed securely
     * in the isolated world (preload script) and cannot be spoofed.
     */
    stagewisePagesApi?:
      | {
          portProxy: MessagePortProxy;
        }
      | undefined;
  }
}
