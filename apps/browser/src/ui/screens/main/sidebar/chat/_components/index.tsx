import { useChatState } from '@/hooks/use-chat-state';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ChatHistory } from './chat-history';
import { ChatPanelFooter } from './panel-footer';
import { usePostHog } from 'posthog-js/react';
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
  const posthog = usePostHog();
  const chatState = useChatState();
  const [_isDragging, setIsDragging] = useState(false);
  const isWorking = useKartonState(
    useComparingSelector((s) => s.agentChat?.isWorking || false),
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
        posthog.capture('agent_file_uploaded', {
          file_type: file.type,
          method: 'chat_drop_zone',
        });
      });

      // Focus the input field
      inputRef.current?.focus();
    },
    [chatState],
  );

  return (
    <div
      className="relative flex size-full flex-col items-stretch justify-center bg-transparent"
      onDrop={handleDrop}
      role="region"
      aria-label="Chat panel drop zone"
    >
      <ChatHistory />
      <ChatPanelFooter />
    </div>
  );
}
