import {
  FileAttachmentChips,
  type FileAttachmentData,
} from '@/components/file-attachment-chips';
import { ModelSelect } from './model-select';
import { ContextUsageRing } from './context-usage-ring';
import { SelectedElementsChips } from '@/components/selected-elements-chips';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn, isAnthropicSupportedFile } from '@/utils';
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
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyComboText } from '@/components/hotkey-combo-text';
import { usePostHog } from 'posthog-js/react';
import type { SelectedElement } from '@shared/selected-elements';
import type { FileAttachment } from '@/hooks/use-chat-state';

export type { FileAttachment };

export interface ChatInputProps {
  // Core controlled input
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;

  // Attachments (display + remove)
  fileAttachments?: FileAttachment[];
  onRemoveFileAttachment?: (id: string) => void;
  onAddFileAttachment?: (file: File) => void;
  selectedElements?: SelectedElement[];
  onRemoveSelectedElement?: (id: string) => void;
  onClearAll?: () => void;

  // Model selector
  showModelSelect?: boolean;
  onModelChange?: () => void;

  // Context usage ring
  showContextUsageRing?: boolean;
  contextUsedPercentage?: number;
  contextUsedKb?: number;
  contextMaxKb?: number;

  // Focus management
  onFocus?: () => void;
  onBlur?: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
  onEscape?: () => void;

  // Styling
  className?: string;
}

export interface ChatInputHandle {
  focus: () => void;
  blur: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      value,
      onChange,
      onSubmit,
      disabled = false,
      placeholder,

      fileAttachments = [],
      onRemoveFileAttachment,
      onAddFileAttachment,
      selectedElements = [],
      onRemoveSelectedElement,
      onClearAll,

      showModelSelect = true,
      onModelChange,

      showContextUsageRing = false,
      contextUsedPercentage = 0,
      contextUsedKb = 0,
      contextMaxKb = 0,

      onFocus,
      onBlur,
      onEscape,

      className,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const posthog = usePostHog();
    const [isComposing, setIsComposing] = useState(false);

    const focusChatHotkeyText = HotkeyComboText({
      action: HotkeyActions.CTRL_I,
    });

    useImperativeHandle(ref, () => ({
      focus: () => {
        const textarea = inputRef.current;
        if (!textarea) return;
        textarea.focus();
        // Move cursor to end of text
        textarea.selectionStart = textarea.value.length;
        textarea.selectionEnd = textarea.value.length;
      },
      blur: () => inputRef.current?.blur(),
    }));

    const canSendMessage = useMemo(() => {
      return !disabled && value.trim().length > 2;
    }, [disabled, value]);

    const handleSubmit = useCallback(() => {
      if (canSendMessage) {
        onSubmit();
      }
    }, [canSendMessage, onSubmit]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
          e.preventDefault();
          handleSubmit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onEscape?.();
        }
      },
      [handleSubmit, isComposing, onEscape],
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (!onAddFileAttachment) return;

        const items = e.clipboardData.items;
        const files: File[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item && item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              files.push(file);
            }
          }
        }

        if (files.length > 0) {
          e.preventDefault();
          files.forEach((file) => {
            onAddFileAttachment(file);
            posthog.capture('agent_file_uploaded', {
              file_type: file.type,
              method: 'chat_paste',
            });
          });
          inputRef.current?.focus();
        }
      },
      [onAddFileAttachment, posthog],
    );

    const handleCompositionStart = useCallback(() => {
      setIsComposing(true);
    }, []);

    const handleCompositionEnd = useCallback(() => {
      setIsComposing(false);
    }, []);

    // Convert FileAttachment[] to FileAttachmentData[] for the chips component
    const fileAttachmentData: FileAttachmentData[] = useMemo(
      () =>
        fileAttachments.map((attachment) => ({
          id: attachment.id,
          url: attachment.url,
          filename: attachment.file.name,
          mediaType: attachment.file.type,
          validation: isAnthropicSupportedFile(attachment.file),
        })),
      [fileAttachments],
    );

    const totalAttachments = fileAttachments.length + selectedElements.length;

    return (
      <div
        className={cn('flex flex-1 flex-col items-stretch gap-1', className)}
      >
        {/* Text input area */}
        <div className="relative flex h-28 pr-1">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onFocus={onFocus}
            onBlur={onBlur}
            disabled={disabled}
            className={cn(
              'scrollbar-subtle relative z-10 mt-0 h-full w-full resize-none overflow-visible rounded-none border-none text-foreground text-sm outline-none ring-0 transition-all duration-300 ease-out placeholder:text-muted-foreground/70 focus:outline-none disabled:bg-transparent',
            )}
            placeholder={
              placeholder ??
              `Ask anything about this page ${focusChatHotkeyText}`
            }
          />
        </div>

        {/* Attachments and controls area */}
        <div className="flex shrink-0 flex-row flex-wrap items-center justify-start gap-1 *:shrink-0">
          {showModelSelect && (
            <ModelSelect
              onModelChange={() => {
                // Defer focus until after popover closes using double rAF
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    inputRef.current?.focus();
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
          <FileAttachmentChips
            fileAttachments={fileAttachmentData}
            removeFileAttachment={onRemoveFileAttachment}
          />
          <SelectedElementsChips
            selectedElements={selectedElements}
            removeSelectedElementById={onRemoveSelectedElement}
          />
          {totalAttachments > 1 && onClearAll && (
            <Button size="xs" variant="ghost" onClick={onClearAll}>
              Clear all
            </Button>
          )}
        </div>
      </div>
    );
  },
);

export interface ChatInputActionsProps {
  /** Whether the agent is currently working (used to determine stop/send button visibility) */
  isAgentWorking?: boolean;
  /** Whether the input has text (used to switch between stop and send button when agent is working) */
  hasTextInput?: boolean;
  onStop?: () => void;

  showElementSelectorButton?: boolean;
  elementSelectionActive?: boolean;
  onToggleElementSelection?: () => void;
  elementSelectorDisabled?: boolean;

  showImageUploadButton?: boolean;
  onAddFileAttachment?: (file: File) => void;

  canSendMessage: boolean;
  onSubmit: () => void;
  isActive?: boolean;
}

export function ChatInputActions({
  isAgentWorking = false,
  hasTextInput = false,
  onStop,

  showElementSelectorButton = true,
  elementSelectionActive = false,
  onToggleElementSelection,
  elementSelectorDisabled = false,

  showImageUploadButton = true,
  onAddFileAttachment,

  canSendMessage,
  onSubmit,
  isActive = true,
}: ChatInputActionsProps) {
  const posthog = usePostHog();

  // Derive button visibility from agent state and input text
  // Show stop button when: agent is working AND no text input
  // Show send button when: agent is not working OR has text input
  const showStopButton = isAgentWorking && !hasTextInput && !!onStop;
  const showSendButton = !isAgentWorking || hasTextInput;

  return (
    <div className="flex shrink-0 flex-col items-center justify-end gap-1">
      {/* Element selector and image upload - always shown (can add context to queued messages) */}
      {showElementSelectorButton && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={elementSelectorDisabled}
              className="data-[element-selector-active=true]:bg-primary-foreground/5 data-[element-selector-active=true]:text-primary-foreground"
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
                <HotkeyComboText action={HotkeyActions.CTRL_I} />)
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
            accept="image/png, image/jpeg, image/gif, image/webp"
            id="chat-file-attachment-input-file"
          />
          <Tooltip>
            <TooltipTrigger>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Upload image"
                className="mb-1"
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
                      posthog.capture('agent_file_uploaded', {
                        file_type: file.type,
                        method: 'chat_file_attachment_menu',
                      });
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
      {showStopButton && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              onClick={onStop}
              aria-label="Stop agent"
              variant="secondary"
              className="group z-10 size-8 cursor-pointer rounded-full p-1 opacity-100! shadow-md backdrop-blur-lg !disabled:*:opacity-10"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop agent</TooltipContent>
        </Tooltip>
      )}
      {/* Send button - show when agent is not working OR has text input */}
      {showSendButton && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              disabled={!canSendMessage}
              onClick={onSubmit}
              aria-label="Send message"
              variant={isActive ? 'primary' : 'secondary'}
              className="z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg transition-all"
            >
              <ArrowUpIcon className="size-4 stroke-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Send message</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
