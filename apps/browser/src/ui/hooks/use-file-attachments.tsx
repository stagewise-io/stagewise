import {
  useState,
  useCallback,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { attachmentToAttachmentAttributes } from '@ui/utils/attachment-conversions';
import type {
  Attachment,
  Mount,
} from '@shared/karton-contracts/ui/agent/metadata';
import type { ChatInputHandle } from '@ui/screens/main/sidebar/chat/_components/chat-input';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { mimeToDefaultName } from '@shared/utils/mime-to-default-name';
import { normalizePath } from '@shared/path-utils';
import posthog from 'posthog-js';

const MAX_BASE64_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * Resolve the absolute filesystem path for a File object.
 * Uses Electron's webUtils.getPathForFile() exposed via the preload bridge.
 * Returns an empty string for clipboard-pasted or programmatically constructed Files.
 */
function getFilePath(file: File): string {
  try {
    return (window as any).electron?.getPathForFile?.(file) ?? '';
  } catch {
    return '';
  }
}

/**
 * If `absolutePath` falls inside one of the workspace mounts, return the
 * mount-prefixed relative path (e.g. `"w1/src/index.ts"`).  Otherwise `null`.
 */
function tryResolveWorkspacePath(
  absolutePath: string,
  mounts: Mount[],
): string | null {
  const normalized = normalizePath(absolutePath);
  for (const mount of mounts) {
    const mountRoot = normalizePath(mount.path);
    // Ensure we match a directory boundary (trailing slash).
    const prefix = mountRoot.endsWith('/') ? mountRoot : `${mountRoot}/`;
    if (normalized.startsWith(prefix)) {
      return `${mount.prefix}/${normalized.slice(prefix.length)}`;
    }
  }
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(',');
      resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface UseFileAttachmentsOptions {
  /** Reference to the chat input for inserting attachments */
  chatInputRef?: RefObject<ChatInputHandle>;
  /** Whether to automatically insert attachments into the editor (default: true) */
  insertIntoEditor?: boolean;
  /** Agent instance ID — required for storing blobs on disk */
  agentId?: string | null;
}

export interface UseFileAttachmentsReturn {
  /** Current attachments */
  attachments: Attachment[];
  /** Add a file attachment, returns the created attachment */
  addFileAttachment: (file: File) => Promise<Attachment>;
  /** Remove an attachment by path */
  removeAttachment: (path: string) => void;
  /** Clear all attachments */
  clearAttachments: () => void;
  /** Direct state setter for advanced use cases (e.g., restoring from message) */
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
}

/**
 * Hook for managing attachment state.
 * Each consumer gets their own independent state instance.
 *
 * For external files (not in any open workspace), content is stored on disk
 * via the `agents.storeAttachment` procedure and the path becomes `att/<key>`.
 * For workspace files, the path is the mount-prefixed path directly.
 * Only lightweight metadata is kept in React state.
 */
export function useFileAttachments(
  options: UseFileAttachmentsOptions = {},
): UseFileAttachmentsReturn {
  const { chatInputRef, insertIntoEditor = true, agentId } = options;

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const storeAttachment = useKartonProcedure((p) => p.agents.storeAttachment);
  const storeAttachmentByPath = useKartonProcedure(
    (p) => p.agents.storeAttachmentByPath,
  );
  const [openAgentId] = useOpenAgent();
  const mounts = useKartonState((s) =>
    openAgentId ? (s.toolbox[openAgentId]?.workspace?.mounts ?? []) : [],
  );

  const addFileAttachment = useCallback(
    async (file: File): Promise<Attachment> => {
      const mediaType = file.type || 'application/octet-stream';
      // Only store a meaningful originalFileName. Clipboard pastes in Electron
      // produce a generic name like "image.png" or "blob"; fall back to a
      // mime-derived default in that case so the UI has something readable.
      const rawName = file.name?.trim();
      const BROWSER_PLACEHOLDER_RE =
        /^(blob|image\.png|image\.jpeg|image\.jpg|image\.gif|image\.bmp|image\.webp)$/i;
      const originalFileName: string =
        rawName && !BROWSER_PLACEHOLDER_RE.test(rawName)
          ? rawName
          : mimeToDefaultName(mediaType);

      if (!agentId) {
        // No agent yet — create a placeholder. path is set to the original name
        // as a best-effort key; the file is not stored on disk.
        // This path is uncommon; callers should always provide agentId.
        const placeholder: Attachment = {
          path: originalFileName,
          originalFileName,
        };
        setAttachments((prev) => [...prev, placeholder]);
        if (insertIntoEditor && chatInputRef?.current) {
          chatInputRef.current.insertAttachment(
            attachmentToAttachmentAttributes(placeholder),
          );
        }
        return placeholder;
      }

      const filePath = getFilePath(file);

      // If the file lives inside a mounted workspace, reference it directly
      // instead of copying it into the blob store.
      if (filePath) {
        const wsPath = tryResolveWorkspacePath(filePath, mounts);
        if (wsPath) {
          const attachment: Attachment = { path: wsPath };
          setAttachments((prev) => [...prev, attachment]);
          if (insertIntoEditor && chatInputRef?.current) {
            chatInputRef.current.insertAttachment(
              attachmentToAttachmentAttributes(attachment),
            );
          }
          return attachment;
        }
      }

      if (!filePath && file.size > MAX_BASE64_FILE_SIZE) {
        return Promise.reject(
          new Error(
            `File "${originalFileName}" (${(file.size / 1024 / 1024).toFixed(0)} MB) is too large for in-memory transfer. ` +
              'Drop the file from Finder to use zero-copy transfer.',
          ),
        );
      }

      // Send to backend — it generates the canonical filename and returns it.
      const storePromise: Promise<string> = filePath
        ? storeAttachmentByPath(agentId, originalFileName, filePath)
        : fileToBase64(file).then((base64) =>
            storeAttachment(agentId, originalFileName, base64),
          );

      const blobKey = await storePromise.catch((err: unknown) => {
        console.error(
          '[useFileAttachments] Failed to store attachment blob:',
          err,
        );
        posthog.captureException(
          err instanceof Error ? err : new Error(String(err)),
          {
            source: 'renderer',
            operation: 'storeAttachmentBlob',
            originalFileName,
            agentId,
          },
        );
        return originalFileName;
      });

      const attachment: Attachment = {
        path: `att/${blobKey}`,
        originalFileName,
      };

      setAttachments((prev) => [...prev, attachment]);

      if (insertIntoEditor && chatInputRef?.current) {
        chatInputRef.current.insertAttachment(
          attachmentToAttachmentAttributes(attachment),
        );
      }

      return attachment;
    },
    [
      chatInputRef,
      insertIntoEditor,
      agentId,
      mounts,
      storeAttachment,
      storeAttachmentByPath,
    ],
  );

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    addFileAttachment,
    removeAttachment,
    clearAttachments,
    setAttachments,
  };
}
