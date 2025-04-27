import { useCyclicUpdate } from "./use-cyclic-update";
import { useCallback, useEffect, useRef } from "preact/hooks";

export function useReferenceElement(
  referencePath: string,
  updateRate: number = 0
) {
  // Fetch the reference element using the provided path and return the reference to it.

  const referenceElementRef = useRef<HTMLElement | null>(null);

  const updateReferenceElement = useCallback(() => {
    try {
      const referenceNode = document.evaluate(
        referencePath,
        document,
        (prefix) => {
          return prefix === "svg" ? "http://www.w3.org/2000/svg" : null;
        },
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;

      const referenceElement =
        referenceNode instanceof HTMLElement ? referenceNode : null;

      referenceElementRef.current = referenceElement;
    } catch {
      /* no-op */
    }
  }, [referencePath]);

  useEffect(() => {
    updateReferenceElement();
  }, [updateReferenceElement]);

  useCyclicUpdate(updateReferenceElement, updateRate);

  return referenceElementRef;
}
