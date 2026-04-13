import {
  useKartonConnected,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useLayoutEffect } from 'react';

type Bounds = { x: number; y: number; width: number; height: number };

export const WebContentsBoundsSyncer = () => {
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const connected = useKartonConnected();
  const updateLayout = useKartonProcedure((p) => p.browser.layout.update);
  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );

  useLayoutEffect(() => {
    // Don't set up observers if Karton isn't connected yet. Bounds fired
    // before the connection is established are silently dropped by the
    // Karton client, and lastBounds would be cached as "sent" even though
    // the backend never received them — keeping the tab invisible.
    // Re-running when `connected` becomes true ensures a fresh send.
    if (!connected) return;
    if (!activeTabId) return;

    const containerId = `dev-app-preview-container-${activeTabId}`;

    let lastBounds: Bounds | null = null;
    let lastInteractive: boolean | null = null;
    let containerElement: HTMLElement | null = null;
    let containerVisible = false;
    let lastMousePos: { x: number; y: number } | null = null;
    let cancelled = false;

    // --- Bounds update logic ---
    // Uses Karton RPC fire-and-forget (.fire) to send bounds without
    // waiting for a response — no Promise, no timeout tracking.

    const sendBoundsUpdate = () => {
      if (cancelled) return;

      if (!containerElement || !containerVisible) {
        if (lastBounds !== null) {
          updateLayout.fire(null);
          void movePanelToForeground('stagewise-ui');
          lastBounds = null;
          lastInteractive = null;
        }
        return;
      }

      const rect = containerElement.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        // Element exists but hasn't been laid out yet (common during Electron
        // startup before the compositor has settled). Retry next frame instead
        // of silently dropping the update — without this the web content never
        // receives its bounds and stays invisible until the window is resized.
        requestAnimationFrame(sendBoundsUpdate);
        return;
      }

      const newBounds: Bounds = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };

      const boundsChanged =
        !lastBounds ||
        lastBounds.x !== newBounds.x ||
        lastBounds.y !== newBounds.y ||
        lastBounds.width !== newBounds.width ||
        lastBounds.height !== newBounds.height;

      if (boundsChanged) {
        updateLayout.fire(newBounds);
        lastBounds = newBounds;
      }
    };

    // --- Hover detection logic (driven by mousemove, not polling) ---

    const checkHoverState = () => {
      if (!lastMousePos || !containerElement || !containerVisible) {
        if (lastInteractive !== null && lastInteractive !== false) {
          void movePanelToForeground('stagewise-ui');
          lastInteractive = false;
        }
        return;
      }

      const { x, y } = lastMousePos;
      const elementAtPoint = document.elementFromPoint(x, y);

      let isHovering = false;
      if (elementAtPoint) {
        const isElementSelectorOverlay =
          elementAtPoint.hasAttribute('data-element-selector-overlay') ||
          elementAtPoint.closest('[data-element-selector-overlay]') !== null;

        const isOmniboxModalActive =
          document.querySelector('[data-omnibox-modal-active]') !== null;

        if (!isElementSelectorOverlay && !isOmniboxModalActive) {
          const hoverContainer = elementAtPoint.closest(
            '[id^="dev-app-preview-container-"]',
          );
          isHovering = hoverContainer !== null;
        }
      }

      if (lastInteractive !== isHovering) {
        void movePanelToForeground(isHovering ? 'tab-content' : 'stagewise-ui');
        lastInteractive = isHovering;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastMousePos = { x: e.clientX, y: e.clientY };
      checkHoverState();
    };

    // --- Opacity check (only on element discovery and transitionend) ---

    const checkOpacity = (): boolean => {
      if (!containerElement) return false;
      const opacity = getEffectiveOpacity(containerElement);
      return opacity >= 0.5;
    };

    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'opacity') {
        const wasVisible = containerVisible;
        containerVisible = checkOpacity();
        if (wasVisible !== containerVisible) {
          sendBoundsUpdate();
        }
      }
    };

    // --- Container element tracking ---

    const resizeObserver = new ResizeObserver(sendBoundsUpdate);

    const attachContainer = (el: HTMLElement | null) => {
      if (el === containerElement) return;

      if (containerElement) {
        resizeObserver.unobserve(containerElement);
        containerElement.removeEventListener(
          'transitionend',
          handleTransitionEnd,
        );
      }

      containerElement = el;

      if (containerElement) {
        resizeObserver.observe(containerElement);
        containerElement.addEventListener('transitionend', handleTransitionEnd);
        containerVisible = checkOpacity();
      } else {
        containerVisible = false;
      }

      sendBoundsUpdate();
    };

    // Initial lookup
    attachContainer(document.getElementById(containerId));

    // --- MutationObserver: detect container appearing/disappearing (tab switch)
    // and re-evaluate hover state when exclusion attributes change. ---
    const exclusionAttributes = [
      'data-omnibox-modal-active',
      'data-element-selector-overlay',
    ];
    const mutationObserver = new MutationObserver((mutations) => {
      let containerChanged = false;
      let exclusionChanged = false;
      for (const m of mutations) {
        if (m.type === 'childList') containerChanged = true;
        if (
          m.type === 'attributes' &&
          exclusionAttributes.includes(m.attributeName!)
        ) {
          exclusionChanged = true;
        }
      }
      if (containerChanged) {
        attachContainer(document.getElementById(containerId));
      }
      if (exclusionChanged) {
        checkHoverState();
      }
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: exclusionAttributes,
    });

    // --- Window resize: catches panel resizes and actual window resizes ---
    window.addEventListener('resize', sendBoundsUpdate);

    // --- Mouse tracking for hover detection ---
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      // Cancel any in-flight requestAnimationFrame retry so it cannot fire
      // after cleanup and call into a stale Karton transport.
      cancelled = true;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', sendBoundsUpdate);
      document.removeEventListener('mousemove', handleMouseMove);
      if (containerElement) {
        containerElement.removeEventListener(
          'transitionend',
          handleTransitionEnd,
        );
      }
      // Clean up by hiding
      updateLayout.fire(null);
    };
  }, [activeTabId, connected]);

  return null;
};

function getEffectiveOpacity(element: Element | null) {
  let opacity = 1;
  let current = element;

  while (current) {
    const style = window.getComputedStyle(current);
    if (style.opacity) {
      opacity *= Number.parseFloat(style.opacity);
    }
    current = current.parentElement;
  }

  return opacity;
}
