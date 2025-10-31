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

export function ChatPanel({
  multiChatControls = true,
}: {
  multiChatControls?: boolean;
}) {
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

  return (
    <div
      className="relative flex size-full flex-col bg-transparent"
      onDrop={handleDrop}
      role="region"
      aria-label="Chat panel drop zone"
    >
      <ChatPanelHeader multiChatControls={multiChatControls} />
      <PanelContent
        className={cn(
          'block px-0 py-0',
          'h-full min-h-64',
          'mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_48px,black)]',
          'overflow-hidden rounded-[inherit]',
        )}
      >
        {/* This are renders the output of the agent as markdown and makes it scrollable if necessary. */}
        <ChatHistory />
      </PanelContent>
      <ChatPanelFooter />
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-3xl bg-blue-500/10 backdrop-blur-[1px]" />
      )}
    </div>
  );
}
