import {
  useKartonConnected,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useLayoutEffect, useRef } from 'react';
import { createRafResizeObserver } from '@ui/utils/resize-observer';

type Bounds = { x: number; y: number; width: number; height: number };

export const WebContentsBoundsSyncer = () => {
  const activeTabId = useKartonState((s) => s.contentTabs.activeTabId);
  const appScreenMode = useKartonState((s) => s.appScreen.mode);
  const connected = useKartonConnected();
  const updateLayout = useKartonProcedure((p) => p.browser.layout.update);
  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );
  const uiZoomPercentage = useKartonState(
    (s) => s.preferences.general.uiZoomPercentage,
  );
  const uiZoomPercentageRef = useRef(uiZoomPercentage);
  const sendBoundsUpdateRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    // Don't set up observers if Karton isn't connected yet. Bounds fired
    // before the connection is established are silently dropped by the
    // Karton client, and lastBounds would be cached as "sent" even though
    // the backend never received them — keeping the tab invisible.
    // Re-running when `connected` becomes true ensures a fresh send.
    if (!connected) return;

    if (appScreenMode !== 'main' || !activeTabId) {
      updateLayout.fire(null);
      void movePanelToForeground('stagewise-ui');
      return;
    }

    const containerId = `dev-app-preview-container-${activeTabId}`;

    let lastBounds: Bounds | null = null;
    let lastInteractive: boolean | null = null;
    let containerElement: HTMLElement | null = null;
    let containerVisible = false;
    let lastMousePos: { x: number; y: number } | null = null;
    let cancelled = false;
    let pendingFrameId: number | null = null;

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
      const uiZoomFactor = uiZoomPercentageRef.current / 100;

      if (rect.width <= 0 || rect.height <= 0) {
        // Element exists but hasn't been laid out yet (common during Electron
        // startup before the compositor has settled). Retry next frame instead
        // of silently dropping the update — without this the web content never
        // receives its bounds and stays invisible until the window is resized.
        // De-duplicate: if a retry is already pending, don't queue another one.
        if (pendingFrameId === null) {
          pendingFrameId = requestAnimationFrame(() => {
            pendingFrameId = null;
            sendBoundsUpdate();
          });
        }
        return;
      }

      // Electron WebContentsView bounds are in native window coordinates,
      // while getBoundingClientRect() is reported in renderer CSS pixels.
      // With UI zoom now applied via webContents.setZoomFactor(), convert
      // the CSS-pixel rect back to visual/native coordinates before sending
      // it to the backend.
      const newBounds: Bounds = {
        x: Math.round(rect.x * uiZoomFactor),
        y: Math.round(rect.y * uiZoomFactor),
        width: Math.round(rect.width * uiZoomFactor),
        height: Math.round(rect.height * uiZoomFactor),
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

    sendBoundsUpdateRef.current = sendBoundsUpdate;

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
        const isCommandCenterModalActive =
          document.querySelector('[data-command-center-modal-active]') !== null;

        if (
          !isElementSelectorOverlay &&
          !isOmniboxModalActive &&
          !isCommandCenterModalActive
        ) {
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

    const { observer: resizeObserver, disconnect: disconnectResizeObserver } =
      createRafResizeObserver(sendBoundsUpdate);

    // Track all elements we observe so we can unobserve on detach.
    const observedElements: Element[] = [];
    const observeEl = (el: Element) => {
      resizeObserver.observe(el);
      observedElements.push(el);
    };
    const unobserveAll = () => {
      for (const el of observedElements) {
        resizeObserver.unobserve(el);
      }
      observedElements.length = 0;
    };

    const attachContainer = (el: HTMLElement | null) => {
      if (el === null && containerElement === null) return;

      unobserveAll();

      if (containerElement) {
        containerElement.removeEventListener(
          'transitionend',
          handleTransitionEnd,
        );
      }

      containerElement = el;

      if (containerElement) {
        observeEl(containerElement);
        containerElement.addEventListener('transitionend', handleTransitionEnd);

        // Also observe all panels of every ancestor resizable panel group
        // (i.e. the container's panel AND its sibling panels). When a
        // sibling panel resizes while the container's own panel is pinned
        // at its min size (e.g. dragging the chat handle further shrinks
        // the file tree), the container MOVES without its own dimensions
        // changing — neither it nor any ancestor fires a ResizeObserver
        // event. Any redistribution that moves the container necessarily
        // resizes at least one panel in some ancestor group, so observing
        // the sibling panels catches every such case and triggers a
        // bounds re-check.
        let current: HTMLElement | null = containerElement.parentElement;
        while (current) {
          if (current.dataset.slot === 'resizable-panel-group') {
            current
              .querySelectorAll(':scope > [data-slot="resizable-panel"]')
              .forEach(observeEl);
          }
          current = current.parentElement;
        }

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
      'data-command-center-modal-active',
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
      if (pendingFrameId !== null) {
        cancelAnimationFrame(pendingFrameId);
        pendingFrameId = null;
      }
      unobserveAll();
      disconnectResizeObserver();
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
      if (sendBoundsUpdateRef.current === sendBoundsUpdate) {
        sendBoundsUpdateRef.current = null;
      }
    };
  }, [activeTabId, appScreenMode, connected]);

  useLayoutEffect(() => {
    uiZoomPercentageRef.current = uiZoomPercentage;
    sendBoundsUpdateRef.current?.();
  }, [uiZoomPercentage]);

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
