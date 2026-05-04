import { useId, useLayoutEffect, useRef } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';

export function BackgroundWithCutout({
  targetElementId = 'dev-app-preview-container',
  className = '',
}: {
  targetElementId?: string;
  className?: string;
}) {
  const maskId = `cutout-mask-${useId()}`;
  const parentRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<SVGMaskElement>(null);
  const whiteRectRef = useRef<SVGRectElement>(null);
  const blackRectRef = useRef<SVGRectElement>(null);
  const maskDivRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const parentElement = parentRef.current;
    const mask = maskRef.current;
    const whiteRect = whiteRectRef.current;
    const blackRect = blackRectRef.current;
    const maskDiv = maskDivRef.current;
    if (!parentElement || !mask || !whiteRect || !blackRect || !maskDiv) return;

    let hasBounds = false;

    const recalculateBounds = () => {
      const parent = parentRef.current;

      if (!targetElement || !parent) {
        if (hasBounds) {
          hasBounds = false;
          maskDiv.style.mask = 'none';
          maskDiv.style.webkitMask = 'none';
        }
        return;
      }

      const targetRect = targetElement.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      const x = targetRect.x - parentRect.x;
      const y = targetRect.y - parentRect.y;
      const w = targetRect.width;
      const h = targetRect.height;
      const pw = parentRect.width;
      const ph = parentRect.height;

      // Update SVG mask attributes directly — no React state, no re-render
      mask.setAttribute('width', String(pw));
      mask.setAttribute('height', String(ph));
      whiteRect.setAttribute('width', String(pw));
      whiteRect.setAttribute('height', String(ph));
      blackRect.setAttribute('x', String(x));
      blackRect.setAttribute('y', String(y));
      blackRect.setAttribute('width', String(w));
      blackRect.setAttribute('height', String(h));

      if (!hasBounds) {
        hasBounds = true;
        const maskUrl = `url(#${maskId})`;
        maskDiv.style.mask = maskUrl;
        maskDiv.style.webkitMask = maskUrl;
      }
    };

    // --- ResizeObserver: fires after layout, before paint (same frame) ---
    // Call recalculateBounds directly — no RAF deferral, no React state —
    // so the mask updates land in the same frame as the layout change.
    const resizeObserver = new ResizeObserver(recalculateBounds);
    resizeObserver.observe(parentElement);

    // --- Track the target element (may not exist yet) ---
    let targetElement: HTMLElement | null = targetElementId
      ? document.getElementById(targetElementId)
      : null;
    if (targetElement) {
      resizeObserver.observe(targetElement);
    }

    // Initial calculation (synchronous, before first paint)
    recalculateBounds();

    // --- MutationObserver: detect target element appearing/disappearing ---
    const mutationRoot = parentElement.parentElement ?? document.body;
    const mutationObserver = new MutationObserver(() => {
      const newTarget = targetElementId
        ? document.getElementById(targetElementId)
        : null;
      if (newTarget !== targetElement) {
        if (targetElement) {
          resizeObserver.unobserve(targetElement);
        }
        targetElement = newTarget;
        if (targetElement) {
          resizeObserver.observe(targetElement);
        }
        recalculateBounds();
      }
    });
    mutationObserver.observe(mutationRoot, {
      childList: true,
      subtree: true,
    });

    // --- Window resize: catches panel resizes and actual window resizes ---
    window.addEventListener('resize', recalculateBounds);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', recalculateBounds);
    };
  }, [targetElementId, maskId]);

  return (
    <div ref={parentRef} className={cn('absolute inset-0', className)}>
      <svg
        width="0"
        height="0"
        className="pointer-events-none absolute"
        style={{ position: 'absolute' }}
      >
        <defs>
          <mask
            ref={maskRef}
            id={maskId}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            x={0}
            y={0}
          >
            <rect ref={whiteRectRef} x="0" y="0" fill="white" />
            <rect ref={blackRectRef} fill="black" />
          </mask>
        </defs>
      </svg>

      <div
        ref={maskDivRef}
        className="absolute inset-0 bg-background"
        style={{ mask: 'none', WebkitMask: 'none' }}
      />
    </div>
  );
}
