import { cn, fileToDataUrl, isAnthropicSupportedFile } from '@/utils';
import type {
  ChatMessage,
  TextUIPart,
  FileUIPart,
} from '@shared/karton-contracts/ui';
import { useMemo, useCallback, memo, useState, useRef, useEffect } from 'react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { useEventListener } from '@/hooks/use-event-listener';
import { useMessageEditState } from '@/hooks/use-message-edit-state';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverFooter,
  PopoverClose,
} from '@stagewise/stage-ui/components/popover';
import { Button } from '@stagewise/stage-ui/components/button';
import { TextPart } from './message-part-ui/text';
import { SelectedElementsChips } from '@/components/selected-elements-chips';
import {
  FileAttachmentChips,
  type FileAttachmentData,
} from '@/components/file-attachment-chips';
import type { SelectedElement } from '@shared/selected-elements';
import {
  ChatInput,
  ChatInputActions,
  type ChatInputHandle,
  type FileAttachment,
} from './chat-input';
import { generateId } from 'ai';

// Stable empty arrays to avoid creating new instances in selectors
const EMPTY_SELECTED_ELEMENTS: SelectedElement[] = [];
const EMPTY_SCREENSHOTS: {
  id: string;
  elementId: string;
  dataUrl: string;
}[] = [];

/**
 * Convert a data URL to a File object
 */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0]?.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1] ?? '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

type UserMessage = ChatMessage & { role: 'user' };

export const MessageUser = memo(
  function MessageUser({
    message: msg,
    isLastMessage,
    measureRef,
  }: {
    message: UserMessage;
    isLastMessage: boolean;
    measureRef?: (el: HTMLDivElement | null) => void;
  }) {
    const chatInputRef = useRef<ChatInputHandle>(null);
    const [isEditing, setIsEditing] = useState(false);

    // Message edit state for file drop routing
    const { registerEditMode, unregisterEditMode } = useMessageEditState();

    // Procedures and state
    const undoEditsUntilUserMessage = useKartonProcedure(
      (p) => p.agentChat.undoEditsUntilUserMessage,
    );
    const sendUserMessage = useKartonProcedure(
      (p) => p.agentChat.sendUserMessage,
    );
    const activeChatId = useKartonState(
      (s) => s.agentChat?.activeChatId || null,
    );
    const isWorking = useKartonState((s) => s.agentChat?.isWorking || false);

    // Use message ID for scoping element selection
    const editMessageId = msg.id ?? null;

    // Element selector state and procedures
    // Check if THIS input's element selection is active (not just global mode)
    const elementSelectionActive = useKartonState(
      (s) =>
        s.browser.contextSelectionMode &&
        s.browser.activeSelectionMessageId === editMessageId,
    );
    const selectedElements = useKartonState((s) =>
      editMessageId
        ? s.browser.selectedElementsByMessageId[editMessageId] ||
          EMPTY_SELECTED_ELEMENTS
        : EMPTY_SELECTED_ELEMENTS,
    );
    const setElementSelectionActiveProc = useKartonProcedure(
      (p) => p.browser.contextSelection.setActive,
    );
    const setElementSelectionActive = useCallback(
      (active: boolean) => {
        if (editMessageId) {
          setElementSelectionActiveProc(active, editMessageId);
        }
      },
      [setElementSelectionActiveProc, editMessageId],
    );
    const clearSelectedElementsProc = useKartonProcedure(
      (p) => p.browser.contextSelection.clearElements,
    );
    const clearSelectedElements = useCallback(() => {
      if (editMessageId) {
        clearSelectedElementsProc(editMessageId);
      }
    }, [clearSelectedElementsProc, editMessageId]);
    const removeSelectedElementProc = useKartonProcedure(
      (p) => p.browser.contextSelection.removeElement,
    );
    const removeSelectedElement = useCallback(
      (elementId: string) => {
        if (editMessageId) {
          removeSelectedElementProc(elementId, editMessageId);
        }
      },
      [removeSelectedElementProc, editMessageId],
    );

    // Watch for pending element screenshots and auto-add as file attachments
    const pendingScreenshots = useKartonState((s) =>
      editMessageId
        ? s.browser.pendingElementScreenshotsByMessageId[editMessageId] ||
          EMPTY_SCREENSHOTS
        : EMPTY_SCREENSHOTS,
    );
    const clearPendingScreenshotsProc = useKartonProcedure(
      (p) => p.browser.contextSelection.clearPendingScreenshots,
    );
    // Track which screenshots we've already processed to avoid duplicates
    const processedScreenshotIds = useRef<Set<string>>(new Set());

    // Edit mode state
    const [editedText, setEditedText] = useState('');
    const [editedFileAttachments, setEditedFileAttachments] = useState<
      FileAttachment[]
    >([]);
    // Track selected elements during edit mode (combines original + newly selected)
    const [editedSelectedElements, setEditedSelectedElements] = useState<
      SelectedElement[]
    >([]);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    // Extract text content from message
    const textContent = useMemo(() => {
      return msg.parts
        .filter((part) => part.type === 'text')
        .map((part) => (part as TextUIPart).text)
        .join('\n');
    }, [msg.parts]);

    const selectedPreviewElements = useMemo(() => {
      return msg.metadata?.selectedPreviewElements ?? [];
    }, [msg.metadata?.selectedPreviewElements]);

    const fileAttachments = useMemo(() => {
      return msg.parts.filter((part) => part.type === 'file') as FileUIPart[];
    }, [msg.parts]);

    // Convert FileUIPart[] to FileAttachmentData[] for view mode display
    const fileAttachmentsData: FileAttachmentData[] = useMemo(
      () =>
        fileAttachments.map((filePart, index) => ({
          id: `${msg.id}-file-${index}`,
          url: filePart.url,
          filename: filePart.filename,
          mediaType: filePart.mediaType,
        })),
      [fileAttachments, msg.id],
    );

    // User messages should not be empty in normal usage
    const isEmptyMessage = useMemo(() => {
      return msg.parts.every(
        (part) =>
          part.type !== 'text' ||
          (part.type === 'text' && part.text.trim() === ''),
      );
    }, [msg.parts]);

    // Can edit when not working and message has an ID
    const canEdit = !isWorking && !!msg.id;

    // Convert FileUIPart to FileAttachment (reconstruct File from data URL)
    const convertFileUIPartToAttachment = useCallback(
      async (filePart: FileUIPart): Promise<FileAttachment> => {
        const response = await fetch(filePart.url);
        const blob = await response.blob();
        const file = new File([blob], filePart.filename, {
          type: filePart.mediaType,
        });
        // Create blob URL from the File object (not reuse data URL)
        const blobUrl = URL.createObjectURL(file);
        return {
          id: generateId(),
          file,
          url: blobUrl,
        };
      },
      [],
    );

    // Start editing
    const handleStartEditing = useCallback(async () => {
      if (!canEdit || !editMessageId) return;

      // Dispatch event to cancel any other active message edits
      window.dispatchEvent(
        new CustomEvent('message-edit-started', {
          detail: { messageId: editMessageId },
        }),
      );

      setEditedText(textContent);

      // Initialize edited selected elements with original message's selected elements
      setEditedSelectedElements(selectedPreviewElements as SelectedElement[]);

      // Clear Karton state for new element selections (will be merged with editedSelectedElements)
      clearSelectedElements();

      // Convert existing file attachments to FileAttachment format
      const convertedFiles = await Promise.all(
        fileAttachments.map(convertFileUIPartToAttachment),
      );
      setEditedFileAttachments(convertedFiles);

      setIsEditing(true);
    }, [
      canEdit,
      editMessageId,
      textContent,
      fileAttachments,
      convertFileUIPartToAttachment,
      clearSelectedElements,
      selectedPreviewElements,
    ]);

    // Cancel editing
    const handleCancelEditing = useCallback(() => {
      setIsEditing(false);
      setEditedText('');
      setEditedFileAttachments([]);
      setEditedSelectedElements([]);
      setIsConfirmOpen(false);
      setElementSelectionActive(false);
      clearSelectedElements();
    }, [setElementSelectionActive, clearSelectedElements]);

    // Submit triggers confirmation
    const handleSubmitEdit = useCallback(() => {
      if (editedText.trim().length <= 2) return;
      setIsConfirmOpen(true);
    }, [editedText]);

    // Confirm and execute the edit
    const handleConfirmEdit = useCallback(async () => {
      if (!msg.id || !activeChatId) return;

      try {
        // First, revert the history
        await undoEditsUntilUserMessage(msg.id, activeChatId);

        // Combine original edited elements with any newly selected elements
        // Use a Map to dedupe by stagewiseId
        const allElementsMap = new Map<string, SelectedElement>();
        editedSelectedElements.forEach((el) =>
          allElementsMap.set(el.stagewiseId, el),
        );
        selectedElements.forEach((el) =>
          allElementsMap.set(el.stagewiseId, el),
        );
        const allSelectedElements = Array.from(allElementsMap.values());

        // Then send the new message
        // Collect metadata for selected elements
        const metadata: Record<string, unknown> = {};
        if (allSelectedElements.length > 0) {
          metadata.selectedPreviewElements = allSelectedElements;
        }

        // Convert FileAttachments to FileUIParts (convert File to data URL)
        const fileParts: FileUIPart[] = await Promise.all(
          editedFileAttachments.map(async (attachment) => ({
            type: 'file' as const,
            mediaType: attachment.file.type,
            filename: attachment.file.name,
            url: await fileToDataUrl(attachment.file),
          })),
        );

        await sendUserMessage({
          id: generateId(),
          parts: [...fileParts, { type: 'text' as const, text: editedText }],
          role: 'user',
          metadata: {
            ...metadata,
            createdAt: new Date(),
          },
        });

        // Clean up blob URLs (only revoke blob URLs, not data URLs)
        editedFileAttachments.forEach((f) => {
          if (f.url.startsWith('blob:')) {
            URL.revokeObjectURL(f.url);
          }
        });

        // Reset edit state
        setIsEditing(false);
        setEditedText('');
        setEditedFileAttachments([]);
        setEditedSelectedElements([]);
        setIsConfirmOpen(false);
        setElementSelectionActive(false);
        clearSelectedElements();
      } catch (error) {
        console.warn('Failed to edit message:', error);
      }
    }, [
      msg.id,
      activeChatId,
      undoEditsUntilUserMessage,
      sendUserMessage,
      editedText,
      editedSelectedElements,
      selectedElements,
      editedFileAttachments,
      setElementSelectionActive,
      clearSelectedElements,
    ]);

    // Remove a selected element in edit mode
    const handleRemoveSelectedElement = useCallback(
      (elementId: string) => {
        // Remove from local edited elements state
        setEditedSelectedElements((prev) =>
          prev.filter((el) => el.stagewiseId !== elementId),
        );
        // Also remove from Karton state (for newly selected elements)
        removeSelectedElement(elementId);
      },
      [removeSelectedElement],
    );

    // File attachment handlers
    const handleAddFileAttachment = useCallback((file: File) => {
      const id = generateId();
      const url = URL.createObjectURL(file);
      setEditedFileAttachments((prev) => [...prev, { id, file, url }]);
    }, []);

    const handleRemoveFileAttachment = useCallback((id: string) => {
      setEditedFileAttachments((prev) => {
        const removed = prev.find((f) => f.id === id);
        if (removed) {
          // Only revoke blob URLs, not data URLs
          if (removed.url.startsWith('blob:')) {
            URL.revokeObjectURL(removed.url);
          }
        }
        return prev.filter((f) => f.id !== id);
      });
    }, []);

    // Auto-add pending element screenshots as file attachments during edit mode
    useEffect(() => {
      if (!isEditing || !editMessageId) return;
      if (pendingScreenshots.length === 0) return;

      // Process new screenshots
      const newScreenshots = pendingScreenshots.filter(
        (s) => !processedScreenshotIds.current.has(s.id),
      );

      if (newScreenshots.length === 0) return;

      // Add each screenshot as a file attachment
      newScreenshots.forEach((screenshot) => {
        processedScreenshotIds.current.add(screenshot.id);

        // Convert data URL to File (using JPEG format)
        const file = dataUrlToFile(
          screenshot.dataUrl,
          `element-${screenshot.elementId.slice(0, 8)}.jpg`,
        );

        // Validate file size before adding
        const validation = isAnthropicSupportedFile(file);
        if (!validation.supported) {
          console.warn(
            `[MessageUser] Skipping oversized screenshot: ${validation.reason}`,
          );
          return;
        }

        // Add as attachment
        handleAddFileAttachment(file);
      });

      // Clear processed screenshots from state
      if (editMessageId) {
        clearPendingScreenshotsProc(editMessageId);
      }
    }, [
      isEditing,
      editMessageId,
      pendingScreenshots,
      handleAddFileAttachment,
      clearPendingScreenshotsProc,
    ]);

    // Element selector toggle
    const handleToggleElementSelection = useCallback(() => {
      setElementSelectionActive(!elementSelectionActive);
    }, [elementSelectionActive, setElementSelectionActive]);

    // Clear all attachments and elements
    const handleClearAll = useCallback(() => {
      // Clear file attachments
      editedFileAttachments.forEach((f) => URL.revokeObjectURL(f.url));
      setEditedFileAttachments([]);
      // Clear edited selected elements (local state)
      setEditedSelectedElements([]);
      // Clear newly selected elements from Karton state
      clearSelectedElements();
    }, [editedFileAttachments, clearSelectedElements]);

    // Track drag-over state for visual feedback in edit mode
    const [isEditDragOver, setIsEditDragOver] = useState(false);
    const editDragCounterRef = useRef(0);

    // Handle drop events in edit mode to prevent bubbling to ChatPanel
    const handleEditDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        editDragCounterRef.current = 0;
        setIsEditDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        files.forEach((file) => {
          handleAddFileAttachment(file);
        });

        // Focus the input
        chatInputRef.current?.focus();
      },
      [handleAddFileAttachment],
    );

    const handleEditDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleEditDragEnter = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      editDragCounterRef.current++;
      if (e.dataTransfer.types.includes('Files')) {
        setIsEditDragOver(true);
      }
    }, []);

    const handleEditDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      editDragCounterRef.current--;
      if (editDragCounterRef.current === 0) {
        setIsEditDragOver(false);
      }
    }, []);

    // Focus the input when entering edit mode
    useEffect(() => {
      if (isEditing) {
        setTimeout(() => {
          chatInputRef.current?.focus();
        }, 0);
      }
    }, [isEditing]);

    // Track if input was focused before app lost focus (for restoring on app regain)
    const wasActiveBeforeAppBlurRef = useRef(false);

    const onEditInputFocus = useCallback(() => {
      // Clear the app blur flag since we're now focused
      wasActiveBeforeAppBlurRef.current = false;
    }, []);

    const onEditInputBlur = useCallback(
      (ev: React.FocusEvent<HTMLTextAreaElement, Element>) => {
        // Similar logic to panel-footer: keep focus if clicking within chat box or element selector
        const target = ev.relatedTarget as HTMLElement;
        if (target?.closest('#chat-file-attachment-menu-content')) return;

        if (
          !target ||
          (!target.closest('.message-user-edit-container') &&
            !target.closest('#element-selector-element-canvas'))
        ) {
          // If relatedTarget is null, the app might be losing focus (e.g., CMD+tab)
          // Track this so we can restore focus when the app regains focus
          if (!target && isEditing) wasActiveBeforeAppBlurRef.current = true;
        } else if (isEditing) chatInputRef.current?.focus();
      },
      [isEditing],
    );

    // Restore focus when the app regains focus (e.g., after CMD+tab back)
    useEventListener(
      'focus',
      () => {
        if (isEditing && wasActiveBeforeAppBlurRef.current) {
          wasActiveBeforeAppBlurRef.current = false;
          chatInputRef.current?.focus();
        }
      },
      {},
      window,
    );

    // Global escape key handler for edit mode
    useEffect(() => {
      if (!isEditing) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          handleCancelEditing();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isEditing, handleCancelEditing]);

    // Cancel edit when main chat input is focused
    useEventListener('cancel-all-message-edits', () => {
      if (isEditing) {
        handleCancelEditing();
      }
    });

    // Cancel edit when another message starts editing
    useEventListener(
      'message-edit-started',
      (e: CustomEvent<{ messageId: string }>) => {
        if (isEditing && e.detail.messageId !== editMessageId) {
          handleCancelEditing();
        }
      },
    );

    // Register/unregister edit mode for file drop routing
    useEffect(() => {
      if (isEditing && editMessageId) {
        // Register with a callback that handles dropped files
        registerEditMode(editMessageId, (files) => {
          files.forEach((file) => handleAddFileAttachment(file));
          chatInputRef.current?.focus();
        });
      }
      return () => {
        if (editMessageId) {
          unregisterEditMode(editMessageId);
        }
      };
    }, [
      isEditing,
      editMessageId,
      handleAddFileAttachment,
      registerEditMode,
      unregisterEditMode,
    ]);

    // Can send when text is long enough
    const canSendMessage = editedText.trim().length > 2;

    // Check if on internal page (for element selector)
    const activeTabId = useKartonState((s) => s.browser.activeTabId);
    const tabs = useKartonState((s) => s.browser.tabs);
    const activeTab = useMemo(() => {
      return tabs[activeTabId];
    }, [tabs, activeTabId]);

    const hasOpenedInternalPage = useMemo(() => {
      return activeTab?.url?.startsWith('stagewise://internal/') ?? false;
    }, [activeTab?.url]);

    // Combine edited selected elements with newly selected elements for edit mode display
    // Must be before any early returns to satisfy hooks rules
    const combinedSelectedElements = useMemo(() => {
      const elementsMap = new Map<string, SelectedElement>();
      editedSelectedElements.forEach((el) =>
        elementsMap.set(el.stagewiseId, el),
      );
      selectedElements.forEach((el) => elementsMap.set(el.stagewiseId, el));
      return Array.from(elementsMap.values());
    }, [editedSelectedElements, selectedElements]);

    if (isEmptyMessage && !isLastMessage) return null;

    // Edit mode rendering
    if (isEditing) {
      return (
        <div
          className={cn('flex w-full flex-col gap-1')}
          onDrop={handleEditDrop}
          onDragOver={handleEditDragOver}
          onDragEnter={handleEditDragEnter}
          onDragLeave={handleEditDragLeave}
        >
          <div ref={measureRef} className="w-full">
            <div
              className={cn(
                'mt-2 flex w-full shrink-0 flex-row-reverse items-stretch justify-start gap-1',
              )}
            >
              {/* Edit mode container styled like user message */}
              <div
                className={cn(
                  'message-user-edit-container relative flex w-full flex-row items-stretch gap-1 rounded-md bg-background p-2 shadow-[0_0_6px_0_rgba(0,0,0,0.05),0_-6px_48px_-24px_rgba(0,0,0,0.08)] ring-1 ring-derived transition-colors before:absolute before:inset-0 before:rounded-lg dark:bg-surface-1',
                  isEditDragOver && 'bg-hover-derived!',
                )}
              >
                <ChatInput
                  ref={chatInputRef}
                  value={editedText}
                  onChange={setEditedText}
                  onSubmit={handleSubmitEdit}
                  onEscape={handleCancelEditing}
                  placeholder="Edit your message..."
                  showModelSelect
                  onModelChange={() => chatInputRef.current?.focus()}
                  showContextUsageRing={false}
                  fileAttachments={editedFileAttachments}
                  onRemoveFileAttachment={handleRemoveFileAttachment}
                  onAddFileAttachment={handleAddFileAttachment}
                  selectedElements={combinedSelectedElements}
                  onRemoveSelectedElement={handleRemoveSelectedElement}
                  onClearAll={handleClearAll}
                  onFocus={onEditInputFocus}
                  onBlur={onEditInputBlur}
                  className="w-full"
                />
                <div className="relative flex shrink-0 flex-col items-center justify-end gap-1">
                  {/* ChatInputActions without stop button */}
                  <ChatInputActions
                    showStopButton={false}
                    showElementSelectorButton
                    elementSelectionActive={elementSelectionActive}
                    onToggleElementSelection={handleToggleElementSelection}
                    elementSelectorDisabled={hasOpenedInternalPage}
                    showImageUploadButton
                    onAddFileAttachment={handleAddFileAttachment}
                    canSendMessage={canSendMessage}
                    onSubmit={handleSubmitEdit}
                    isActive
                  />
                  {/* Popover anchor positioned at the send button */}
                  <Popover open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                    <PopoverTrigger>
                      <span className="pointer-events-none absolute right-0 bottom-0 size-8" />
                    </PopoverTrigger>
                    <PopoverContent>
                      <PopoverTitle>Resend message?</PopoverTitle>
                      <PopoverDescription>
                        This will clear the chat history and undo file changes
                        after this point, then send your edited message.
                      </PopoverDescription>
                      <PopoverClose />
                      <PopoverFooter>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setIsConfirmOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={handleConfirmEdit}
                        >
                          Resend
                        </Button>
                      </PopoverFooter>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // View mode rendering
    return (
      <div className={cn('flex w-full flex-col gap-1')}>
        {/* measureRef wraps just the content, NOT the min-h element, to avoid circular measurement */}
        <div ref={measureRef} className="w-full">
          <div
            className={cn(
              'group/chat-bubble mt-2 flex w-full shrink-0 flex-row-reverse items-center justify-start gap-2',
              isEmptyMessage ? 'hidden' : '',
            )}
          >
            <div
              className={cn(
                'group group/chat-bubble-user wrap-break-word relative min-h-8 max-w-xl origin-bottom-right select-text space-y-2 rounded-lg rounded-br-sm border border-derived-subtle bg-surface-tinted px-2.5 py-1.5 font-normal text-foreground text-sm last:mb-0.5',
                canEdit && 'cursor-pointer hover:border-primary/30',
              )}
              onClick={canEdit ? handleStartEditing : undefined}
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onKeyDown={
                canEdit
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleStartEditing();
                      }
                    }
                  : undefined
              }
            >
              {msg.parts.map((part, index) => {
                const stableKey = `${msg.id}:${part.type}:${index}`;

                if (part.type === 'text') {
                  if ((part as TextUIPart).text.trim() === '') return null;
                  return (
                    <TextPart
                      key={stableKey}
                      part={part as TextUIPart}
                      messageRole="user"
                    />
                  );
                }
                return null;
              })}

              {(fileAttachments.length > 0 ||
                selectedPreviewElements.length > 0) && (
                <div className="flex flex-row flex-wrap gap-2 pt-2">
                  {/* View-only file attachment display (no delete callback) */}
                  <FileAttachmentChips
                    fileAttachments={fileAttachmentsData}
                    className="bg-surface-tinted"
                  />
                  <SelectedElementsChips
                    className="bg-surface-tinted"
                    selectedElements={
                      selectedPreviewElements as SelectedElement[]
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
  // Custom comparison to prevent re-renders when message object references change
  (prevProps, nextProps) => {
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    // Check if measureRef presence changed (for height tracking)
    if (!!prevProps.measureRef !== !!nextProps.measureRef) return false;
    if (prevProps.message.parts.length !== nextProps.message.parts.length)
      return false;

    // Deep compare parts by type and key content
    for (let i = 0; i < prevProps.message.parts.length; i++) {
      const prevPart = prevProps.message.parts[i];
      const nextPart = nextProps.message.parts[i];
      if (!prevPart || !nextPart) return false;
      if (prevPart.type !== nextPart.type) return false;

      // For text parts, compare text and state
      if (prevPart.type === 'text' && nextPart.type === 'text') {
        if (prevPart.text !== nextPart.text) return false;
        if (prevPart.state !== nextPart.state) return false;
      }
    }

    return true;
  },
);
