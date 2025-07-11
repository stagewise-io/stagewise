import type {
  SelectedElement,
  UserMessageMetadata,
} from '@stagewise/agent-interface/toolbar';

export const companionAnchorTagName = 'stagewise-companion-anchor';

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

export const copyObject = (obj: unknown, depth = 0, maxDepth = 3): unknown => {
  // Handle primitive values first
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle non-object types
  if (typeof obj !== 'object') {
    return typeof obj === 'function' ? undefined : obj;
  }

  // Stop recursion if we've reached max depth
  if (depth >= maxDepth) {
    // Return empty containers for complex types, primitives as-is
    if (Array.isArray(obj)) {
      return [];
    }
    return {};
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj
      .map((item) => copyObject(item, depth + 1, maxDepth))
      .filter((item) => item !== undefined);
  }

  // Handle objects
  const result: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(obj)) {
    // Skip excluded properties
    if (excludedProperties.has(key)) {
      continue;
    }

    try {
      const value = (obj as Record<string, unknown>)[key];

      // Skip functions
      if (typeof value === 'function') {
        continue;
      }

      // Recursively copy the value
      const copiedValue = copyObject(value, depth + 1, maxDepth);

      // Only include the property if it's not undefined
      if (copiedValue !== undefined) {
        result[key] = copiedValue;
      }
    } catch {
      // Skip properties that throw errors when accessed
      continue;
    }
  }

  return result;
};

// Properties that should be excluded to prevent prototype pollution and reduce noise
const excludedProperties = new Set([
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  'toLocaleString',
]);

// Truncation utilities to ensure data conforms to schema limits
const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...`;
};

const truncateAttributes = (
  attributes: Record<string, string>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  const entries = Object.entries(attributes);

  // Limit to 100 entries max
  const limitedEntries = entries.slice(0, 100);

  for (const [key, value] of limitedEntries) {
    if (value === null || value === undefined) continue;

    // Special handling for important attributes with 4096 char limit
    const importantAttributes = new Set([
      'class',
      'id',
      'style',
      'name',
      'role',
      'href',
      'for',
      'placeholder',
      'alt',
      'title',
      'ariaLabel',
      'ariaRole',
      'ariaDescription',
    ]);

    if (importantAttributes.has(key)) {
      result[key] = truncateString(value, 4096);
    } else {
      // Custom attributes have 256 char limit
      result[key] = truncateString(value, 256);
    }
  }

  return result;
};

const truncateOwnProperties = (
  properties: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const entries = Object.entries(properties);

  // Limit to 500 entries max
  const limitedEntries = entries.slice(0, 500);

  for (const [key, value] of limitedEntries) {
    // Apply deep truncation to nested objects/arrays
    result[key] = truncateValue(value, 0, 2); // Keep original depth limits
  }

  return result;
};

const truncateValue = (
  value: unknown,
  currentDepth: number,
  maxDepth: number,
): unknown => {
  if (value === null || value === undefined) return value;

  if (currentDepth >= maxDepth) {
    if (Array.isArray(value)) return [];
    if (typeof value === 'object') return {};
    return value;
  }

  if (typeof value === 'string') {
    // Apply reasonable string truncation for nested values
    return truncateString(value, 1024);
  }

  if (Array.isArray(value)) {
    // Limit array size to prevent excessive data
    return value
      .slice(0, 50)
      .map((item) => truncateValue(item, currentDepth + 1, maxDepth));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value);

    // Limit object entries to prevent excessive data
    const limitedEntries = entries.slice(0, 50);

    for (const [key, val] of limitedEntries) {
      result[key] = truncateValue(val, currentDepth + 1, maxDepth);
    }

    return result;
  }

  return value;
};

const truncatePluginInfo = (
  pluginInfo: Array<{ pluginName: string; content: string }>,
): Array<{ pluginName: string; content: string }> => {
  return pluginInfo.map((plugin) => ({
    pluginName: truncateString(plugin.pluginName, 128),
    content: truncateString(plugin.content, 4096),
  }));
};

export const getSelectedElementInfo = (
  element: HTMLElement,
  callDepth?: number,
): SelectedElement => {
  const boundingRect = element.getBoundingClientRect();

  // Collect raw attributes
  const rawAttributes = element.getAttributeNames().reduce(
    (acc, name) => {
      const value = element.getAttribute(name);
      if (value !== null) {
        acc[name] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  // Collect raw own properties
  const rawOwnProperties = Object.getOwnPropertyNames(element)
    .filter((prop) => !excludedProperties.has(prop))
    .reduce(
      (acc, prop) => {
        try {
          const value = element[prop as keyof HTMLElement];
          // Only include serializable values
          if (typeof value !== 'function') {
            acc[prop] = copyObject(value, 0, 2);
          }
        } catch {
          // Skip properties that throw errors when accessed
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

  return {
    nodeType: truncateString(element.nodeName, 96),
    xpath: truncateString(getXPathForElement(element, false), 1024),
    attributes: truncateAttributes(rawAttributes),
    textContent: truncateString(element.textContent || '', 512),
    ownProperties: truncateOwnProperties(rawOwnProperties),
    boundingClientRect: {
      top: boundingRect.top,
      left: boundingRect.left,
      height: boundingRect.height,
      width: boundingRect.width,
    },
    parent:
      element.parentElement && (callDepth ?? 0) < 10
        ? getSelectedElementInfo(element.parentElement, (callDepth ?? 0) + 1)
        : null,
    pluginInfo: truncatePluginInfo([]), // TODO: Implement plugin info with proper truncation
  };
};

export const collectUserMessageMetadata = (
  selectedElements: SelectedElement[],
): UserMessageMetadata => {
  return {
    currentUrl: truncateString(window.parent.location.href, 1024),
    currentTitle: truncateString(window.parent.document.title, 256),
    currentZoomLevel: 0,
    devicePixelRatio: window.parent.devicePixelRatio,
    userAgent: truncateString(window.parent.navigator.userAgent, 1024),
    locale: truncateString(window.parent.navigator.language, 64),
    selectedElements,
    viewportResolution: {
      width: window.parent.innerWidth,
      height: window.parent.innerHeight,
    },
  };
};
