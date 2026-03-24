import { useEditor, EditorContent, type Content } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ModelSelect } from './model-select';
import { WorkspaceSelect } from './workspace-select';
import { ContextUsageRing } from './context-usage-ring';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@ui/utils';
import { HotkeyActions } from '@shared/hotkeys';
import {
  ArrowUpIcon,
  SquareIcon,
  SquareDashedMousePointerIcon,
  ImageUpIcon,
} from 'lucide-react';
import {
  useCallback,
  useMemo,
  useImperativeHandle,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyComboText } from '@ui/components/hotkey-combo-text';
import {
  configureAttachmentExtensions,
  ALL_ATTACHMENT_NODE_NAMES,
  type AttachmentAttributes,
  type AttachmentType,
} from './rich-text/attachments';
import {
  MentionExtension,
  mentionSuggestionActive,
  mentionContextRef,
  type MentionContext,
} from './rich-text/mentions';
import {
  SlashExtension,
  slashSuggestionActive,
  slashCommandsRef,
} from './rich-text/slash';
import type { CommandDefinitionUI } from '@shared/commands';
import { useState, memo } from 'react';
// Re-export types for convenience
export type { AttachmentAttributes, AttachmentType };

export interface ChatInputProps {
  // Core controlled input
  value?: Content; // TipTap JSON content string
  defaultValue?: Content; // TipTap JSON content string
  onChange?: (TipTapContent: Content) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;

  // Attachment count for display
  attachmentCount?: number;

  // Model selector
  showModelSelect?: boolean;
  onModelChange?: () => void;

  // Workspace selector
  showWorkspaceSelect?: boolean;
  onWorkspaceChange?: () => void;

  // Context usage ring
  showContextUsageRing?: boolean;
  contextUsedPercentage?: number;
  contextUsedKb?: number;
  contextMaxKb?: number;

  // Queued messages (for early flushing)
  hasQueuedMessages?: boolean;
  onFlushQueue?: () => void;

  // Focus management
  onFocus?: () => void;
  onBlur?: (event: FocusEvent) => void;
  onEscape?: () => void;

  // File paste handling
  onPasteFiles?: (files: File[]) => void;

  // Attachment removal callback (when badges are deleted from editor)
  onAttachmentRemoved?: (id: string, type: AttachmentType) => void;

  // Mention provider context (Karton state bridge)
  mentionContext?: MentionContext;

  // Slash command definitions (from Karton state)
  slashCommands?: CommandDefinitionUI[];

  // Styling
  className?: string;

  ref: React.RefObject<ChatInputHandle>;
}

export interface ChatInputHandle {
  focus: () => void;
  blur: () => void;
  /** Insert an attachment mention at the current cursor position */
  insertAttachment: (attrs: AttachmentAttributes) => void;
  getTextContent: () => string;
  /** Get the current TipTap JSON content as a string */
  getJsonContent: () => string;
  /** Clear all editor content */
  clear: () => void;
}

export const ChatInput = ({
  value,
  defaultValue,
  onChange,
  onSubmit,
  disabled = false,
  placeholder,
  attachmentCount: _attachmentCount = 0,

  showModelSelect = true,
  onModelChange,

  showWorkspaceSelect = true,
  onWorkspaceChange,

  showContextUsageRing = false,
  contextUsedPercentage = 0,
  contextUsedKb = 0,
  contextMaxKb = 0,

  hasQueuedMessages = false,
  onFlushQueue,

  onFocus,
  onBlur,
  onEscape,
  onPasteFiles,
  onAttachmentRemoved,

  mentionContext,
  slashCommands,

  className,
  ref,
}: ChatInputProps) => {
  const focusChatHotkeyText = HotkeyComboText({
    action: HotkeyActions.TOGGLE_CONTEXT_SELECTOR,
  });

  const shownPlaceholder = useRef('');
  useEffect(() => {
    shownPlaceholder.current =
      placeholder ??
      `Ask anything about this page ${focusChatHotkeyText}${hasQueuedMessages ? ', or press ↵ to send now' : ''}`;
  }, [placeholder, focusChatHotkeyText, hasQueuedMessages]);
  const staticPlaceholderRef = useRef(() => shownPlaceholder.current);

  const [textContent, setTextContent] = useState<string>('');

  // Track if the last change was from the editor (internal) vs from props (external)
  // This prevents the value effect from overwriting user edits
  const isInternalChangeRef = useRef(false);

  const [internalValue, setInternalValue] = useState<Content | null>(
    value ?? defaultValue ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  );
  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  // TipTap editor setup
  const editor = useEditor({
    enableInputRules: false,
    enablePasteRules: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        dropcursor: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        link: false,
        paragraph: {
          HTMLAttributes: {
            class: 'min-h-[1.5em]',
          },
        },
      }),
      Placeholder.configure({
        placeholder: staticPlaceholderRef.current,
      }),
      ...configureAttachmentExtensions({
        onNodeDeleted: onAttachmentRemoved,
      }),
      MentionExtension,
      SlashExtension,
    ],
    content: internalValue,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          'h-full w-full resize-none text-foreground text-sm outline-none',
          'prose prose-sm max-w-none',
          // Style paragraphs to not have extra margins
          '[&_p]:m-0 [&_p]:leading-relaxed',
        ),
      },
      handleKeyDown: (view, event) => {
        // Handle Enter without Shift for submit
        if (event.key === 'Enter' && !event.shiftKey) {
          if (mentionSuggestionActive.current || slashSuggestionActive.current)
            return false;
          event.preventDefault();
          // If input is empty and there are queued messages, flush the queue
          const isEmpty = view.state.doc.textContent.trim().length === 0;
          if (isEmpty && hasQueuedMessages && onFlushQueue) {
            onFlushQueue();
          } else {
            handleSubmit();
          }
          return true;
        }
        // Handle Escape
        if (event.key === 'Escape') {
          event.preventDefault();
          onEscape?.();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items || !onPasteFiles) return false;

        const files: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item?.kind === 'file') {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }

        if (files.length > 0) {
          event.preventDefault();
          onPasteFiles(files);
          return true;
        }

        return false;
      },
      // Prevent TipTap from handling drops - let parent elements handle via useDragDrop
      handleDrop: () => true,
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      setTextContent(ed.getText());
      // Mark this as an internal change so the value effect doesn't interfere
      isInternalChangeRef.current = true;
      onChange?.(json);
    },

    onFocus: () => {
      onFocus?.();
    },
    onBlur: ({ event }) => {
      onBlur?.(event);
    },
  });

  useEffect(() => {
    editor?.commands.selectAll();
  }, [editor, shownPlaceholder]);

  // Sync mention context to the module-level ref synchronously during render
  // so the TipTap suggestion `items` callback always has current data.
  if (mentionContext) mentionContextRef.current = mentionContext;

  // Sync slash commands to the module-level ref synchronously during render.
  if (slashCommands) slashCommandsRef.current = slashCommands;

  const canSendMessage = useMemo(() => {
    return !disabled && textContent.trim().length > 2;
  }, [disabled, textContent]);

  const handleSubmit = useCallback(() => {
    if (canSendMessage) {
      onSubmit();
    }
  }, [canSendMessage, onSubmit]);

  // Update editable state when disabled changes
  // CRITICAL: Use useLayoutEffect to sync editor state BEFORE paint
  // This prevents visual flicker when transitioning between edit/view modes
  useLayoutEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Sync external value to editor when their emptiness is out of sync.
  // This covers two scenarios:
  // 1. Clearing after send: parent resets value to an empty doc, but editor
  //    still has the old message text → reset editor to empty.
  // 2. Inherited input on agent creation: the editor mounted empty (TipTap
  //    always starts with a single empty paragraph), but the value now carries
  //    content inherited from the previous agent → populate the editor.
  // We only act on this empty/non-empty mismatch to avoid feedback loops that
  // would occur if we synced every value change back into the editor.
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    if (!editor || value == null) return;

    const valueContent = (value as { content?: unknown[] })?.content;
    const isValueEmpty =
      valueContent?.length === 1 &&
      (valueContent[0] as { type?: string })?.type === 'paragraph' &&
      !(valueContent[0] as { content?: unknown[] })?.content;

    const isEditorEmpty = editor.state.doc.content.size <= 2;

    if (isValueEmpty !== isEditorEmpty) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  // Fix cursor positioning around inline attachment badges.
  // Without whitespace adjacent to badges, ProseMirror inserts <img class="ProseMirror-separator">
  // and <br class="ProseMirror-trailingBreak"> elements. The cursor ends up positioned between
  // element children rather than inside a text node, causing the browser's Selection API to
  // return a zero rect - resulting in a mispositioned, oversized cursor.
  //
  // This MutationObserver injects zero-width space text nodes (\u200B) at positions where
  // the cursor would otherwise be at an element boundary with no text node to anchor to.
  useEffect(() => {
    const editorElement = editor?.view?.dom;
    if (!editorElement) return;

    // Build selector for all inline badge node types (attachments + mentions)
    const allInlineNodeNames = [
      ...ALL_ATTACHMENT_NODE_NAMES,
      'mention',
      'slash',
    ];
    const attachmentSelectors = allInlineNodeNames
      .map((name) => `.react-renderer.node-${name}`)
      .join(', ');

    const observer = new MutationObserver(() => {
      editorElement
        .querySelectorAll(attachmentSelectors)
        .forEach((renderer) => {
          // Fix BEFORE badge: ensure a text node exists so the cursor can anchor to it
          const prev = renderer.previousSibling;
          if (!prev || prev.nodeType !== 3) {
            const textNode = document.createTextNode('\u200B');
            renderer.parentNode?.insertBefore(textNode, renderer);
          }

          // Fix AFTER badge: ensure a text node exists before separator or next badge
          const next = renderer.nextSibling;
          if (next && next.nodeType !== 3) {
            const isProblematic =
              // Next is ProseMirror separator
              (next.nodeName === 'IMG' &&
                (next as Element).classList?.contains(
                  'ProseMirror-separator',
                )) ||
              // Next is another badge (consecutive badges)
              allInlineNodeNames.some((name) =>
                (next as Element).classList?.contains(`node-${name}`),
              );
            if (isProblematic) {
              const textNode = document.createTextNode('\u200B');
              renderer.parentNode?.insertBefore(textNode, next);
            }
          }
        });
    });

    observer.observe(editorElement, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [editor]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      editor?.commands.focus('end');
    },
    blur: () => {
      editor?.commands.blur();
    },
    insertAttachment: (attrs: AttachmentAttributes) => {
      if (editor) {
        // Mark as internal change so valueEffect doesn't reset content
        isInternalChangeRef.current = true;
        editor.commands.insertAttachment(attrs);
      }
    },
    getTextContent: () => {
      if (!editor) return '';
      return editor.getText();
    },
    getJsonContent: () => {
      if (!editor) return '';
      return JSON.stringify(editor.getJSON());
    },
    clear: () => {
      editor?.commands.clearContent();
    },
  }));

  return (
    <div className={cn('flex flex-1 flex-col items-stretch gap-1', className)}>
      {/* Rich text input area */}
      <div
        className={cn(
          'relative h-full w-full',
          // Only add padding when editable (not in view mode)
          !disabled && 'pr-1',
        )}
      >
        <EditorContent
          editor={editor}
          className={cn(
            'h-full w-full',
            '[&_.tiptap]:cursor-text [&_.tiptap]:select-text [&_.tiptap]:caret-foreground',
            // Editable mode: scrollbar and max-height constraints
            !disabled && 'scrollbar-subtle max-h-64 overflow-y-auto',
            // View mode: no overflow/scroll styling, natural content flow
            disabled && 'overflow-visible',
            // Placeholder styling (from @tiptap/extension-placeholder) - only for editable
            !disabled &&
              '[&_.tiptap_p.is-editor-empty:first-child]:before:pointer-events-none',
            !disabled &&
              '[&_.tiptap_p.is-editor-empty:first-child]:before:float-left',
            !disabled && '[&_.tiptap_p.is-editor-empty:first-child]:before:h-0',
            !disabled &&
              '[&_.tiptap_p.is-editor-empty:first-child]:before:text-subtle-foreground',
            !disabled &&
              '[&_.tiptap_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
            // Breathing room around inline attachment nodes (all types)
            // These pseudo-elements provide visual spacing for cursor positioning
            // Height constraint (h-[1em]) prevents taller cursor when no text follows the attachment
            '[&_.react-renderer.node-attachment]:before:content-[""] [&_.react-renderer.node-attachment]:after:content-[""]',
            '[&_.react-renderer.node-attachment]:before:inline-block [&_.react-renderer.node-attachment]:after:inline-block',
            '[&_.react-renderer.node-attachment]:before:w-0.5 [&_.react-renderer.node-attachment]:after:w-0.5',
            '[&_.react-renderer.node-attachment]:before:h-[1em] [&_.react-renderer.node-attachment]:after:h-[1em]',
            '[&_.react-renderer.node-attachment]:before:align-middle [&_.react-renderer.node-attachment]:after:align-middle',
            '[&_.react-renderer.node-elementAttachment]:before:content-[""] [&_.react-renderer.node-elementAttachment]:after:content-[""]',
            '[&_.react-renderer.node-elementAttachment]:before:inline-block [&_.react-renderer.node-elementAttachment]:after:inline-block',
            '[&_.react-renderer.node-elementAttachment]:before:w-0.5 [&_.react-renderer.node-elementAttachment]:after:w-0.5',
            '[&_.react-renderer.node-elementAttachment]:before:h-[1em] [&_.react-renderer.node-elementAttachment]:after:h-[1em]',
            '[&_.react-renderer.node-elementAttachment]:before:align-middle [&_.react-renderer.node-elementAttachment]:after:align-middle',
            '[&_.react-renderer.node-textClipAttachment]:before:content-[""] [&_.react-renderer.node-textClipAttachment]:after:content-[""]',
            '[&_.react-renderer.node-textClipAttachment]:before:inline-block [&_.react-renderer.node-textClipAttachment]:after:inline-block',
            '[&_.react-renderer.node-textClipAttachment]:before:w-0.5 [&_.react-renderer.node-textClipAttachment]:after:w-0.5',
            '[&_.react-renderer.node-textClipAttachment]:before:h-[1em] [&_.react-renderer.node-textClipAttachment]:after:h-[1em]',
            '[&_.react-renderer.node-textClipAttachment]:before:align-middle [&_.react-renderer.node-textClipAttachment]:after:align-middle',
            '[&_.react-renderer.node-mention]:before:content-[""] [&_.react-renderer.node-mention]:after:content-[""]',
            '[&_.react-renderer.node-mention]:before:inline-block [&_.react-renderer.node-mention]:after:inline-block',
            '[&_.react-renderer.node-mention]:before:w-0.5 [&_.react-renderer.node-mention]:after:w-0.5',
            '[&_.react-renderer.node-mention]:before:h-[1em] [&_.react-renderer.node-mention]:after:h-[1em]',
            '[&_.react-renderer.node-mention]:before:align-middle [&_.react-renderer.node-mention]:after:align-middle',
            '[&_.react-renderer.node-slash]:before:content-[""] [&_.react-renderer.node-slash]:after:content-[""]',
            '[&_.react-renderer.node-slash]:before:inline-block [&_.react-renderer.node-slash]:after:inline-block',
            '[&_.react-renderer.node-slash]:before:w-0.5 [&_.react-renderer.node-slash]:after:w-0.5',
            '[&_.react-renderer.node-slash]:before:h-[1em] [&_.react-renderer.node-slash]:after:h-[1em]',
            '[&_.react-renderer.node-slash]:before:align-middle [&_.react-renderer.node-slash]:after:align-middle',
            // Hide ProseMirror-separator elements to prevent cursor height issues at node boundaries
            '[&_.ProseMirror-separator]:hidden',
          )}
        />
      </div>

      {/* Controls area - only shown when not disabled and has content to show */}
      {!disabled &&
        (showWorkspaceSelect ||
          showModelSelect ||
          (showContextUsageRing && contextUsedPercentage > 0)) && (
          <div
            className={cn(
              'flex shrink-0 flex-row flex-wrap items-center justify-start gap-2 *:shrink-0',
              !showWorkspaceSelect && 'pl-1',
            )}
          >
            {showWorkspaceSelect && (
              <WorkspaceSelect
                onWorkspaceChange={() => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      editor?.commands.focus('end');
                      onWorkspaceChange?.();
                    });
                  });
                }}
              />
            )}
            {showModelSelect && (
              <ModelSelect
                onModelChange={() => {
                  // Defer focus until after popover closes using double rAF
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      editor?.commands.focus('end');
                      onModelChange?.();
                    });
                  });
                }}
              />
            )}
            {showContextUsageRing && contextUsedPercentage > 0 && (
              <ContextUsageRing
                percentage={contextUsedPercentage}
                usedKb={contextUsedKb}
                maxKb={contextMaxKb}
              />
            )}
          </div>
        )}
    </div>
  );
};

export interface ChatInputActionsProps {
  /** Whether the agent is currently working (used to determine stop/send button visibility) */
  isAgentWorking?: boolean;
  /** Whether the agent has a pending user question (hides stop button) */
  hasPendingQuestion?: boolean;
  onStop?: () => void;

  showElementSelectorButton?: boolean;
  elementSelectionActive?: boolean;
  onToggleElementSelection?: () => void;
  elementSelectorDisabled?: boolean;

  showImageUploadButton?: boolean;
  onAddFileAttachment?: (file: File) => void;

  canSendMessage: boolean;
  onSubmit: () => void;
}

export const ChatInputActions = memo(function ChatInputActions({
  isAgentWorking = false,
  hasPendingQuestion = false,
  onStop,

  showElementSelectorButton = true,
  elementSelectionActive = false,
  onToggleElementSelection,
  elementSelectorDisabled = false,

  showImageUploadButton = true,
  onAddFileAttachment,

  canSendMessage,
  onSubmit,
}: ChatInputActionsProps) {
  // Always show the send button; show stop button alongside it when agent is working
  const showStopButton = isAgentWorking && !hasPendingQuestion && !!onStop;
  const showSendButton = true;

  return (
    <div className="flex shrink-0 flex-col items-end justify-end gap-1">
      {/* Element selector and image upload - always shown (can add context to queued messages) */}
      {showElementSelectorButton && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={elementSelectorDisabled}
              className="shrink-0 data-[element-selector-active=true]:bg-primary-foreground/5 data-[element-selector-active=true]:text-primary-foreground"
              data-element-selector-active={elementSelectionActive}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleElementSelection?.();
              }}
              aria-label="Select context elements"
            >
              <SquareDashedMousePointerIcon className="size-3.5 stroke-[2.5px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {elementSelectionActive ? (
              'Stop selecting elements (Esc)'
            ) : (
              <>
                Add reference elements (
                <HotkeyComboText
                  action={HotkeyActions.TOGGLE_CONTEXT_SELECTOR}
                />
                )
              </>
            )}
          </TooltipContent>
        </Tooltip>
      )}
      {showImageUploadButton && onAddFileAttachment && (
        <>
          <input
            type="file"
            multiple
            className="hidden"
            accept="image/png, image/jpeg, image/gif, image/webp, application/pdf, text/plain"
            id="chat-file-attachment-input-file"
          />
          <Tooltip>
            <TooltipTrigger>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Upload image"
                className="mb-1 shrink-0"
                onClick={() => {
                  const input = document.getElementById(
                    'chat-file-attachment-input-file',
                  ) as HTMLInputElement;
                  input.value = '';
                  input.click();
                  input.onchange = (e) => {
                    Array.from(
                      (e.target as HTMLInputElement).files ?? [],
                    ).forEach((file) => {
                      onAddFileAttachment(file);
                    });
                  };
                }}
              >
                <ImageUpIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload image</TooltipContent>
          </Tooltip>
        </>
      )}
      {/* Stop + Send buttons row — stop is shown to the left when agent is working */}
      <div className="flex flex-row items-center gap-2">
        {showStopButton && (
          <Tooltip>
            <TooltipTrigger>
              <Button
                onClick={onStop}
                aria-label="Stop agent"
                variant="secondary"
                className="group z-10 size-8 shrink-0 cursor-pointer rounded-full p-1 opacity-100! shadow-md backdrop-blur-lg"
              >
                <SquareIcon className="size-3 fill-current" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop agent</TooltipContent>
          </Tooltip>
        )}
        {showSendButton && (
          <Tooltip>
            <TooltipTrigger>
              <Button
                disabled={!canSendMessage}
                onClick={onSubmit}
                aria-label="Send message"
                variant="primary"
                className="z-10 size-8 shrink-0 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg transition-all disabled:opacity-50"
              >
                <ArrowUpIcon className="size-4 stroke-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
});
