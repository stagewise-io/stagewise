import { useChatState } from '@/hooks/use-chat-state';
import { useMessageEditState } from '@/hooks/use-message-edit-state';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ChatHistory } from './chat-history';
import { ChatPanelFooter } from './panel-footer';
import { usePostHog } from 'posthog-js/react';
import {
  useComparingSelector,
  useKartonConnected,
  useKartonState,
} from '@/hooks/use-karton';
import { cn } from '@/utils';

export function ChatPanel() {
  const posthog = usePostHog();
  const chatState = useChatState();
  const { addFilesToActiveInput } = useMessageEditState();
  const isWorking = useKartonState(
    useComparingSelector((s) => s.agentChat?.isWorking || false),
  );
  const isConnected = useKartonConnected();

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!isConnected) return false;

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

  // Track drag-over state for visual feedback
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
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
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);

      // Route files to active input (editing message or main chat)
      addFilesToActiveInput(files, (droppedFiles) => {
        // Fallback: add to main chat input
        droppedFiles.forEach((file) => {
          chatState.addFileAttachment(file);
          posthog.capture('agent_file_uploaded', {
            file_type: file.type,
            method: 'chat_drop_zone',
          });
        });
        // Focus the input field
        inputRef.current?.focus();
      });
    },
    [chatState, addFilesToActiveInput],
  );

  return (
    <div
      className={cn(
        'relative flex size-full flex-col items-stretch justify-center rounded-lg bg-transparent py-2 transition-colors',
        isDragOver && 'bg-hover-derived!',
      )}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      role="region"
      aria-label="Chat panel drop zone"
    >
      <ChatHistory />
      <ChatPanelFooter />
    </div>
  );
}
