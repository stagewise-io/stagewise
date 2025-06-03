import { useEventListener } from '@/hooks/use-event-listener';
import { companionAnchorTagName } from '@/utils';
import { useEffect, useRef } from 'preact/hooks';

// The FocusLock component is responsible for preventing programmatic focus loss to the main app when the companion receives focus.
// It should be instantiated once in the companion's root component and directly inter-operates with the FocusLockManager.
export function FocusLock() {
  const focusInCompanion = useRef(false);

  useEffect(() => {
    const originalFocus = HTMLElement.prototype.focus;

    HTMLElement.prototype.focus = function (...args) {
      const shadowRoot = this.getRootNode();
      const isInCompanion =
        shadowRoot instanceof ShadowRoot &&
        shadowRoot.host instanceof HTMLElement &&
        shadowRoot.host.nodeName === 'STAGEWISE-COMPANION-ANCHOR';
      if (!isInCompanion && focusInCompanion.current) {
        return;
      }
      originalFocus.apply(this, args);
    };

    return () => {
      HTMLElement.prototype.focus = originalFocus;
    };
  }, []);

  useEventListener(
    'focusin',
    (event) => {
      if (event.target.localName === companionAnchorTagName) {
        focusInCompanion.current = true;
      }
    },
    { capture: true },
  );

  useEventListener(
    'focusout',
    (event) => {
      if (event.target.localName === companionAnchorTagName) {
        focusInCompanion.current = false;
      }
    },
    { capture: true },
  );

  return null;
}
