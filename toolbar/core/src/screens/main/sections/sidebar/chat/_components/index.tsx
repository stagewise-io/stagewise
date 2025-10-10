import { PanelContent } from '@/components/ui/panel';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ChatHistory } from './chat-history';
import { ChatPanelFooter } from './panel-footer';
import { ChatPanelHeader } from './panel-header';
import {
  useComparingSelector,
  useKartonConnected,
  useKartonState,
} from '@/hooks/use-karton';

export function ChatPanel() {
  const chatState = useChatState();
  const [isDragging, setIsDragging] = useState(false);
  const isWorking = useKartonState(
    useComparingSelector((s) => s.workspace?.agentChat?.isWorking || false),
  );
  const isConnected = useKartonConnected();

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!isConnected) {
      return false;
    }
    return !isWorking;
  }, [isWorking, isConnected]);

  /* If the user clicks on prompt creation mode, we force-focus the input field all the time. */
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Start prompt creation mode when chat panel opens
  useEffect(() => {
    if (enableInputField) {
      inputRef.current?.focus();
    }
  }, []);

  const footerRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the panel entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!panelRef.current?.contains(relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      files.forEach((file) => {
        chatState.addFileAttachment(file);
      });

      // Focus the input field
      inputRef.current?.focus();
    },
    [chatState],
  );

  useEffect(() => {
    if (chatHistoryRef.current && footerRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        // calculate the height difference because we will need to apply that to the scroll position
        const heightDifference =
          Number.parseInt(
            window
              .getComputedStyle(footerRef.current!)
              .getPropertyValue('padding-bottom'),
          ) - chatHistoryRef.current!.clientHeight;

        // scroll the chat history by the height difference after applying the updated padding
        chatHistoryRef.current!.style.paddingBottom = `${footerRef.current!.clientHeight}px`;
        chatHistoryRef.current!.scrollTop -= heightDifference;
      });
      resizeObserver.observe(footerRef.current);
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  return (
    <div
      className="relative flex size-full flex-col rounded-3xl bg-transparent p-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      role="region"
      aria-label="Chat panel drop zone"
    >
      <ChatPanelHeader />
      <PanelContent
        className={cn(
          'block px-0 py-0',
          'h-full min-h-64',
          'mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_48px,black_calc(95%_-_16px),transparent_calc(100%_-_16px))]',
          'overflow-hidden rounded-[inherit]',
        )}
      >
        {/* This are renders the output of the agent as markdown and makes it scrollable if necessary. */}
        <ChatHistory ref={chatHistoryRef} />
      </PanelContent>
      <ChatPanelFooter ref={footerRef} inputRef={inputRef} />
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-3xl bg-blue-500/10 backdrop-blur-[1px]" />
      )}
    </div>
  );
}
