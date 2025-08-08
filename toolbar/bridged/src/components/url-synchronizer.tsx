import { useEffect, useRef } from 'react';

interface UrlSynchronizerProps {
  appPort?: number;
  urlSyncConfig?: {
    enableLocationPatching?: boolean;
    navigationTimeout?: number;
    debounceDelay?: number;
  };
}

interface NavigationState {
  isNavigating: boolean;
  source: 'parent' | 'iframe' | null;
  navigationId: string | null;
  timestamp: number;
}

export function UrlSynchronizer({
  appPort,
  urlSyncConfig,
}: UrlSynchronizerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const navigationState = useRef<NavigationState>({
    isNavigating: false,
    source: null,
    navigationId: null,
    timestamp: 0,
  });
  const navigationQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const iframe = document.getElementById(
      'user-app-iframe',
    ) as HTMLIFrameElement;
    if (!iframe) return;

    iframeRef.current = iframe;

    // Generate unique navigation ID
    const generateNavigationId = () =>
      `nav-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Lock navigation with better tracking
    const lockNavigation = (source: 'parent' | 'iframe'): string => {
      const navId = generateNavigationId();
      navigationState.current = {
        isNavigating: true,
        source,
        navigationId: navId,
        timestamp: Date.now(),
      };
      return navId;
    };

    // Unlock navigation with validation
    const unlockNavigation = (navId: string) => {
      if (navigationState.current.navigationId === navId) {
        navigationState.current = {
          isNavigating: false,
          source: null,
          navigationId: null,
          timestamp: 0,
        };
      }
    };

    // Check if navigation is locked by another source
    const isNavigationLocked = (source: 'parent' | 'iframe'): boolean => {
      const state = navigationState.current;
      if (!state.isNavigating) return false;

      // Allow same source to navigate
      if (state.source === source) return false;

      // Check if lock is stale (using configured timeout or default 500ms)
      const timeout = urlSyncConfig?.navigationTimeout || 500;
      const isStale = Date.now() - state.timestamp > timeout;
      if (isStale) {
        // Reset stale lock
        navigationState.current = {
          isNavigating: false,
          source: null,
          navigationId: null,
          timestamp: 0,
        };
        return false;
      }

      return true;
    };

    // Function to sync parent URL to iframe
    const syncParentToIframe = async () => {
      if (isNavigationLocked('parent')) return;

      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) return;

      const parentPath = window.location.pathname;
      const parentSearch = window.location.search;
      const parentHash = window.location.hash;

      const newUrl = parentPath + parentSearch + parentHash;

      try {
        // Skip sync if iframe is still on about:blank
        if (iframeWindow.location.href === 'about:blank') {
          return;
        }

        if (
          iframeWindow.location.pathname +
            iframeWindow.location.search +
            iframeWindow.location.hash !==
          newUrl
        ) {
          const navId = lockNavigation('parent');

          // Queue navigation to prevent concurrent updates
          navigationQueue.current = navigationQueue.current.then(async () => {
            try {
              // Use pushState/replaceState to avoid full page reloads
              // This prevents infinite redirect loops with 307 responses
              if (iframeWindow.history?.replaceState) {
                iframeWindow.history.replaceState(null, '', newUrl);
              } else {
                // Fallback to location.href only if history API is not available
                iframeWindow.location.href = newUrl;
              }
              // Wait for navigation to complete
              await new Promise((resolve) => setTimeout(resolve, 150));
            } finally {
              unlockNavigation(navId);
            }
          });

          await navigationQueue.current;
        }
      } catch (e) {
        // Cross-origin access might fail
        if (e instanceof DOMException && e.name === 'SecurityError') {
          console.warn('Cannot sync to cross-origin iframe:', newUrl);
        } else {
          console.error('Failed to sync URL to iframe:', e);
        }
      }
    };

    // Function to sync iframe URL to parent
    const syncIframeToParent = async () => {
      console.debug('syncIframeToParent called');

      if (isNavigationLocked('iframe')) {
        console.debug('Navigation locked by iframe, skipping sync');
        return;
      }

      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        console.debug('No iframe contentWindow');
        return;
      }

      try {
        const iframePath = iframeWindow.location.pathname;
        const iframeSearch = iframeWindow.location.search;
        const iframeHash = iframeWindow.location.hash;

        const newUrl = iframePath + iframeSearch + iframeHash;
        const currentParentUrl =
          window.location.pathname +
          window.location.search +
          window.location.hash;

        console.debug('Comparing URLs:', { currentParentUrl, newUrl });

        if (currentParentUrl !== newUrl) {
          console.debug('URLs differ, syncing parent to:', newUrl);
          const navId = lockNavigation('iframe');

          // Queue navigation to prevent concurrent updates
          navigationQueue.current = navigationQueue.current.then(async () => {
            try {
              window.history.replaceState(null, '', newUrl);
              console.debug('Parent URL updated to:', newUrl);
              // Wait for state update to propagate
              await new Promise((resolve) => setTimeout(resolve, 50));
            } finally {
              unlockNavigation(navId);
            }
          });

          await navigationQueue.current;
        } else {
          console.debug('URLs already in sync');
        }
      } catch (e) {
        // Cross-origin access might fail
        if (e instanceof DOMException && e.name === 'SecurityError') {
          console.warn('Cannot read cross-origin iframe URL');
        } else {
          console.error('Failed to sync URL from iframe:', e);
        }
      }
    };

    // Initial sync from parent to iframe on load
    const handleIframeLoad = () => {
      syncParentToIframe();

      // Monkey-patch the iframe's location object if enabled and appPort is provided
      const shouldPatchLocation =
        urlSyncConfig?.enableLocationPatching !== false;
      if (appPort && shouldPatchLocation) {
        try {
          monkeyPatchLocation(iframe.contentWindow!, appPort);
        } catch (e) {
          console.warn('Failed to patch iframe location object:', e);
        }
      }
    };

    // Listen for parent window navigation
    const handlePopState = () => {
      syncParentToIframe();
    };

    // Debounce function to prevent rapid firing
    const debounce = <T extends (...args: any[]) => any>(
      func: T,
      wait: number,
    ): ((...args: Parameters<T>) => void) => {
      let timeout: NodeJS.Timeout;
      return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
      };
    };

    // Monitor iframe navigation with debouncing
    let lastIframeUrl = iframe.contentWindow?.location.href || '';
    const checkIframeNavigation = debounce(() => {
      try {
        const currentUrl = iframe.contentWindow?.location.href;
        if (currentUrl && currentUrl !== lastIframeUrl) {
          console.debug(
            'Iframe navigation detected:',
            lastIframeUrl,
            '->',
            currentUrl,
          );
          lastIframeUrl = currentUrl;
          syncIframeToParent();
        }
      } catch (e) {
        // Cross-origin access might fail
        if (e instanceof DOMException && e.name === 'SecurityError') {
          console.warn(
            'Cross-origin navigation detected, synchronization paused',
          );
        }
      }
    }, urlSyncConfig?.debounceDelay || 50);

    // Set up event listeners
    iframe.addEventListener('load', handleIframeLoad);
    window.addEventListener('popstate', handlePopState);

    // Additional iframe navigation detection
    const setupIframeNavigationListeners = () => {
      try {
        const iframeWindow = iframe.contentWindow;
        if (!iframeWindow) return;

        // Listen for hashchange events in iframe
        iframeWindow.addEventListener('hashchange', () => {
          console.debug('Iframe hashchange detected');
          checkIframeNavigation();
        });

        // Listen for popstate events in iframe
        iframeWindow.addEventListener('popstate', () => {
          console.debug('Iframe popstate detected');
          checkIframeNavigation();
        });

        // Override pushState and replaceState in iframe
        const originalPushState = iframeWindow.history.pushState;
        const originalReplaceState = iframeWindow.history.replaceState;

        iframeWindow.history.pushState = function (...args) {
          const result = originalPushState.apply(this, args);
          console.debug('Iframe pushState detected');
          checkIframeNavigation();
          return result;
        };

        iframeWindow.history.replaceState = function (...args) {
          const result = originalReplaceState.apply(this, args);
          console.debug('Iframe replaceState detected');
          checkIframeNavigation();
          return result;
        };
      } catch (e) {
        console.debug('Failed to setup iframe navigation listeners:', e);
      }
    };

    // Setup listeners on iframe load
    iframe.addEventListener('load', setupIframeNavigationListeners);

    // Try to use MutationObserver if available, otherwise fall back to polling
    let cleanupNavMonitoring: (() => void) | null = null;

    try {
      // Attempt to observe navigation changes using MutationObserver
      if (iframe.contentWindow && iframe.contentDocument) {
        // Use the parent window's MutationObserver constructor
        const MutationObserverConstructor =
          window.MutationObserver || (window as any).WebKitMutationObserver;

        if (MutationObserverConstructor) {
          const observer = new MutationObserverConstructor(() => {
            checkIframeNavigation();
          });

          // Observe changes to the document that might indicate navigation
          observer.observe(iframe.contentDocument.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href'],
          });

          cleanupNavMonitoring = () => observer.disconnect();
        }
      }
    } catch (e) {
      // If MutationObserver setup fails, we'll fall back to polling
      console.debug('MutationObserver setup failed, using polling:', e);
    }

    // Fall back to polling if MutationObserver is not available or fails
    const intervalId = !cleanupNavMonitoring
      ? setInterval(checkIframeNavigation, 100)
      : null;

    // Initial sync
    if (iframe.contentWindow) {
      handleIframeLoad();
      setupIframeNavigationListeners();
    }

    return () => {
      iframe.removeEventListener('load', handleIframeLoad);
      iframe.removeEventListener('load', setupIframeNavigationListeners);
      window.removeEventListener('popstate', handlePopState);
      if (intervalId) clearInterval(intervalId);
      if (cleanupNavMonitoring) cleanupNavMonitoring();
    };
  }, [appPort, urlSyncConfig]);

  return null;
}

// Monkey-patch the iframe's location object to show a different port
function monkeyPatchLocation(iframeWindow: Window, appPort: number) {
  try {
    const originalLocation = iframeWindow.location;
    const descriptor = Object.getOwnPropertyDescriptor(
      iframeWindow,
      'location',
    );

    if (!descriptor || descriptor.configurable === false) {
      // Try alternative approach
      patchLocationProperties(iframeWindow, appPort);
      return;
    }

    // Create a proxy for the location object
    const locationProxy = new Proxy(originalLocation, {
      get(target, prop) {
        if (prop === 'port') {
          return String(appPort);
        }
        if (prop === 'host') {
          return `${target.hostname}:${appPort}`;
        }
        if (prop === 'origin') {
          return `${target.protocol}//${target.hostname}:${appPort}`;
        }
        if (prop === 'href') {
          const url = new URL(target.href);
          url.port = String(appPort);
          return url.toString();
        }
        return target[prop as keyof Location];
      },
    });

    Object.defineProperty(iframeWindow, 'location', {
      get() {
        return locationProxy;
      },
      configurable: true,
    });
  } catch (e) {
    console.error('Failed to monkey-patch location:', e);
    // Fallback to property patching
    patchLocationProperties(iframeWindow, appPort);
  }
}

// Alternative approach to patch individual properties
function patchLocationProperties(iframeWindow: Window, appPort: number) {
  try {
    const originalLocation = iframeWindow.location;

    // Helper to create getter
    const createGetter = (
      originalGetter: () => any,
      modifier: (value: any) => any,
    ) => {
      return function (this: Location) {
        const value = originalGetter.call(this);
        return modifier(value);
      };
    };

    // Patch port
    Object.defineProperty(originalLocation, 'port', {
      get: () => String(appPort),
      configurable: true,
    });

    // Patch host
    const originalHostDescriptor = Object.getOwnPropertyDescriptor(
      originalLocation,
      'host',
    );
    if (originalHostDescriptor?.get) {
      Object.defineProperty(originalLocation, 'host', {
        get: createGetter(
          originalHostDescriptor.get,
          () => `${originalLocation.hostname}:${appPort}`,
        ),
        configurable: true,
      });
    }

    // Patch origin
    const originalOriginDescriptor = Object.getOwnPropertyDescriptor(
      originalLocation,
      'origin',
    );
    if (originalOriginDescriptor?.get) {
      Object.defineProperty(originalLocation, 'origin', {
        get: createGetter(
          originalOriginDescriptor.get,
          () =>
            `${originalLocation.protocol}//${originalLocation.hostname}:${appPort}`,
        ),
        configurable: true,
      });
    }

    // Patch href
    const originalHrefDescriptor = Object.getOwnPropertyDescriptor(
      originalLocation,
      'href',
    );
    if (originalHrefDescriptor?.get) {
      Object.defineProperty(originalLocation, 'href', {
        get: createGetter(originalHrefDescriptor.get, (href: string) => {
          const url = new URL(href);
          url.port = String(appPort);
          return url.toString();
        }),
        configurable: true,
      });
    }
  } catch (e) {
    console.error('Failed to patch location properties:', e);
  }
}
