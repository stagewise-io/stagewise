export const companionAnchorTagName = "stagewise-companion-anchor";

export function getElementAtPoint(x: number, y: number) {
  const elementsBelowAnnotation = document.elementsFromPoint(x, y);

  const refElement =
    (elementsBelowAnnotation.find(
      (element) =>
        element.nodeName !== "STAGEWISE-COMPANION-ANCHOR" &&
        !element.closest("svg") &&
        isElementAtPoint(element as HTMLElement, x, y)
    ) as HTMLElement) || document.body;

  return refElement;
}

const isElementAtPoint = (
  element: HTMLElement,
  clientX: number,
  clientY: number
) => {
  const boundingRect = element.getBoundingClientRect();

  const isInHorizontalBounds =
    clientX > boundingRect.left &&
    clientX < boundingRect.left + boundingRect.width;
  const isInVerticalBounds =
    clientY > boundingRect.top &&
    clientY < boundingRect.top + boundingRect.height;

  return isInHorizontalBounds && isInVerticalBounds;
};

export function getOffsetsFromPointToElement(
  refElement: HTMLElement,
  x: number,
  y: number
) {
  const referenceClientBounds = refElement.getBoundingClientRect();

  const offsetTop =
    ((y - referenceClientBounds.top) * 100) / referenceClientBounds.height;
  const offsetLeft =
    ((x - referenceClientBounds.left) * 100) / referenceClientBounds.width;

  return {
    offsetTop,
    offsetLeft,
  };
}

export const getXPathForElement = (element: HTMLElement, useId: boolean) => {
  if (element.id && useId) {
    return `/*[@id="${element.id}"]`;
  }

  let nodeElem: HTMLElement | null = element;
  const parts: string[] = [];
  while (nodeElem && Node.ELEMENT_NODE === nodeElem.nodeType) {
    let nbOfPreviousSiblings = 0;
    let hasNextSiblings = false;
    let sibling = nodeElem.previousSibling;
    while (sibling) {
      if (
        sibling.nodeType !== Node.DOCUMENT_TYPE_NODE &&
        sibling.nodeName === nodeElem.nodeName
      ) {
        nbOfPreviousSiblings++;
      }
      sibling = sibling.previousSibling;
    }
    sibling = nodeElem.nextSibling;
    while (sibling) {
      if (sibling.nodeName === nodeElem.nodeName) {
        hasNextSiblings = true;
        break;
      }
      sibling = sibling.nextSibling;
    }
    const prefix = nodeElem.prefix ? nodeElem.prefix + ":" : "";
    const nth =
      nbOfPreviousSiblings || hasNextSiblings
        ? `[${nbOfPreviousSiblings + 1}]`
        : "";
    parts.push(prefix + nodeElem.localName + nth);
    nodeElem = nodeElem.parentElement;
  }
  return parts.length ? "/" + parts.reverse().join("/") : "";
};

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const localStorageURLPrefix = "localstorage://";

export function getLocalStorageUrl(key: string) {
  return `${localStorageURLPrefix}${key}`;
}

export function getKeyFromLocalStorageUrl(url: string) {
  const splitted = url.split(localStorageURLPrefix);
  return splitted[0] === "" && splitted[1] ? splitted[1] : null;
}

export function formatToSizeFormat(sizeInBytes: number) {
  const units = [
    "bytes",
    "KiB",
    "MiB",
    "GiB",
    "TiB",
    "PiB",
    "EiB",
    "ZiB",
    "YiB",
  ];

  let l = 0,
    n = sizeInBytes;

  while (n >= 1024 && ++l) {
    n = n / 1024;
  }

  return n.toFixed(n < 10 && l > 0 ? 1 : 0) + " " + units[l];
}

export interface HotkeyActionDefinition {
  keyComboDefault: string;
  keyComboMac: string;
  isEventMatching: (ev: KeyboardEvent) => boolean;
}

export enum HotkeyActions {
  ESCAPE,
  ALT_SHIFT_C,
}

export const hotkeyActionDefinitions: Record<
  HotkeyActions,
  HotkeyActionDefinition
> = {
  [HotkeyActions.ESCAPE]: {
    keyComboDefault: "Esc",
    keyComboMac: "esc",
    isEventMatching: (ev) => ev.key === "Escape",
  },
  [HotkeyActions.ALT_SHIFT_C]: {
    keyComboDefault: "Alt+⇧+C",
    keyComboMac: "⌥+⇧+C",
    isEventMatching: (ev) => ev.code === "KeyC" && ev.altKey && ev.shiftKey,
  },
};

export function dataURItoBlob(dataURI: string) {
  const byteString = atob(dataURI.split(",")[1]);

  // separate out the mime component
  const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];

  // write the bytes of the string to an ArrayBuffer
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  // set the bytes of the buffer to the correct values
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  const blob = new Blob([ab], { type: mimeString });
  return blob;
}

export async function promoteAreaInImage(
  image: Blob,
  area: {
    top: number;
    left: number;
    width: number;
    height: number;
  }
): Promise<Blob> {
  const img = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get 2d context for canvas");
  }

  canvas.width = img.width;
  canvas.height = img.height;

  // Create a darkened and blurred version of the image
  ctx.drawImage(img, 0, 0);

  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(canvas, 0, 0);

  ctx.filter = "blur(1px)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";

  // Draw the promoted area with a blue border and a light white glow.
  ctx.roundRect(area.left, area.top, area.width, area.height, 6);
  ctx.clip();
  ctx.drawImage(
    img,
    area.left,
    area.top,
    area.width,
    area.height,
    area.left,
    area.top,
    area.width,
    area.height
  );
  ctx.restore();

  // Create a rounded rectangle path for the promoted area
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Convert the canvas back to a Blob
  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          throw new Error("Could not convert canvas to blob");
        }
        resolve(blob);
      },
      "image/png",
      1
    );
  });
}

import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "bg-image": [
        "bg-gradient",
        "bg-gradient-light-1",
        "bg-gradient-light-2",
        "bg-gradient-light-3",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}
