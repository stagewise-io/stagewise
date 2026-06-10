import { useState, useCallback, useRef } from 'react';
import { extractImageUrlFromDragData, imageUrlToFile } from '@ui/utils';
import type { AttachmentMetadata } from '@shared/karton-contracts/ui/agent/metadata';

export interface UseDragDropOptions {
  /** Callback when a file is dropped */
  onFileDrop: (file: File) => void;
  /** Callback when a workspace file is dropped by mount-prefixed path */
  onWorkspaceFileDrop?: (attachment: AttachmentMetadata) => void;
  /** Optional callback after drop completes (e.g., to focus input) */
  onDropComplete?: () => void;
}

export interface UseDragDropReturn {
  /** Whether a drag is currently over the drop zone */
  isDragOver: boolean;
  /** Event handlers to spread onto the drop zone element */
  handlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => Promise<void>;
    /** Reset drag state on drop but let event bubble (for centralized drop handling) */
    onDropBubble: (e: React.DragEvent) => void;
  };
}

/**
 * Hook for handling drag-and-drop file uploads with proper nested element support.
 *
 * Features:
 * - Counter-based drag tracking (handles dragenter/dragleave for nested elements)
 * - Supports file drops from filesystem
 * - Supports URL-based image drops (dragging images from web pages)
 * - Accepts Files and text/uri-list data transfer types
 */
export function useDragDrop(options: UseDragDropOptions): UseDragDropReturn {
  const { onFileDrop, onWorkspaceFileDrop, onDropComplete } = options;

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    const types = Array.from(e.dataTransfer.types);
    // Accept Files (from file system) OR text/uri-list (from web pages - images/links)
    if (
      types.includes('Files') ||
      types.includes('text/uri-list') ||
      types.includes('application/x-stagewise-file-path') ||
      types.includes('application/x-stagewise-file-paths')
    )
      setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;

    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      // Multi-file drop from the file tree (selected set). Falls back to the
      // single-path payload for a single dragged file.
      const draggedWorkspacePaths = e.dataTransfer.getData(
        'application/x-stagewise-file-paths',
      );
      if (draggedWorkspacePaths && onWorkspaceFileDrop) {
        try {
          const paths = JSON.parse(draggedWorkspacePaths) as string[];
          if (Array.isArray(paths) && paths.length > 0) {
            for (const path of paths) onWorkspaceFileDrop({ path });
            onDropComplete?.();
            return;
          }
        } catch {
          // Fall through to single-path handling.
        }
      }

      const draggedWorkspacePath = e.dataTransfer.getData(
        'application/x-stagewise-file-path',
      );
      if (draggedWorkspacePath && onWorkspaceFileDrop) {
        onWorkspaceFileDrop({ path: draggedWorkspacePath });
        onDropComplete?.();
        return;
      }

      const files = Array.from(e.dataTransfer.files);

      // Process dropped files from file system
      if (files.length > 0) {
        files.forEach((file) => {
          onFileDrop(file);
        });
        onDropComplete?.();
        return;
      }

      // Handle URL-based drops (images from web pages)
      const htmlData = e.dataTransfer.getData('text/html');
      const uriList = e.dataTransfer.getData('text/uri-list');
      const imageUrl = extractImageUrlFromDragData(htmlData, uriList);

      if (imageUrl) {
        const file = await imageUrlToFile(imageUrl);
        if (file) onFileDrop(file);
      }

      onDropComplete?.();
    },
    [onFileDrop, onWorkspaceFileDrop, onDropComplete],
  );

  // Reset drag state on drop but let event bubble (for centralized drop handling)
  const handleDropBubble = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Don't stopPropagation - let event bubble to parent handler
    dragCounterRef.current = 0;
    setIsDragOver(false);
  }, []);

  return {
    isDragOver,
    handlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      onDropBubble: handleDropBubble,
    },
  };
}
