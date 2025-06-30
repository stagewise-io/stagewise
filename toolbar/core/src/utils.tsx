export function getElementAtPoint(x: number, y: number) {
  const elementsBelowAnnotation = window.parent.document.elementsFromPoint(
    x,
    y,
  );

  const refElement =
    (elementsBelowAnnotation.find(
      (element) =>
        !element.closest('svg') &&
        !element.closest('STAGEWISE-TOOLBAR') &&
        isElementAtPoint(element as HTMLElement, x, y),
    ) as HTMLElement) || window.parent.document.body;

  return refElement;
}

const isElementAtPoint = (
  element: HTMLElement,
  clientX: number,
  clientY: number,
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
  y: number,
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
    const prefix = nodeElem.prefix ? `${nodeElem.prefix}:` : '';
    const nth =
      nbOfPreviousSiblings || hasNextSiblings
        ? `[${nbOfPreviousSiblings + 1}]`
        : '';
    parts.push(prefix + nodeElem.localName + nth);
    nodeElem = nodeElem.parentElement;
  }
  return parts.length ? `/${parts.reverse().join('/')}` : '';
};

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const localStorageURLPrefix = 'localstorage://';

export function getLocalStorageUrl(key: string) {
  return `${localStorageURLPrefix}${key}`;
}

export function getKeyFromLocalStorageUrl(url: string) {
  const splitted = url.split(localStorageURLPrefix);
  return splitted[0] === '' && splitted[1] ? splitted[1] : null;
}

export function formatToSizeFormat(sizeInBytes: number) {
  const units = [
    'bytes',
    'KiB',
    'MiB',
    'GiB',
    'TiB',
    'PiB',
    'EiB',
    'ZiB',
    'YiB',
  ];

  let l = 0;
  let n = sizeInBytes;

  while (n >= 1024 && ++l) {
    n = n / 1024;
  }

  return `${n.toFixed(n < 10 && l > 0 ? 1 : 0)} ${units[l]}`;
}

export interface HotkeyActionDefinition {
  keyComboDefault: string;
  keyComboMac: string;
  isEventMatching: (ev: KeyboardEvent) => boolean;
}

export enum HotkeyActions {
  ESC = 0,
  CTRL_ALT_C = 1,
}

export const hotkeyActionDefinitions: Record<
  HotkeyActions,
  HotkeyActionDefinition
> = {
  [HotkeyActions.ESC]: {
    keyComboDefault: 'Esc',
    keyComboMac: 'esc',
    isEventMatching: (ev) => ev.code === 'Escape',
  },
  [HotkeyActions.CTRL_ALT_C]: {
    keyComboDefault: 'Ctrl+Alt+C',
    keyComboMac: '⌘+⌥+C',
    isEventMatching: (ev) =>
      ev.code === 'KeyC' && (ev.ctrlKey || ev.metaKey) && ev.altKey,
  },
};

import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'bg-image': [
        'bg-gradient',
        'bg-gradient-light-1',
        'bg-gradient-light-2',
        'bg-gradient-light-3',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}

export const generateId = (length = 16): string => {
  return Math.random()
    .toString(36)
    .substring(2, length + 2);
};
