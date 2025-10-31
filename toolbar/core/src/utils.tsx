import type {
  BrowserData,
  SelectedElement,
  UserMessageMetadata,
} from '@stagewise/karton-contract';

export const companionAnchorTagName = 'stagewise-companion-anchor';

export const getIFrame = () => {
  const iframe = document.getElementById('user-app-iframe');
  return iframe as HTMLIFrameElement | null;
};

export const getIFrameWindow = () => {
  return getIFrame()?.contentWindow;
};

export function getElementAtPoint(x: number, y: number) {
  // Validate that x and y are finite numbers to prevent crashes
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return getIFrameWindow()?.document.body;
  }

  const iframe = getIFrame();
  const iframeRect = getIFrame()?.getBoundingClientRect();
  const iframeScale = iframeRect ? iframeRect.width / iframe!.offsetWidth : 1;

  const elementsBelowPoint = getIFrameWindow()?.document.elementsFromPoint(
    (x - (iframeRect?.left ?? 0)) / iframeScale,
    (y - (iframeRect?.top ?? 0)) / iframeScale,
  );

  const refElement =
    (elementsBelowPoint?.find(
      (element) =>
        !element.closest('svg') &&
        !element.closest('STAGEWISE-TOOLBAR') &&
        isElementAtPoint(
          element as HTMLElement,
          (x - (iframeRect?.left ?? 0)) / iframeScale,
          (y - (iframeRect?.top ?? 0)) / iframeScale,
        ),
    ) as HTMLElement) || getIFrameWindow()?.document.body;

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
  CTRL_ALT_PERIOD = 1,
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
  [HotkeyActions.CTRL_ALT_PERIOD]: {
    keyComboDefault: 'Ctrl+Alt+.',
    keyComboMac: '⌘+⌥+.',
    isEventMatching: (ev) =>
      ev.code === 'Period' && (ev.ctrlKey || ev.metaKey) && ev.altKey,
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
const truncateString = <T extends string | null | undefined>(
  str: T,
  maxLength: number,
): T => {
  if (!str) return str;
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...` as T;
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
      result[key] = truncateString(value, 4096)!;
    } else {
      // Custom attributes have 256 char limit
      result[key] = truncateString(value, 256)!;
    }
  }

  return result;
};

const truncateOwnProperties = (
  _properties: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  // const entries = Object.entries(properties);
  const entries: [string, unknown][] = []; // disable for now - the amount of data might have caused abort errors

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
    pluginName: truncateString(plugin.pluginName, 128)!,
    content: truncateString(plugin.content, 4096)!,
  }));
};

export const getSelectedElementInfo = (
  stagewiseId: string,
  element: HTMLElement,
  codeMetadata: {
    relativePath: string;
    startLine: number;
    endLine: number;
  } | null,
  mode: 'originalElement' | 'children' | 'parents' = 'originalElement',
  callDepth?: number,
  childrenCount?: number,
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
    stagewiseId,
    nodeType: truncateString(element.nodeName, 96) ?? 'unknown',
    xpath:
      truncateString(getXPathForElement(element, false), 1024) ?? 'unknown',
    attributes: truncateAttributes(rawAttributes),
    textContent: truncateString(element.textContent || '', 512) ?? 'unknown',
    ownProperties: truncateOwnProperties(rawOwnProperties),
    boundingClientRect: {
      top: boundingRect.top,
      left: boundingRect.left,
      height: boundingRect.height,
      width: boundingRect.width,
    },
    children:
      (mode === 'children' || mode === 'originalElement') &&
      (childrenCount ?? 0) < 10
        ? Array.from(element.children)
            .slice(0, 5)
            .map((c) => {
              return getSelectedElementInfo(
                generateId(),
                c as HTMLElement,
                null,
                'children',
                undefined,
                (childrenCount ?? 0) + 1,
              );
            })
        : undefined,
    parent:
      (mode === 'parents' || mode === 'originalElement') &&
      element.parentElement &&
      (callDepth ?? 0) < 10
        ? getSelectedElementInfo(
            stagewiseId,
            element.parentElement,
            codeMetadata,
            'parents',
            (callDepth ?? 0) + 1,
            undefined,
          )
        : undefined,
    pluginInfo: truncatePluginInfo([]),
    codeMetadata: codeMetadata || undefined,
  };
};

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const getBrowserData = (): BrowserData | null => {
  const iframe = getIFrameWindow();

  if (!iframe) return null;

  return {
    viewport: {
      width: iframe.innerWidth,
      height: iframe.innerHeight,
      dpr: iframe.devicePixelRatio,
    },
    currentUrl: iframe.location.href,
    currentTitle: iframe.document.title,
    userAgent: iframe.navigator.userAgent,
    locale: iframe.navigator.language,
    prefersDarkMode: iframe.matchMedia('(prefers-color-scheme: dark)').matches,
  };
};

export const collectUserMessageMetadata = (
  selectedElements: SelectedElement[],
  _sentByPlugin?: boolean,
): UserMessageMetadata => {
  const browserData = getBrowserData();
  return {
    createdAt: new Date(),
    selectedPreviewElements: selectedElements,
    browserData: browserData || undefined,
  };
};

export const getDataUriForData = (data: string) => {
  // Convert base64 data to a blob URL for opening in a new tab
  if (!data) return '';

  try {
    // If it's already a data URI, extract the base64 part
    let base64Data = data;
    if (data.startsWith('data:')) {
      const base64Index = data.indexOf('base64,');
      if (base64Index !== -1) {
        base64Data = data.substring(base64Index + 7);
      }
    }

    // Remove any whitespace from base64 string
    base64Data = base64Data.replace(/\s+/g, '');

    // Convert base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create blob and return blob URL
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Failed to create blob URL from base64 data:', error);
    return '';
  }
};

export const isAnthropicSupportedFileType = (mimeType: string): boolean => {
  const supportedTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
  ];

  return supportedTypes.includes(mimeType.toLowerCase());
};

export const isAnthropicSupportedFile = (
  file: File,
): { supported: boolean; reason?: string } => {
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB in bytes

  // Check file size first
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = Math.round(file.size / (1024 * 1024));
    return {
      supported: false,
      reason: `File too large (${sizeMB}MB). Maximum size is 20MB`,
    };
  }

  // Check file type
  if (!isAnthropicSupportedFileType(file.type)) {
    return {
      supported: false,
      reason: 'Unsupported file type',
    };
  }

  return { supported: true };
};

export const openFileUrl = async (url: string, filename?: string) => {
  // Handle opening file URLs, converting data URLs to blob URLs if necessary
  if (!url) return;

  try {
    // Check if it's a data URL
    if (url.startsWith('data:')) {
      // Use fetch to stream-decode data URLs to Blob
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Open the blob URL in a new tab with security flags
      const newWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

      // Clean up blob URL after a delay
      if (newWindow) {
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 1000);
      } else {
        // If popup was blocked, try downloading instead
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename || 'file';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up blob URL
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 100);
      }
    } else {
      // Regular URL - open normally with security flags
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    console.error('Failed to open file URL:', error);
    // Fallback to regular window.open with security flags
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

export const getTruncatedFileUrl = (
  url: string,
  maxPathParts = 3,
  maxLength = 128,
) => {
  if (!url) return '';

  // Ensure sane limits
  const partsLimit = Math.max(1, Math.floor(maxPathParts || 1));
  const perPartMaxLen = Math.max(1, Math.floor(maxLength || 1));

  // Try to parse as a URL first (handles http/https/file)
  let prefix = '';
  let pathPortion = url;

  try {
    const u = new URL(url);
    if (u.protocol === 'file:') {
      // Keep scheme only for file://
      prefix = 'file://';
      pathPortion = u.pathname || '';
    } else {
      // Keep origin for other protocols
      prefix = `${u.protocol}//${u.host}`;
      pathPortion = u.pathname || '';
    }
  } catch {
    // Not a standard URL; handle custom schemes or plain paths
    const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)/);
    if (schemeMatch) {
      const scheme = schemeMatch[1] ?? '';
      const rest = url.slice(scheme.length);
      // Extract optional authority (until next slash or backslash)
      const sepIdx = rest.search(/[/\\]/);
      if (sepIdx === -1) {
        // No path portion; truncate the authority/key itself
        const truncated = truncateString(rest, perPartMaxLen) as string;
        return `${scheme}${truncated}`;
      }
      const authority = rest.slice(0, sepIdx);
      prefix = `${scheme}${authority}`;
      pathPortion = rest.slice(sepIdx);
    } else {
      // Plain path (likely filesystem)
      prefix = '';
      pathPortion = url;
    }
  }

  // Strip query/hash from the path portion
  let pathOnly = pathPortion;
  const qIdx = pathOnly.indexOf('?');
  if (qIdx !== -1) pathOnly = pathOnly.slice(0, qIdx);
  const hIdx = pathOnly.indexOf('#');
  if (hIdx !== -1) pathOnly = pathOnly.slice(0, hIdx);

  // Preserve knowledge about leading separator
  let leadingSep = '';
  if (pathOnly.startsWith('/') || pathOnly.startsWith('\\')) {
    leadingSep = pathOnly.charAt(0);
  }

  // Detect Windows drive (supports file:///C:/... and C:\...)
  let drive = '';
  const winDriveMatch = pathOnly.match(/^\/?([A-Za-z]:)[/\\]?/);
  if (winDriveMatch) {
    drive = winDriveMatch[1] ?? '';
    pathOnly = pathOnly.replace(/^\/?([A-Za-z]:)[/\\]?/, '');
    leadingSep = '';
  }

  // Choose join separator: prefer backslash only for plain Windows paths
  const useBackslash = /\\/.test(url) && !/^file:\/\//.test(url);
  const sep = useBackslash ? '\\' : '/';

  const rawSegments = pathOnly.split(/[/\\]+/).filter(Boolean);

  if (rawSegments.length === 0) {
    // Nothing to truncate; just return prefix + drive if present or original url
    if (drive) {
      return prefix ? `${prefix}/${drive}` : `${drive}`;
    }
    if (prefix) {
      // Ensure at least a slash after prefix if there was a path originally
      return `${prefix}${leadingSep || ''}` || url;
    }
    return url;
  }

  const limitedCount = Math.min(rawSegments.length, partsLimit);
  const tail = rawSegments.slice(-limitedCount);

  const truncatedTail = tail.map((p) => {
    return (truncateString(p, perPartMaxLen) as string) || '';
  });

  let truncatedPath = truncatedTail.join(sep);
  const hadMore = rawSegments.length > limitedCount;
  if (hadMore) {
    truncatedPath = `...${sep}${truncatedPath}`;
  }

  // Rebuild final string
  if (drive) {
    if (prefix) {
      // file:///C:/...
      return `${prefix}/${drive}${truncatedPath ? sep + truncatedPath : ''}`;
    }
    return `${drive}${truncatedPath ? sep + truncatedPath : ''}`;
  }

  if (prefix) {
    // For URLs (http/https/file without drive), ensure a leading slash before the path
    const normalizedPath = useBackslash
      ? truncatedPath.replace(/\\/g, '/')
      : truncatedPath;
    const lead = normalizedPath ? '/' : '';
    return `${prefix}${lead}${normalizedPath}`;
  }

  return `${leadingSep || ''}${truncatedPath}`;
};
