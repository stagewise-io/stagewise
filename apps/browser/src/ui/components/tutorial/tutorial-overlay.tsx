import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconXmarkFill18 } from '@stagewise/icons';
import { useTutorial } from '@ui/contexts/tutorial';
import { cn } from '@ui/utils';

// How long to wait for a step's target element before skipping the step.
// Guards against stale selectors locking the UI behind the click shield.
const MISSING_TARGET_SKIP_MS = 3000;

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  );
}

interface CutoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: number;
}

function clamp(value: number, min: number): number {
  return Math.max(value, min);
}

/**
 * Compute the cutout rectangle from a target DOM element.
 * Expands by 3px on all sides beyond the element's bounding rect.
 */
function cutoutRectsEqual(a: CutoutRect, b: CutoutRect): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height &&
    a.borderRadius === b.borderRadius
  );
}

function getCutoutRect(el: HTMLElement): CutoutRect | null {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  const style = getComputedStyle(el);
  const parsedRadius = Number.parseFloat(style.borderRadius);
  const elRadius = Number.isNaN(parsedRadius) ? 0 : parsedRadius;

  return {
    left: rect.left - 3,
    top: rect.top - 3,
    width: rect.width + 6,
    height: rect.height + 6,
    borderRadius: clamp(elRadius + 3, 0),
  };
}

interface PopoverPosition {
  left: number;
  top: number;
  origin: 'below' | 'above' | 'right' | 'left' | 'center';
}

function getPopoverPosition(
  cutout: CutoutRect,
  popoverWidth: number,
  popoverHeight: number,
): PopoverPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Clamp a position to keep the popover fully inside the viewport.
  // Uses clamp() for the lower bound and Math.max for the upper bound
  // to prevent the popover from being pushed offscreen when the viewport
  // is narrower than the popover plus margins.
  const clampX = (x: number) =>
    Math.min(Math.max(x, 12), Math.max(12, viewportWidth - popoverWidth - 12));
  const clampY = (y: number) =>
    Math.min(
      Math.max(y, 12),
      Math.max(12, viewportHeight - popoverHeight - 12),
    );

  // Prefer below the cutout
  const belowTop = cutout.top + cutout.height + 12;
  if (belowTop + popoverHeight <= viewportHeight) {
    return {
      left: clampX(cutout.left + (cutout.width - popoverWidth) / 2),
      top: belowTop,
      origin: 'below',
    };
  }

  // Fallback: above
  const aboveTop = cutout.top - popoverHeight - 12;
  if (aboveTop >= 0) {
    return {
      left: clampX(cutout.left + (cutout.width - popoverWidth) / 2),
      top: aboveTop,
      origin: 'above',
    };
  }

  // Fallback: right
  const rightLeft = cutout.left + cutout.width + 12;
  if (rightLeft + popoverWidth <= viewportWidth) {
    return {
      left: rightLeft,
      top: clampY(cutout.top + (cutout.height - popoverHeight) / 2),
      origin: 'right',
    };
  }

  // Fallback: left
  return {
    left: clampX(cutout.left - popoverWidth - 12),
    top: clampY(cutout.top + (cutout.height - popoverHeight) / 2),
    origin: 'left',
  };
}

function getNodeText(children?: React.ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map((child) => getNodeText(child)).join('');
  }
  if (isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    return getNodeText(props.children);
  }
  return '';
}

function getStrongTextColorClass(children?: React.ReactNode): string {
  switch (getNodeText(children).trim().toLowerCase()) {
    case 'green':
      return 'text-success-foreground';
    case 'yellow':
      return 'text-warning-foreground';
    case 'blue':
      return 'text-primary-foreground';
    case 'red':
      return 'text-error-foreground';
    default:
      return 'text-foreground';
  }
}

/** Minimal markdown components for tutorial descriptions */
const TUTORIAL_MD_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 text-muted-foreground text-sm leading-relaxed last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className={cn('font-semibold', getStrongTextColorClass(children))}>
      {children}
    </strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-surface-2 px-1 py-px font-mono text-xs">
      {children}
    </code>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      className="text-primary-foreground underline hover:no-underline"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mt-2 space-y-0.5 pl-4 text-muted-foreground text-xs">
      {children}
    </ul>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-snug">{children}</li>
  ),
};

function StepDescription({ children }: { children: string }) {
  return (
    <ReactMarkdown components={TUTORIAL_MD_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

export function TutorialOverlay() {
  const {
    activeTutorial,
    currentStep,
    currentStepIndex,
    totalSteps,
    goNext,
    goBack,
    skipCurrentStep,
    dismissTutorial,
  } = useTutorial();

  const popoverRef = useRef<HTMLDivElement>(null);
  const [cutoutRect, setCutoutRect] = useState<CutoutRect | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);

  const recalc = useCallback(() => {
    if (!currentStep) {
      setCutoutRect(null);
      setPopoverPos(null);
      return;
    }

    const targetEl = document.querySelector<HTMLElement>(
      currentStep.targetSelector,
    );
    const rect = targetEl ? getCutoutRect(targetEl) : null;
    if (!rect) {
      // Don't render a shield/popover for a missing target — that would
      // lock the whole UI. The skip timer below advances past the step.
      setCutoutRect(null);
      setPopoverPos(null);
      setTargetMissing(true);
      return;
    }
    setTargetMissing(false);

    // Guard against no-op updates: recalc runs on every body mutation
    // (e.g. chat streaming), and fresh object identities would re-render
    // the overlay continuously.
    setCutoutRect((prev) =>
      prev && cutoutRectsEqual(prev, rect) ? prev : rect,
    );

    // Compute popover position after layout settles
    // Use the popover element's measured size if available, else estimate
    const popoverEl = popoverRef.current;
    const pw = popoverEl?.offsetWidth ?? 320;
    const ph = popoverEl?.offsetHeight ?? 200;
    const pos = getPopoverPosition(rect, pw, ph);
    setPopoverPos((prev) =>
      prev &&
      prev.left === pos.left &&
      prev.top === pos.top &&
      prev.origin === pos.origin
        ? prev
        : pos,
    );
  }, [currentStep]);

  // Recalculate on step change, resize, scroll, and DOM mutations
  useEffect(() => {
    recalc();

    const onResizeOrScroll = () => recalc();
    window.addEventListener('resize', onResizeOrScroll, { passive: true });
    window.addEventListener('scroll', onResizeOrScroll, {
      passive: true,
      capture: true,
    });

    // Watch for DOM changes so we detect when the target element appears
    // dynamically (e.g. inside a popover that just opened).
    // Throttled via requestAnimationFrame to avoid expensive recalculations
    // during high-frequency DOM mutations (e.g. chat streaming).
    let rafId: number | null = null;
    const observer = new MutationObserver(() => {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          recalc();
        });
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, { capture: true });
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [recalc]);

  // Recalculate popover position once the popover element is measured
  useEffect(() => {
    if (!cutoutRect || !popoverRef.current) return;
    const el = popoverRef.current;
    const pos = getPopoverPosition(cutoutRect, el.offsetWidth, el.offsetHeight);
    setPopoverPos((prev) =>
      prev &&
      prev.left === pos.left &&
      prev.top === pos.top &&
      prev.origin === pos.origin
        ? prev
        : pos,
    );
  }, [cutoutRect]);

  // Auto-skip steps whose target element never appears. Without this, a
  // stale selector would block the UI behind the click shield forever.
  useEffect(() => {
    if (!activeTutorial || !targetMissing) return;
    const timeout = window.setTimeout(
      () => skipCurrentStep(),
      MISSING_TARGET_SKIP_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [activeTutorial, targetMissing, currentStepIndex, skipCurrentStep]);

  // Move focus into the popover once per step so keyboard interaction
  // targets the tutorial instead of whatever was focused before (e.g. the
  // chat input — otherwise arrow keys would be swallowed while typing).
  const lastFocusKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTutorial || !popoverPos || !popoverRef.current) return;
    const key = `${activeTutorial.id}:${currentStepIndex}`;
    if (lastFocusKeyRef.current === key) return;
    lastFocusKeyRef.current = key;
    popoverRef.current.focus({ preventScroll: true });
  }, [activeTutorial, currentStepIndex, popoverPos]);

  // Keyboard navigation
  useEffect(() => {
    if (!activeTutorial) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismissTutorial();
        return;
      }
      if (e.key === 'Tab') {
        // Trap focus inside the popover — the click shield blocks pointer
        // events, but Tab would otherwise reach the obscured UI behind it.
        const popover = popoverRef.current;
        if (!popover) return;
        const focusables = popover.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href]',
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        const active = document.activeElement;
        if (!popover.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      // Don't hijack arrow keys while the user is typing in an editable
      // element (cursor movement must keep working).
      if (isEditableTarget(e.target)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        goBack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTutorial, goNext, goBack, dismissTutorial]);

  const isLastStep = currentStepIndex >= totalSteps - 1;
  const isSingleStepTutorial = totalSteps <= 1;

  const content = useMemo(() => {
    // While the target is missing, render nothing — no shield, no popover.
    // The auto-skip timer advances past the step if it never appears.
    if (!activeTutorial || !currentStep || !cutoutRect) return null;

    return (
      <div className="pointer-events-none fixed inset-0 z-[9999]">
        {/* Full-screen click shield — blocks interactivity behind the tutorial */}
        <div className="pointer-events-auto absolute inset-0 bg-transparent" />

        {/* Cutout element */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: cutoutRect.left,
            top: cutoutRect.top,
            width: cutoutRect.width,
            height: cutoutRect.height,
            borderRadius: cutoutRect.borderRadius,
            boxShadow:
              '0 0 0 2px var(--color-primary-solid), 0 0 10px 4px oklch(from var(--color-primary-solid) l c h / 0.4), 0 0 0 9999px rgb(0 0 0 / 0.5)',
          }}
        />

        {/* Popover */}
        {popoverPos && (
          <div
            ref={popoverRef}
            role="dialog"
            aria-modal="true"
            aria-label={currentStep.title}
            tabIndex={-1}
            className={cn(
              'pointer-events-auto absolute w-80 rounded-xl bg-background p-2.5 outline-none',
              'border border-derived shadow-elevation-2',
            )}
            style={{
              left: popoverPos.left,
              top: popoverPos.top,
            }}
          >
            {!isSingleStepTutorial && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={dismissTutorial}
                aria-label="Close tutorial"
                className="absolute top-2 right-2 z-10"
              >
                <IconXmarkFill18 className="size-4" />
              </Button>
            )}

            {/* Title */}
            <h3 className="mb-2 font-semibold text-foreground text-sm">
              {currentStep.title}
            </h3>

            {/* Description */}
            <div className="mb-3">
              <StepDescription>{currentStep.description}</StepDescription>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2">
              {!isSingleStepTutorial ? (
                <p className="text-muted-foreground text-xs">
                  {currentStepIndex + 1}/{totalSteps}
                </p>
              ) : (
                <div />
              )}
              <div className="flex items-center justify-end gap-2">
                {!isSingleStepTutorial && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentStepIndex === 0}
                    onClick={goBack}
                  >
                    Back
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={goNext}>
                  {isSingleStepTutorial
                    ? 'Okay'
                    : isLastStep
                      ? 'Finish'
                      : 'Next'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }, [
    activeTutorial,
    currentStep,
    cutoutRect,
    popoverPos,
    currentStepIndex,
    totalSteps,
    isLastStep,
    goNext,
    goBack,
    dismissTutorial,
  ]);

  if (!activeTutorial) return null;

  return createPortal(content, document.body);
}
