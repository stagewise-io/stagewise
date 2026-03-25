import posthog from 'posthog-js';
import { selectedElementToAttachmentAttributes } from '@ui/utils/attachment-conversions';
import {
  enrichTipTapContent,
  markdownToTipTapContent,
} from '@ui/utils/tiptap-content-utils';
import { cn, collectUserMessageMetadata } from '@ui/utils';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';

import {
  useMemo,
  useCallback,
  memo,
  useState,
  useRef,
  useEffect,
  type RefObject,
} from 'react';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useEventListener } from '@ui/hooks/use-event-listener';
import { useMessageEditState } from '@ui/hooks/use-message-edit-state';
import { MessageAttachmentsProvider } from '@ui/hooks/use-message-elements';
import { useFileAttachments } from '@ui/hooks/use-file-attachments';
import { useDragDrop } from '@ui/hooks/use-drag-drop';
import { useElementSelectionWatcher } from '@ui/hooks/use-element-selection-watcher';
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
import type { SelectedElement } from '@shared/selected-elements';
import {
  ChatInput,
  ChatInputActions,
  type ChatInputHandle,
} from './chat-input';
import { ChatInputViewOnly } from './chat-input-view-only';
import { generateId } from 'ai';
import type { AttachmentType } from './rich-text/attachments';
import type { MentionContext } from './rich-text/mentions';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import type { Content } from '@tiptap/core';
import { IconMagicWandSparkle } from 'nucleo-micro-bold';
import { MessageUserPlanAction } from './message-user-plan-action';

type UserMessage = AgentMessage & { role: 'user' };

export const MessageUser = memo(
  function MessageUser({
    message: msg,
    isLastMessage,
    measureRef,
    isWorking,
    hasSubsequentFileModifications,
  }: {
    message: UserMessage;
    isLastMessage: boolean;
    measureRef?: (el: HTMLDivElement | null) => void;
    isWorking: boolean;
    hasSubsequentFileModifications?: boolean;
  }) {
    const chatInputRef = useRef<ChatInputHandle>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [openAgent] = useOpenAgent();

    // File attachments via shared hook
    const {
      fileAttachments: editedFileAttachments,
      addFileAttachment,
      removeFileAttachment,
      clearFileAttachments,
      setFileAttachments: setEditedFileAttachments,
    } = useFileAttachments({
      chatInputRef: chatInputRef as RefObject<ChatInputHandle>,
      insertIntoEditor: true,
      agentId: openAgent,
    });

    // Message edit state for file drop routing and exposing local elements
    const { registerEditMode, unregisterEditMode } = useMessageEditState();

    // Procedures and state
    const replaceUserMessage = useKartonProcedure(
      (p) => p.agents.replaceUserMessage,
    );

    // Use message ID for scoping element selection
    const editMessageId = msg.id;

    const [selectedElementsFromEditor, setSelectedElementsFromEditor] =
      useState<SelectedElement[]>([]);

    // Element selector state and procedures
    // Check if THIS input's element selection is active (not just global mode)
    const slashCommands = useKartonState((s) => s.commands);

    const elementSelectionActive = useKartonState(
      (s) => s.browser.contextSelectionMode,
    );
    const selectedElementsFromWebcontents = useKartonState(
      (s) => s.browser.selectedElements,
    );
    const setElementSelectionActiveProc = useKartonProcedure(
      (p) => p.browser.contextSelection.setActive,
    );
    const setElementSelectionActive = useCallback(
      (active: boolean) => {
        setElementSelectionActiveProc(active);
      },
      [setElementSelectionActiveProc],
    );
    const clearSelectedElementsProc = useKartonProcedure(
      (p) => p.browser.contextSelection.clearElements,
    );
    const clearSelectedElements = useCallback(() => {
      clearSelectedElementsProc();
    }, [clearSelectedElementsProc]);
    const removeSelectedElement = useKartonProcedure(
      (p) => p.browser.contextSelection.removeElement,
    );

    const searchMentionFiles = useKartonProcedure(
      (p) => p.toolbox.searchMentionFiles,
    );

    // Edit mode state with mention IDs
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    // Store tiptap content when submit is clicked (before confirmation popover)
    const [pendingTiptapContent, setPendingTiptapContent] =
      useState<Content | null>(null);

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

    // Extract markdown text from message parts
    const markdownText = useMemo(() => {
      const textPart = msg.parts.find((part) => part.type === 'text');
      return textPart?.type === 'text' ? textPart.text : '';
    }, [msg.parts]);

    // Convert markdown to TipTap JSON for view mode (memoized to avoid re-conversion on every render)
    const viewModeTipTapContent = useMemo(
      () => markdownToTipTapContent(markdownText),
      [markdownText],
    );

    // Start editing - initialize the editor with message content
    const handleStartEditing = useCallback(() => {
      if (!canEdit || !editMessageId) return;

      // Dispatch event to cancel any other active message edits
      window.dispatchEvent(
        new CustomEvent('message-edit-started', {
          detail: { messageId: editMessageId },
        }),
      );

      msg.metadata?.selectedPreviewElements?.forEach((element) => {
        setSelectedElementsFromEditor((prev) => [
          ...prev,
          element as SelectedElement,
        ]);
      });

      // Clear Karton state for new element selections
      clearSelectedElements();

      // Use file attachments directly from message metadata (preserves original IDs)
      // Note: msg.parts only contains text, files are stored in metadata.fileAttachments
      const existingFileAttachments = msg.metadata?.fileAttachments ?? [];

      setEditedFileAttachments(existingFileAttachments);

      setIsEditing(true);

      // Convert markdown text to TipTap JSON, then inject full attachment data
      // from the message metadata so clip content is available in the editor nodes
      const tiptapContent = markdownToTipTapContent(markdownText);
      const enrichedContent = enrichTipTapContent(tiptapContent, {
        textClipAttachments: msg.metadata?.textClipAttachments,
      });
      setPendingTiptapContent(enrichedContent);

      // Focus the editor (will be available after state update triggers re-render)
      setTimeout(() => chatInputRef.current?.focus(), 0);
    }, [
      canEdit,
      editMessageId,
      msg.metadata?.fileAttachments,
      msg.metadata?.textClipAttachments,
      clearSelectedElements,
      markdownText,
    ]);

    // Cancel editing
    const handleCancelEditing = useCallback(() => {
      setPendingTiptapContent(null);

      setIsEditing(false);
      clearFileAttachments();
      setIsConfirmOpen(false);
      setElementSelectionActive(false);
      clearSelectedElements();
      setSelectedElementsFromEditor([]);
    }, []);

    const handleConfirmEdit = useCallback(
      async (undoToolCalls: boolean) => {
        if (!msg.id || !openAgent) {
          return;
        }

        // Generate ID early so we can reference it in error handling
        const newMessageId = generateId();

        try {
          const combinedSelectedElements = [
            ...selectedElementsFromWebcontents,
            ...selectedElementsFromEditor,
          ];

          // Collect metadata for selected elements
          // Note: textClipAttachments from extractTextClipsFromTiptapContent will have empty content
          // because the TipTap JSON only stores IDs (content is looked up from context at render time)
          const metadata = collectUserMessageMetadata(
            combinedSelectedElements,
            pendingTiptapContent,
          );

          // Merge text clip attachments from two sources:
          // 1. Preserved originals: clips from the original message metadata that
          //    are still referenced in the edited content (have full content)
          // 2. Newly pasted clips: freshly pasted during editing (have full content
          //    from the paste plugin, content.length > 0)
          // Re-parsed clips from markdown round-trip have content === '' and are excluded.
          const originalTextClips = msg.metadata?.textClipAttachments ?? [];
          const extractedClips = metadata.textClipAttachments ?? [];
          const textClipIdsInContent = new Set(
            extractedClips.map((tc) => tc.id),
          );
          const preservedTextClips = originalTextClips.filter((tc) =>
            textClipIdsInContent.has(tc.id),
          );
          const preservedClipIds = new Set(
            preservedTextClips.map((tc) => tc.id),
          );
          const newlyPastedClips = extractedClips.filter(
            (tc) => !preservedClipIds.has(tc.id) && tc.content.length > 0,
          );
          const mergedTextClips = [...preservedTextClips, ...newlyPastedClips];

          if (!chatInputRef.current) {
            return;
          }

          const markdownText = chatInputRef.current.getTextContent().trim();

          // Build the new message object
          const newMessage: AgentMessage & { role: 'user' } = {
            id: newMessageId,
            parts: [
              {
                type: 'text' as const,
                text: markdownText,
              },
            ],
            role: 'user',
            metadata: {
              ...metadata,
              fileAttachments: editedFileAttachments,
              textClipAttachments:
                mergedTextClips.length > 0 ? mergedTextClips : undefined,
            },
          };

          // Exit edit mode before dispatch so the reused component instance
          // (same Virtuoso key) renders in view mode immediately.
          setIsEditing(false);

          // Dispatch event for optimistic UI - shows edited message immediately
          // and hides the old message + subsequent messages
          window.dispatchEvent(
            new CustomEvent('chat-message-edited', {
              detail: { replacedMessageId: msg.id, newMessage },
            }),
          );

          // Single atomic operation - replaces old message with new one
          // This prevents race conditions where the component unmounts between
          // revert and send operations
          // Note: We no longer store tipTapContent - the text part contains markdown
          // with attachment links (e.g., [](att:abc123))
          await replaceUserMessage(
            openAgent,
            msg.id,
            newMessage,
            undoToolCalls,
          );

          // Note: State cleanup is minimal since component will unmount after replaceUserMessage
          // The atomic operation completes before state updates trigger re-render
        } catch (error) {
          console.warn('Failed to edit message:', error);
          posthog.captureException(
            error instanceof Error ? error : new Error(String(error)),
            { source: 'renderer', operation: 'editChatMessage' },
          );
          // Remove the optimistic message on failure
          window.dispatchEvent(
            new CustomEvent('chat-message-failed', {
              detail: { clientId: newMessageId },
            }),
          );
          // On error, close popover but stay in edit mode so user can retry
          setIsConfirmOpen(false);
        }
      },
      [
        msg.id,
        openAgent,
        replaceUserMessage,
        selectedElementsFromWebcontents,
        selectedElementsFromEditor,
        editedFileAttachments,
        pendingTiptapContent,
      ],
    );

    const handleSubmitEdit = useCallback(() => {
      const textContent = chatInputRef.current?.getTextContent().trim();
      if ((textContent?.length ?? 0) <= 2) return;
      if (hasSubsequentFileModifications) {
        setIsConfirmOpen(true);
      } else {
        void handleConfirmEdit(false);
      }
    }, [hasSubsequentFileModifications, handleConfirmEdit]);

    // Handle files pasted in editor
    const handlePasteFiles = useCallback(
      (files: File[]) => {
        files.forEach((file) => {
          addFileAttachment(file);
        });
      },
      [addFileAttachment],
    );

    const handleRemoveAttachment = useCallback(
      (id: string, type: AttachmentType) => {
        if (type === 'attachment') {
          removeFileAttachment(id);
        } else if (type === 'element') {
          removeSelectedElement(id);
          setSelectedElementsFromEditor((prev) =>
            prev.filter((el) => el.stagewiseId !== id),
          );
        }
      },
      [removeFileAttachment, removeSelectedElement],
    );

    // Watch for selected elements via shared hook
    useElementSelectionWatcher({
      isActive: isEditing,
      onNewElement: useCallback(
        (element: SelectedElement) => {
          const attrs = selectedElementToAttachmentAttributes(element);
          chatInputRef.current?.insertAttachment(attrs);
        },
        [chatInputRef],
      ),
    });

    // Element selector toggle
    const handleToggleElementSelection = useCallback(() => {
      setElementSelectionActive(!elementSelectionActive);
    }, [elementSelectionActive, setElementSelectionActive]);

    // Drag and drop via shared hook
    const { isDragOver: isEditDragOver, handlers: editDragHandlers } =
      useDragDrop({
        onFileDrop: addFileAttachment,
        onDropComplete: () => chatInputRef.current?.focus(),
      });

    // Focus the input when entering edit mode
    useEffect(() => {
      if (!isEditing) return;
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 0);
    }, [isEditing]);

    // Track if input was focused before app lost focus (for restoring on app regain)
    const wasActiveBeforeAppBlurRef = useRef(false);

    const onEditInputFocus = useCallback(() => {
      // Clear the app blur flag since we're now focused
      wasActiveBeforeAppBlurRef.current = false;
    }, []);

    const onEditInputBlur = useCallback(
      (ev: FocusEvent) => {
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
      if (isEditing) handleCancelEditing();
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

    // Register/unregister edit mode for drop event routing
    useEffect(() => {
      if (isEditing && editMessageId) {
        // Register the useDragDrop handler so forwarded events get the same processing
        registerEditMode(editMessageId, editDragHandlers.onDrop);
      }
      return () => {
        if (editMessageId) {
          unregisterEditMode(editMessageId);
        }
      };
    }, [
      isEditing,
      editMessageId,
      editDragHandlers.onDrop,
      registerEditMode,
      unregisterEditMode,
    ]);

    // Check if on internal page (for element selector)
    const activeTabId = useKartonState((s) => s.browser.activeTabId);
    const tabs = useKartonState((s) => s.browser.tabs);
    const activeTab = useMemo(() => {
      if (!activeTabId) return null;
      return tabs[activeTabId];
    }, [tabs, activeTabId]);

    const hasOpenedInternalPage = useMemo(() => {
      return activeTab?.url?.startsWith('stagewise://internal/') ?? false;
    }, [activeTab?.url]);

    const mentionMounts = useKartonState((s) =>
      openAgent
        ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
        : EMPTY_MOUNTS,
    );

    const mentionContext = useMemo<MentionContext>(
      () => ({
        agentInstanceId: openAgent,
        searchFiles: searchMentionFiles,
        tabs,
        activeTabId,
        mounts: mentionMounts,
      }),
      [openAgent, searchMentionFiles, tabs, activeTabId, mentionMounts],
    );

    // Count total attachments for display
    const totalAttachments =
      editedFileAttachments.length + selectedElementsFromWebcontents.length;

    // Combine all available elements for the preview card to access
    // In view mode: from message metadata
    // In edit mode: from local state + Karton state
    const allAvailableElements = useMemo(() => {
      const metadataElements =
        (msg.metadata?.selectedPreviewElements as SelectedElement[]) ?? [];
      if (isEditing) {
        // During editing, combine all sources (deduped by stagewiseId)
        const combined = [
          ...metadataElements,
          ...selectedElementsFromEditor,
          ...selectedElementsFromWebcontents,
        ];
        const seen = new Set<string>();
        return combined.filter((el) => {
          if (!el.stagewiseId) return false;
          if (seen.has(el.stagewiseId)) return false;
          seen.add(el.stagewiseId);
          return true;
        });
      }
      // In view mode, just use metadata
      return metadataElements;
    }, [
      msg.metadata?.selectedPreviewElements,
      isEditing,
      selectedElementsFromEditor,
      selectedElementsFromWebcontents,
    ]);

    // File attachments: use edited state during editing, otherwise from metadata
    const allFileAttachments = useMemo(() => {
      if (isEditing) {
        return editedFileAttachments;
      }
      return msg.metadata?.fileAttachments ?? [];
    }, [isEditing, editedFileAttachments, msg.metadata?.fileAttachments]);

    // Text clip attachments: always from metadata (not editable separately)
    const allTextClipAttachments = msg.metadata?.textClipAttachments;

    // Implement command messages get a custom card instead of a text bubble
    const hasImplementCommand = msg.parts.some(
      (p) =>
        p.type === 'text' &&
        typeof p.text === 'string' &&
        /\(slash:implement\)/.test(p.text),
    );

    if (isEmptyMessage && !hasImplementCommand && !isLastMessage) return null;

    // Conditional rendering: view-only mode uses lightweight renderer, edit mode uses full TipTap
    return (
      <MessageAttachmentsProvider
        elements={allAvailableElements}
        fileAttachments={allFileAttachments}
        textClipAttachments={allTextClipAttachments}
      >
        <div
          className={cn('flex w-full flex-col gap-1')}
          onDrop={isEditing ? editDragHandlers.onDropBubble : undefined} // Reset drag state, let event bubble to ChatPanel
          onDragOver={isEditing ? editDragHandlers.onDragOver : undefined}
          onDragEnter={isEditing ? editDragHandlers.onDragEnter : undefined}
          onDragLeave={isEditing ? editDragHandlers.onDragLeave : undefined}
        >
          {msg.metadata?.compressedHistory && (
            <div
              key={`compact-${msg.id}`}
              className="mt-2 flex w-full flex-row items-center gap-2 text-xs"
            >
              <IconMagicWandSparkle className="size-3 text-muted-foreground" />
              <span className="shimmer-duration-1500 shimmer-from-muted-foreground shimmer-text-once shimmer-to-foreground font-normal">
                Compressed previous conversation
              </span>
            </div>
          )}
          <div ref={measureRef} className="w-full">
            {/* Implement command card — compact full-width indicator */}
            {hasImplementCommand && !isEditing && (
              <MessageUserPlanAction
                onEdit={canEdit ? handleStartEditing : undefined}
              />
            )}
            <div
              className={cn(
                'mt-2 flex w-full shrink-0 flex-row-reverse items-stretch justify-start gap-1',
                isEmptyMessage || (hasImplementCommand && !isEditing)
                  ? 'hidden'
                  : '',
              )}
            >
              {/* Container with conditional styling for view/edit modes */}
              <div
                className={cn(
                  'message-user-edit-container relative flex flex-row items-stretch gap-1 overflow-y-hidden',
                  // Edit mode: full width input field style
                  isEditing &&
                    'w-full rounded-md bg-background p-2 shadow-[0_0_6px_0_rgba(0,0,0,0.05),0_-6px_48px_-24px_rgba(0,0,0,0.08)] ring-1 ring-derived-strong before:absolute before:inset-0 before:rounded-lg dark:bg-surface-1',
                  isEditing && isEditDragOver && 'bg-hover-derived!',
                  !isEditing &&
                    'group wrap-break-word max-w-xl origin-bottom-right select-text rounded-lg rounded-br-sm border border-derived bg-surface-1 px-2.5 py-1.5 font-normal text-foreground text-sm last:mb-0.5 dark:bg-surface-tinted',
                  !isEditing &&
                    canEdit &&
                    'group/chat-message-user cursor-pointer hover:bg-hover-derived active:bg-active-derived',
                )}
                onClick={!isEditing && canEdit ? handleStartEditing : undefined}
                role={!isEditing && canEdit ? 'button' : undefined}
                tabIndex={!isEditing && canEdit ? 0 : undefined}
                onKeyDown={
                  !isEditing && canEdit
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleStartEditing();
                        }
                      }
                    : undefined
                }
              >
                {/* View mode: lightweight static renderer */}
                {!isEditing && (
                  <ChatInputViewOnly
                    tipTapContent={viewModeTipTapContent}
                    className="w-full"
                  />
                )}
                {/* Edit mode: full TipTap editor */}
                {isEditing && (
                  <>
                    <ChatInput
                      ref={chatInputRef as RefObject<ChatInputHandle>}
                      defaultValue={pendingTiptapContent}
                      onChange={setPendingTiptapContent}
                      onSubmit={handleSubmitEdit}
                      onEscape={handleCancelEditing}
                      placeholder="Edit your message..."
                      showModelSelect
                      showWorkspaceSelect={false}
                      onModelChange={() => chatInputRef.current?.focus()}
                      showContextUsageRing={false}
                      attachmentCount={totalAttachments}
                      onFocus={onEditInputFocus}
                      onBlur={onEditInputBlur}
                      onPasteFiles={handlePasteFiles}
                      onAttachmentRemoved={handleRemoveAttachment}
                      mentionContext={mentionContext}
                      slashCommands={slashCommands}
                      className="w-full"
                    />
                    {/* Action buttons */}
                    <div className="relative flex shrink-0 flex-col items-center justify-end gap-1">
                      <ChatInputActions
                        isAgentWorking={false}
                        showElementSelectorButton
                        elementSelectionActive={elementSelectionActive}
                        onToggleElementSelection={handleToggleElementSelection}
                        elementSelectorDisabled={hasOpenedInternalPage}
                        showImageUploadButton
                        onAddFileAttachment={addFileAttachment}
                        canSendMessage={
                          (chatInputRef.current?.getTextContent()?.trim()
                            ?.length ?? 0) > 2
                        }
                        onSubmit={handleSubmitEdit}
                      />
                      {/* Popover anchor positioned at the send button */}
                      <Popover
                        open={isConfirmOpen}
                        onOpenChange={setIsConfirmOpen}
                      >
                        <PopoverTrigger nativeButton={false}>
                          <span className="pointer-events-none absolute right-0 bottom-0 size-8" />
                        </PopoverTrigger>
                        <PopoverContent>
                          <PopoverTitle>Keep or revert files?</PopoverTitle>
                          <PopoverDescription>
                            Do you want to revert file changes made after this
                            message?
                          </PopoverDescription>
                          <PopoverClose />
                          <PopoverFooter>
                            <Button
                              variant="primary"
                              size="xs"
                              onClick={() => handleConfirmEdit(true)}
                              autoFocus
                            >
                              Revert files
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleConfirmEdit(false)}
                            >
                              Keep
                            </Button>
                          </PopoverFooter>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </MessageAttachmentsProvider>
    );
  },
  // Custom comparison to prevent re-renders when message object references change
  (prevProps, nextProps) => {
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    if (prevProps.isWorking !== nextProps.isWorking) return false;
    if (!!prevProps.measureRef !== !!nextProps.measureRef) return false;
    if (
      prevProps.hasSubsequentFileModifications !==
      nextProps.hasSubsequentFileModifications
    )
      return false;
    if (prevProps.message.parts.length !== nextProps.message.parts.length)
      return false;

    for (let i = 0; i < prevProps.message.parts.length; i++) {
      const prevPart = prevProps.message.parts[i];
      const nextPart = nextProps.message.parts[i];
      if (!prevPart || !nextPart) return false;
      if (prevPart.type !== nextPart.type) return false;

      if (prevPart.type === 'text' && nextPart.type === 'text') {
        if (prevPart.text !== nextPart.text) return false;
        if (prevPart.state !== nextPart.state) return false;
      }
    }

    return true;
  },
);
