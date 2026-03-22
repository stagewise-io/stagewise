import posthog from 'posthog-js';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui';
import type { SelectedElement } from '@shared/selected-elements';

import { extractMentionsFromTiptapContent } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions';

import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import type { Content } from '@tiptap/core';

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

// Truncation utilities to ensure data conforms to schema limits
const truncateString = <T extends string | null | undefined>(
  str: T,
  maxLength: number,
): T => {
  if (!str) return str;
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...` as T;
};

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const collectUserMessageMetadata = (
  selectedElements: SelectedElement[],
  tiptapContent?: Content,
): UserMessageMetadata => {
  const mentions = extractMentionsFromTiptapContent(tiptapContent);

  return {
    createdAt: new Date(),
    partsMetadata: [],
    selectedPreviewElements: selectedElements,
    mentions: mentions.length > 0 ? mentions : undefined,
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
      if (base64Index !== -1) base64Data = data.substring(base64Index + 7);
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
    posthog.captureException(
      error instanceof Error ? error : new Error(String(error)),
      { source: 'renderer', operation: 'getDataUriForData' },
    );
    return '';
  }
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
    posthog.captureException(
      error instanceof Error ? error : new Error(String(error)),
      { source: 'renderer', operation: 'openFileUrl' },
    );
    // Fallback to regular window.open with security flags
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

const MOUNT_PREFIX_RE = /^w[a-f0-9]+\//;

/**
 * Strip a mount prefix (e.g. "w1a2b/" or "w1/") from a workspace-relative path
 * so it can be displayed without the internal addressing scheme.
 */
export function stripMountPrefix(rawPath: string): string {
  const path = rawPath.replace(/\\/g, '/');
  if (!path.includes('/')) return '';
  return path.replace(MOUNT_PREFIX_RE, '');
}

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

export { IDE_SELECTION_ITEMS, getIDEFileUrl } from '@shared/ide-url';

/**
 * Extract an image URL from drag-and-drop data transfer.
 * Handles both data URLs (e.g., from Google Images) and regular image URLs.
 *
 * @param htmlData - The HTML content from dataTransfer.getData('text/html')
 * @param uriList - The URI from dataTransfer.getData('text/uri-list')
 * @returns The extracted image URL, or null if no image URL found
 */
export function extractImageUrlFromDragData(
  htmlData: string | null,
  uriList: string | null,
): string | null {
  let imageUrl: string | null = null;

  if (htmlData) {
    // Check for data URL in img src (e.g., from Google Images)
    const dataUrlMatch = htmlData.match(/src=["'](data:image\/[^"']+)["']/i);
    if (dataUrlMatch?.[1]) imageUrl = dataUrlMatch[1];
    // Check for regular img src URL
    else {
      const imgSrcMatch = htmlData.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgSrcMatch?.[1]) imageUrl = imgSrcMatch[1];
    }
  }

  // Fall back to uri-list if no image found in HTML
  if (!imageUrl && uriList) {
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i;
    if (imageExtensions.test(uriList)) imageUrl = uriList;
  }

  return imageUrl;
}

/**
 * Convert an image URL (either data URL or external URL) to a File object.
 *
 * @param imageUrl - The image URL to convert (data URL or http(s) URL)
 * @returns A File object, or null if conversion failed
 */
export async function imageUrlToFile(imageUrl: string): Promise<File | null> {
  try {
    if (imageUrl.startsWith('data:')) {
      // Convert data URL to File
      const arr = imageUrl.split(',');
      const mimeMatch = arr[0]?.match(/:(.*?);/);
      const mime = mimeMatch?.[1] ?? 'image/png';
      const bstr = atob(arr[1] ?? '');
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);

      const ext = mime.split('/')[1] || 'png';
      return new File([u8arr], `dropped-image.${ext}`, { type: mime });
    } else {
      // Fetch external image URL
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const blob = await response.blob();
      // Extract filename from URL or use default
      const urlPath = new URL(imageUrl).pathname;
      const filename = urlPath.split('/').pop() || 'dropped-image.png';
      return new File([blob], filename, { type: blob.type || 'image/png' });
    }
  } catch (err) {
    console.warn('Failed to convert image URL to file:', err);
    posthog.captureException(
      err instanceof Error ? err : new Error(String(err)),
      { source: 'renderer', operation: 'imageUrlToFile' },
    );
    return null;
  }
}
