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
import { useTutorial } from '@ui/contexts/tutorial';
import { cn } from '@ui/utils';

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

  // Prefer below the cutout
  const belowTop = cutout.top + cutout.height + 12;
  if (belowTop + popoverHeight <= viewportHeight) {
    const left = clamp(cutout.left + (cutout.width - popoverWidth) / 2, 12);
    return {
      left: Math.min(left, viewportWidth - popoverWidth - 12),
      top: belowTop,
      origin: 'below',
    };
  }

  // Fallback: above
  const aboveTop = cutout.top - popoverHeight - 12;
  if (aboveTop >= 0) {
    const left = clamp(cutout.left + (cutout.width - popoverWidth) / 2, 12);
    return {
      left: Math.min(left, viewportWidth - popoverWidth - 12),
      top: aboveTop,
      origin: 'above',
    };
  }

  // Fallback: right
  const rightLeft = cutout.left + cutout.width + 12;
  if (rightLeft + popoverWidth <= viewportWidth) {
    const top = clamp(cutout.top + (cutout.height - popoverHeight) / 2, 12);
    return {
      left: rightLeft,
      top: Math.min(top, viewportHeight - popoverHeight - 12),
      origin: 'right',
    };
  }

  // Fallback: left
  const leftLeft = cutout.left - popoverWidth - 12;
  const top = clamp(cutout.top + (cutout.height - popoverHeight) / 2, 12);
  return {
    left: clamp(leftLeft, 12),
    top: Math.min(top, viewportHeight - popoverHeight - 12),
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
    dismissTutorial,
  } = useTutorial();

  const popoverRef = useRef<HTMLDivElement>(null);
  const [cutoutRect, setCutoutRect] = useState<CutoutRect | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);

  const recalc = useCallback(() => {
    if (!currentStep) {
      setCutoutRect(null);
      setPopoverPos(null);
      return;
    }

    const targetEl = document.querySelector<HTMLElement>(
      currentStep.targetSelector,
    );
    if (!targetEl) {
      const popoverEl = popoverRef.current;
      const pw = popoverEl?.offsetWidth ?? 320;
      const ph = popoverEl?.offsetHeight ?? 200;
      setCutoutRect(null);
      setPopoverPos({
        left: Math.max((window.innerWidth - pw) / 2, 12),
        top: Math.max((window.innerHeight - ph) / 2, 12),
        origin: 'center',
      });
      return;
    }

    const rect = getCutoutRect(targetEl);
    if (!rect) {
      const popoverEl = popoverRef.current;
      const pw = popoverEl?.offsetWidth ?? 320;
      const ph = popoverEl?.offsetHeight ?? 200;
      setCutoutRect(null);
      setPopoverPos({
        left: Math.max((window.innerWidth - pw) / 2, 12),
        top: Math.max((window.innerHeight - ph) / 2, 12),
        origin: 'center',
      });
      return;
    }

    setCutoutRect(rect);

    // Compute popover position after layout settles
    // Use the popover element's measured size if available, else estimate
    const popoverEl = popoverRef.current;
    const pw = popoverEl?.offsetWidth ?? 320;
    const ph = popoverEl?.offsetHeight ?? 200;
    setPopoverPos(getPopoverPosition(rect, pw, ph));
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
    const observer = new MutationObserver(() => recalc());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, { capture: true });
      observer.disconnect();
    };
  }, [recalc]);

  // Recalculate popover position once the popover element is measured
  useEffect(() => {
    if (!cutoutRect || !popoverRef.current) return;
    const el = popoverRef.current;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    setPopoverPos(getPopoverPosition(cutoutRect, pw, ph));
  }, [cutoutRect]);

  // Keyboard navigation
  useEffect(() => {
    if (!activeTutorial) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissTutorial();
      } else if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goBack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTutorial, goNext, goBack, dismissTutorial]);

  const isLastStep = currentStepIndex >= totalSteps - 1;
  const isSingleStepTutorial = totalSteps <= 1;

  const content = useMemo(() => {
    if (!activeTutorial || !currentStep) return null;

    return (
      <div className="pointer-events-none fixed inset-0 z-[9999]">
        {/* Full-screen click shield — blocks interactivity behind the tutorial */}
        <div className="pointer-events-auto absolute inset-0 bg-transparent" />

        {/* Cutout element */}
        {cutoutRect && (
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
        )}

        {/* Fallback overlay when no target element */}
        {!cutoutRect && (
          <div className="pointer-events-none absolute inset-0 bg-black/50" />
        )}

        {/* Popover */}
        {popoverPos && (
          <div
            ref={popoverRef}
            className={cn(
              'pointer-events-auto absolute w-80 rounded-xl bg-background p-2.5',
              'border border-derived shadow-elevation-2',
            )}
            style={{
              left: popoverPos.left,
              top: popoverPos.top,
            }}
          >
            {!isSingleStepTutorial && (
              <>
                {/* Close Button */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={dismissTutorial}
                  aria-label="Close tutorial"
                  className="absolute top-2 right-2 z-10"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </Button>
              </>
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
