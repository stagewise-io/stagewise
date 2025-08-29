import { ContextElementsChipsFlexible } from '@/components/context-elements-chips-flexible';
import { FileAttachmentChips } from '@/components/file-attachment-chips';
import { FileMentionChip } from '@/components/file-mention-chip';
import {
  FileMentionDropdown,
  type FileMentionDropdownRef,
  type FileData,
  type FuseResult,
} from '@/components/file-mention-dropdown';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { Button } from '@/components/ui/button';
import { PanelFooter } from '@/components/ui/panel';
import { useChatState } from '@/hooks/use-chat-state';
import { cn, HotkeyActions } from '@/utils';
import { Textarea } from '@headlessui/react';
import { ArrowUpIcon, SquareIcon, MousePointerIcon } from 'lucide-react';
import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
} from '@/hooks/use-karton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HotkeyComboText } from '@/components/hotkey-combo-text';

const GlassyTextInputClassNames =
  'origin-center rounded-xl border border-black/10 ring-1 ring-white/20 transition-all duration-150 ease-out after:absolute after:inset-0 after:size-full after:content-normal after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-white/0 after:transition-colors after:duration-150 after:ease-out disabled:pointer-events-none disabled:bg-black/5 disabled:text-foreground/60 disabled:opacity-30';

export function ChatPanelFooter({
  ref,
  inputRef,
  position,
}: {
  ref: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  position?: {
    isTopHalf: boolean;
    isLeftHalf: boolean;
  };
}) {
  const chatState = useChatState();
  const {
    isMentionDropdownOpen,
    setIsMentionDropdownOpen,
    selectedFiles,
    setSelectedFiles,
  } = chatState;
  const isWorking = useKartonState((s) => s.isWorking);
  const activeChatId = useKartonState((s) => s.activeChatId);
  const stopAgent = useKartonProcedure((p) => p.abortAgentCall);
  const canStop = useKartonState((s) => s.isWorking);
  const chats = useKartonState((s) => s.chats);
  const isConnected = useKartonConnected();

  const abortAgent = useCallback(() => {
    stopAgent();
  }, [stopAgent]);

  const activeChat = useMemo(() => {
    return activeChatId ? chats[activeChatId] : null;
  }, [activeChatId, chats]);

  const [isComposing, setIsComposing] = useState(false);

  // Mention state
  const [_mentionSearch, setMentionSearch] = useState('');
  const [mentionSearchResults, setMentionSearchResults] = useState<
    FuseResult<FileData>[]
  >([]);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [isSearchingFiles, setIsSearchingFiles] = useState(false);
  const [mentionTriggerPosition, setMentionTriggerPosition] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const mentionDropdownRef = useRef<FileMentionDropdownRef>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fuzzyFileSearch = useKartonProcedure((p) => p.fuzzyFileSearch);

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!isConnected) {
      return false;
    }
    return !isWorking;
  }, [isWorking, isConnected]);

  const canSendMessage = useMemo(() => {
    return (
      enableInputField &&
      chatState.chatInput.trim().length > 2 &&
      chatState.isPromptCreationActive
    );
  }, [enableInputField, chatState]);

  const handleSubmit = useCallback(() => {
    if (canSendMessage) {
      chatState.sendMessage();
      // stopPromptCreation is already called in sendMessage
    }
  }, [chatState, canSendMessage]);

  // Determine if toolbar is at bottom (dropdown will appear above)
  const isToolbarAtBottom = useMemo(() => {
    return position ? !position.isTopHalf : false;
  }, [position]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle mention dropdown navigation
      if (isMentionDropdownOpen) {
        if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
          e.preventDefault();
          if (isToolbarAtBottom) {
            // Dropdown is above - ArrowUp should go up visually (increment index in reversed array)
            setMentionSelectedIndex((prev) =>
              prev < mentionSearchResults.length - 1 ? prev + 1 : 0,
            );
          } else {
            // Dropdown is below - ArrowUp should go up (decrement index)
            setMentionSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : mentionSearchResults.length - 1,
            );
          }
          return;
        }
        if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
          e.preventDefault();
          if (isToolbarAtBottom) {
            // Dropdown is above - ArrowDown should go down visually (decrement index in reversed array)
            setMentionSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : mentionSearchResults.length - 1,
            );
          } else {
            // Dropdown is below - ArrowDown should go down (increment index)
            setMentionSelectedIndex((prev) =>
              prev < mentionSearchResults.length - 1 ? prev + 1 : 0,
            );
          }
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (mentionSearchResults[mentionSelectedIndex]) {
            handleFileSelect(mentionSearchResults[mentionSelectedIndex]);
          }
          return;
        }
        // ESC is now handled by the global hotkey listener
      }

      // Regular enter handling
      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [
      handleSubmit,
      isComposing,
      isMentionDropdownOpen,
      mentionSearchResults,
      mentionSelectedIndex,
      isToolbarAtBottom,
      selectedFiles,
    ],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items;
      const files: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        // Prevent default paste for files
        e.preventDefault();
        files.forEach((file) => {
          chatState.addFileAttachment(file);
        });

        // Start prompt creation if not already active
        if (!chatState.isPromptCreationActive) {
          chatState.startPromptCreation();
          chatState.startContextSelector();
        }
      }
    },
    [chatState],
  );

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);

  // Mention helper functions
  const closeMentionDropdown = useCallback(() => {
    setIsMentionDropdownOpen(false);
    setMentionSearch('');
    setMentionSearchResults([]);
    setMentionSelectedIndex(0);
    setMentionTriggerPosition(null);
  }, [setIsMentionDropdownOpen]);

  const handleFileSelect = useCallback(
    (file: FuseResult<FileData>) => {
      if (!mentionTriggerPosition || !inputRef.current) return;

      const currentValue = chatState.chatInput;
      const before = currentValue.slice(0, mentionTriggerPosition.start);
      const after = currentValue.slice(mentionTriggerPosition.end);
      // Use full filepath in mention for unambiguous mapping
      const mentionText = `@${file.item.filepath}`;

      // Check if this file is already selected
      const alreadySelected = selectedFiles.some(
        (f) =>
          f.filepath === file.item.filepath &&
          f.filename === file.item.filename,
      );

      if (!alreadySelected) {
        // Update the input text
        const newValue = `${before + mentionText} ${after}`;
        chatState.setChatInput(newValue);

        // Add to selected files
        setSelectedFiles([
          ...selectedFiles,
          { filepath: file.item.filepath, filename: file.item.filename },
        ]);

        // Set cursor position after the mention
        setTimeout(() => {
          if (inputRef.current) {
            const newCursorPos = before.length + mentionText.length + 1;
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
            inputRef.current.focus();
          }
        }, 0);
      }

      // Close dropdown
      closeMentionDropdown();
    },
    [
      chatState,
      mentionTriggerPosition,
      closeMentionDropdown,
      selectedFiles,
      setSelectedFiles,
    ],
  );

  // Helper function to extract file mentions from input text
  const extractFileMentions = useCallback((text: string): string[] => {
    const mentionRegex = /@([^\s]+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null = mentionRegex.exec(text);

    while (match !== null) {
      mentions.push(match[1]); // Extract the filepath without the @
      match = mentionRegex.exec(text);
    }

    return mentions;
  }, []);

  // Detect @ mentions and trigger search
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPosition = e.target.selectionStart;

      chatState.setChatInput(value);

      // Sync selectedFiles with mentions in the input
      const currentMentions = extractFileMentions(value);
      const updatedSelectedFiles = selectedFiles.filter((file) =>
        currentMentions.some((mention) => mention.startsWith(file.filepath)),
      );

      // Only update if there's a difference
      if (updatedSelectedFiles.length !== selectedFiles.length) {
        setSelectedFiles(updatedSelectedFiles);
      }

      // Check for @ mention for autocomplete
      if (cursorPosition > 0) {
        // Find the last @ before cursor
        let atIndex = -1;
        for (let i = cursorPosition - 1; i >= 0; i--) {
          if (value[i] === '@') {
            atIndex = i;
            break;
          }
          // Stop if we hit whitespace or another special character
          if (value[i] === ' ' || value[i] === '\n') {
            break;
          }
        }

        if (atIndex !== -1) {
          const searchText = value.slice(atIndex + 1, cursorPosition);

          // Check if there's no space between @ and the search text
          const hasSpace = searchText.includes(' ');

          if (!hasSpace) {
            // Check if this mention matches any already selected file (using filepath now)
            const isExistingMention = selectedFiles.some((file) => {
              const mentionText = `@${file.filepath}`;
              // Check if the @ position and text matches an existing file mention
              return (
                value.slice(atIndex, atIndex + mentionText.length) ===
                mentionText
              );
            });

            if (!isExistingMention) {
              setMentionSearch(searchText);
              setMentionTriggerPosition({
                start: atIndex,
                end: cursorPosition,
              });
              setIsMentionDropdownOpen(true);
              setMentionSelectedIndex(0);

              // Debounced search
              if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
              }
              searchTimeoutRef.current = setTimeout(() => {
                performFuzzySearch(searchText);
              }, 200);
            } else {
              closeMentionDropdown();
            }
          } else {
            closeMentionDropdown();
          }
        } else {
          closeMentionDropdown();
        }
      } else {
        closeMentionDropdown();
      }
    },
    [
      chatState,
      closeMentionDropdown,
      selectedFiles,
      setSelectedFiles,
      extractFileMentions,
      setIsMentionDropdownOpen,
    ],
  );

  // Perform fuzzy file search
  const performFuzzySearch = useCallback(
    async (query: string) => {
      if (!query || query.length === 0) {
        setMentionSearchResults([]);
        return;
      }

      setIsSearchingFiles(true);
      try {
        const results = await fuzzyFileSearch(query);
        // Limit to top 10 results
        setMentionSearchResults(results.slice(0, 10));
      } catch (error) {
        console.error('Failed to search files:', error);
        setMentionSearchResults([]);
      } finally {
        setIsSearchingFiles(false);
      }
    },
    [fuzzyFileSearch],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const showMultiLineTextArea = useMemo(() => {
    // Show a large text area if we have a line break or more than 40 characters.
    return (
      chatState.chatInput.includes('\n') || chatState.chatInput.length > 40
    );
  }, [chatState.chatInput]);

  const showTextSlideshow = useMemo(() => {
    return (
      (activeChat?.messages.length ?? 0) === 0 &&
      chatState.chatInput.length === 0
    );
  }, [activeChat?.messages.length, chatState.chatInput]);

  return (
    <PanelFooter
      clear
      className="absolute right-px bottom-px left-px z-10 flex flex-col items-stretch gap-1 px-3 pt-2 pb-3"
      ref={ref}
    >
      {(chatState.fileAttachments.length > 0 ||
        chatState.domContextElements.length > 0 ||
        selectedFiles.length > 0) && (
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          <FileAttachmentChips
            fileAttachments={chatState.fileAttachments}
            removeFileAttachment={chatState.removeFileAttachment}
          />
          <ContextElementsChipsFlexible
            domContextElements={chatState.domContextElements}
            removeChatDomContext={chatState.removeChatDomContext}
          />
          {selectedFiles.map((file, index) => (
            <FileMentionChip
              key={`${file.filepath}-${index}`}
              filename={file.filename}
              filepath={file.filepath}
              onRemove={() => {
                // Remove the file from selectedFiles
                setSelectedFiles(selectedFiles.filter((_, i) => i !== index));

                // Also remove the mention from the input text (using full filepath now)
                const mentionText = `@${file.filepath}`;
                const currentValue = chatState.chatInput;
                const newValue = currentValue
                  .replace(mentionText, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                chatState.setChatInput(newValue);
              }}
            />
          ))}
        </div>
      )}
      <div className="flex h-fit flex-1 flex-row items-end justify-between gap-1">
        <div className="relative flex flex-1 pr-1">
          <Textarea
            ref={inputRef}
            value={chatState.chatInput}
            onChange={handleInputChange}
            onFocus={() => {
              if (!chatState.isPromptCreationActive) {
                chatState.startPromptCreation();
                chatState.startContextSelector();
              }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            disabled={!enableInputField}
            className={cn(
              GlassyTextInputClassNames,
              'scrollbar-thin scrollbar-thumb-black/20 scrollbar-track-transparent z-10 w-full resize-none rounded-2xl bg-zinc-500/5 px-2 py-1 text-zinc-950 shadow-md backdrop-blur-lg transition-all duration-300 ease-out placeholder:text-foreground/40 focus:bg-blue-200/20 focus:shadow-blue-400/10 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
              showMultiLineTextArea && !isWorking ? 'h-26' : 'h-8',
              chatState.isPromptCreationActive && 'pr-8', // Add padding for context button
            )}
            placeholder={!showTextSlideshow && 'Type a message...'}
          />
          <div className="pointer-events-none absolute inset-0 z-20 size-full px-[9px] py-[5px]">
            {/* TODO: Only render this if there is no chat history yet. */}
            <TextSlideshow
              className={cn(
                'text-foreground/40 text-sm',
                !showTextSlideshow && 'opacity-0',
              )}
              texts={[
                'Try: Add a new button into the top right corner',
                'Try: Convert these cards into accordions',
                'Try: Add a gradient to the background',
              ]}
            />
          </div>
          {/* Context selector button - shown when prompt creation is active */}
          {chatState.isPromptCreationActive && (
            <div className="-translate-y-1/2 absolute top-1/2 right-2 z-30">
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    onMouseDown={(e) => {
                      // Prevent default to avoid losing focus from input
                      e.preventDefault();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (chatState.isContextSelectorActive) {
                        chatState.stopContextSelector();
                      } else {
                        chatState.startContextSelector();
                      }
                      // Keep input focused
                      inputRef.current?.focus();
                    }}
                    aria-label="Select context elements"
                    variant="ghost"
                    className={cn(
                      'z-10 size-6 cursor-pointer rounded-full border-none bg-transparent p-0 backdrop-blur-lg',
                      chatState.isContextSelectorActive
                        ? 'bg-blue-600/10 text-blue-600'
                        : 'text-zinc-500 opacity-70',
                    )}
                  >
                    <MousePointerIcon className={'size-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {chatState.isContextSelectorActive ? (
                    <>
                      Stop selecting elements (
                      <HotkeyComboText action={HotkeyActions.ESC} />)
                    </>
                  ) : (
                    <>
                      Add reference elements (
                      <HotkeyComboText action={HotkeyActions.CTRL_ALT_PERIOD} />
                      )
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          {/* File Mention Dropdown */}
          <FileMentionDropdown
            ref={mentionDropdownRef}
            searchResults={mentionSearchResults}
            selectedIndex={mentionSelectedIndex}
            onSelect={handleFileSelect}
            isLoading={isSearchingFiles}
            isOpen={isMentionDropdownOpen}
            referenceEl={inputRef.current}
            isToolbarAtBottom={isToolbarAtBottom}
          />
        </div>
        {canStop && (
          <Tooltip>
            <TooltipTrigger>
              <Button
                onClick={abortAgent}
                aria-label="Stop agent"
                glassy
                variant="secondary"
                className="!opacity-100 group z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg !disabled:*:opacity-10 hover:bg-rose-600/20"
              >
                <SquareIcon className="size-3 fill-zinc-500 stroke-zinc-500 group-hover:fill-zinc-800 group-hover:stroke-zinc-800" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop agent</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger>
            <Button
              disabled={!canSendMessage}
              onClick={handleSubmit}
              aria-label="Send message"
              glassy
              variant="primary"
              className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg disabled:bg-transparent disabled:shadow-none disabled:*:stroke-zinc-500/50"
            >
              <ArrowUpIcon className="size-4 stroke-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Send message</TooltipContent>
        </Tooltip>
      </div>
    </PanelFooter>
  );
}
