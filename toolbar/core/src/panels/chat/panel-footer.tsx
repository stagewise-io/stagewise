import { ContextElementsChipsFlexible } from '@/components/context-elements-chips-flexible';
import { FileAttachmentChips } from '@/components/file-attachment-chips';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { Button } from '@stagewise/stage-ui/components/button';
import { PanelFooter } from '@/components/ui/panel';
import { useChatState } from '@/hooks/use-chat-state';
import { cn, HotkeyActions } from '@/utils';
import { Textarea } from '@headlessui/react';
import { ArrowUpIcon, SquareIcon, MousePointerIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
}: {
  ref: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const chatState = useChatState();
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isComposing],
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

  const _showMultiLineTextArea = useMemo(() => {
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
        chatState.domContextElements.length > 0) && (
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          <FileAttachmentChips
            fileAttachments={chatState.fileAttachments}
            removeFileAttachment={chatState.removeFileAttachment}
          />
          <ContextElementsChipsFlexible
            domContextElements={chatState.domContextElements}
            removeChatDomContext={chatState.removeChatDomContext}
          />
        </div>
      )}
      <div className="flex h-fit flex-1 flex-row items-end justify-between gap-1">
        <div className="relative flex flex-1 pr-1">
          <Textarea
            ref={inputRef}
            value={chatState.chatInput}
            onChange={(e) => {
              chatState.setChatInput(e.target.value);
            }}
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
              'scrollbar-thin scrollbar-thumb-black/20 scrollbar-track-transparent z-10 h-28 w-full resize-none rounded-2xl bg-zinc-500/5 px-2 py-1 pr-8 text-zinc-950 shadow-md backdrop-blur-lg transition-all duration-300 ease-out placeholder:text-foreground/40 focus:bg-blue-200/20 focus:shadow-blue-400/10 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
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
        </div>
        <div className="flex flex-col justify-end gap-2">
          {canStop && (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  onClick={abortAgent}
                  aria-label="Stop agent"
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
                variant="primary"
                className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg"
              >
                <ArrowUpIcon className="size-4 stroke-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </PanelFooter>
  );
}
