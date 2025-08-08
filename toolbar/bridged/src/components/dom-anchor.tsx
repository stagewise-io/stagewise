import { useReferenceElement } from '@/hooks/use-reference-element';
import { useWindowSize } from '@/hooks/use-window-size';
import { getElementAtPoint } from '@/utils';
import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createContext, type ReactNode } from 'react';

export interface DOMAnchorProps {
  referencePath: string; // The XPath of the reference element
  offsetTop: number; // The offset of the anchor from the reference element in percent
  offsetLeft: number; // The offset of the anchor from the reference element in percent
  updateRate?: number; // How often the anchor position should be updated per second
  verticalSafeDistance?: number; // The distance from the viewport border where the anchor should be rendered
  horizontalSafeDistance?: number; // The distance from the viewport border where the anchor should be rendered
  children?: ReactNode; // Stuff that should be rendered in the anchor
  keepInViewport?: boolean; // Applies reglar scrollIntoView to the reference Element
  disableUpdating?: boolean; //  Disables the anchor updating
}

export enum AnchorOrientation {
  TOP_LEFT = 0,
  TOP_RIGHT = 1,
  BOTTOM_LEFT = 2,
  BOTTOM_RIGHT = 3,
}

export enum NotAtAnchorReason {
  OUTSIDE_VIEWPORT = 0, // The reference element is not inside the viewport
  REF_ELEMENT_NOT_FOUND = 1, // The reference element is not found
  REF_ELEMENT_NOT_VISIBLE = 2, // The reference element is not visible or not at the top
  DISABLED = 3, // The anchor updating is disabled
  NOT_IN_DOM_ANCHOR = 4, // The element is not a child of a DOMAnchor
}

interface DOMAnchorState {
  isAtAnchor: boolean;
  recommendedOrientation: AnchorOrientation | null;
  notAtAnchorReason: NotAtAnchorReason | null;
  refElement: HTMLElement | null;
}

const DOMRecommendedAnchorOrientationContext = createContext<DOMAnchorState>({
  isAtAnchor: false,
  recommendedOrientation: null,
  notAtAnchorReason: NotAtAnchorReason.NOT_IN_DOM_ANCHOR,
  refElement: null,
});

// This component creates a 0x0 anchor that follows the position of other DOM elements on the website.
// If the anchor is outside of the viewport, it get's rednered at an unexpected position.
// It's recommended to check the context value inside the DOMAnchored content to check if cotent should be rendered or not.
export function DOMAnchor({
  horizontalSafeDistance = 0,
  verticalSafeDistance = 0,
  updateRate = 30,
  ...props
}: DOMAnchorProps) {
  const refElement = useReferenceElement(props.referencePath, 5);

  const anchorRef = useRef<HTMLDivElement>(null);

  const [recommendedOrientation, setRecommendedOrientation] =
    useState<AnchorOrientation | null>(null);

  const [isAtAnchor, setIsAtAnchor] = useState(false);
  const [notAtAnchorReason, setNotAtAnchorReason] =
    useState<NotAtAnchorReason | null>(null);

  const windowSize = useWindowSize();

  const updateAnchorPosition = useCallback(() => {
    if (props.disableUpdating) {
      return;
    }

    if (!refElement.current) {
      setIsAtAnchor(false);
      setNotAtAnchorReason(NotAtAnchorReason.REF_ELEMENT_NOT_FOUND);
      setRecommendedOrientation(null);
      return;
    }

    const refBoundingBox = refElement.current?.getBoundingClientRect();

    if (refBoundingBox) {
      const top =
        refBoundingBox.top + (refBoundingBox.height * props.offsetTop) / 100;
      const left =
        refBoundingBox.left + (refBoundingBox.width * props.offsetLeft) / 100;

      if (
        top < 0 ||
        left < 0 ||
        top > windowSize.height ||
        left > windowSize.width
      ) {
        // We don't render if the anchor is not situated in the viewport
        setIsAtAnchor(false);
        setNotAtAnchorReason(NotAtAnchorReason.OUTSIDE_VIEWPORT);
        setRecommendedOrientation(null);
        return;
      }

      // We check if the anchor is at the top index of the screen at the calculated X and Y coordinates
      const refElAtPos = getElementAtPoint(left, top);
      if (refElAtPos !== refElement.current) {
        setIsAtAnchor(false);
        setNotAtAnchorReason(NotAtAnchorReason.REF_ELEMENT_NOT_VISIBLE);
        setRecommendedOrientation(null);
        return;
      }

      if (anchorRef.current) {
        anchorRef.current.style.top = `${top}px`;
        anchorRef.current.style.left = `${left}px`;
      }

      // Update recommended orientation
      const distTop = top;
      const distBottom = windowSize.height - top;
      const distLeft = left;
      const distRight = windowSize.width - left;
      const preferBottom =
        (props.offsetTop >= 50 || distTop <= verticalSafeDistance) &&
        distBottom >= verticalSafeDistance;
      const preferRight =
        (props.offsetLeft >= 50 || distLeft <= horizontalSafeDistance) &&
        distRight >= horizontalSafeDistance;

      setIsAtAnchor(true);
      setNotAtAnchorReason(null);
      setRecommendedOrientation(
        preferBottom
          ? preferRight
            ? AnchorOrientation.BOTTOM_RIGHT
            : AnchorOrientation.BOTTOM_LEFT
          : preferRight
            ? AnchorOrientation.TOP_RIGHT
            : AnchorOrientation.TOP_LEFT,
      );
    }
  }, [
    props.disableUpdating,
    props.offsetTop,
    props.offsetLeft,
    refElement,
    windowSize.height,
    windowSize.width,
    verticalSafeDistance,
    horizontalSafeDistance,
  ]);

  useCyclicUpdate(updateAnchorPosition, props.disableUpdating ? 0 : updateRate);

  const keepInViewportUpdate = useCallback(() => {
    if (
      !props.keepInViewport ||
      (!isAtAnchor &&
        notAtAnchorReason !== NotAtAnchorReason.OUTSIDE_VIEWPORT) ||
      props.disableUpdating
    )
      return;

    // @ts-expect-error The TS types don't know about scrollIntoViewIfNeeded
    if (refElement.current?.scrollIntoViewIfNeeded) {
      // @ts-expect-error See above...
      refElement.current.scrollIntoViewIfNeeded(true);
    } else if (refElement.current?.scrollIntoView) {
      refElement.current.scrollIntoView({
        behavior: 'instant',
        block: 'center',
        inline: 'center',
      });
    }
  }, [isAtAnchor, props.disableUpdating, props.keepInViewport, refElement]);

  useCyclicUpdate(keepInViewportUpdate, props.keepInViewport ? 1 : 0);

  useEffect(() => {
    if (props.disableUpdating) {
      setIsAtAnchor(false);
      setNotAtAnchorReason(NotAtAnchorReason.DISABLED);
      setRecommendedOrientation(null);
    }
  }, [props.disableUpdating]);

  const state = useMemo(
    () => ({
      isAtAnchor: isAtAnchor,
      recommendedOrientation: recommendedOrientation,
      notAtAnchorReason: notAtAnchorReason,
      refElement: refElement.current,
    }),
    [isAtAnchor, notAtAnchorReason, recommendedOrientation, refElement],
  );

  return (
    <div ref={anchorRef} className="size-0">
      <DOMRecommendedAnchorOrientationContext.Provider value={state}>
        {props.children}
      </DOMRecommendedAnchorOrientationContext.Provider>
    </div>
  );
}

export const useDOMAnchorState = () => {
  return useContext(DOMRecommendedAnchorOrientationContext);
};
