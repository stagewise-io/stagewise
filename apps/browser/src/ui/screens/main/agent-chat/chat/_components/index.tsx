import {
  MessageEditStateProvider,
  useMessageEditState,
} from '@ui/hooks/use-message-edit-state';
import { ChatDraftProvider } from '@ui/hooks/use-chat-draft';
import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
  useEffect,
} from 'react';
import { ChatHistory } from './chat-history';
import { ChatPanelFooter } from './panel-footer';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { cn } from '@ui/utils';
import {
  useOpenAgent,
  OpenAgentContext,
  noopAgentSwitcher,
} from '@ui/hooks/use-open-chat';

export function ChatPanel({ agentId }: { agentId?: string }) {
  return (
    <MessageEditStateProvider>
      <ChatDraftProvider>
        <ChatPanelInner agentId={agentId} />
      </ChatDraftProvider>
    </MessageEditStateProvider>
  );
}

function ChatPanelInner({ agentId }: { agentId?: string }) {
  const { forwardDropEvent } = useMessageEditState();
  const [openAgent, setOpenAgent, removeFromHistory] = useOpenAgent();
  const requestedAgent = agentId ?? openAgent;

  const openAgentExists = useKartonState((s) =>
    requestedAgent ? s.agents.instances[requestedAgent] !== undefined : false,
  );
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  useEffect(() => {
    if (agentId && !openAgentExists) void resumeAgent(agentId);
  }, [agentId, openAgentExists, resumeAgent]);
  // Defer heavy chat rendering so the sidebar updates instantly while the
  // chat area stays empty during the transition.
  const deferredAgent = useDeferredValue(requestedAgent);
  const isTransitioning = requestedAgent !== deferredAgent;
  const deferredAgentHistoryLen = useKartonState((s) =>
    deferredAgent
      ? (s.agents.instances[deferredAgent]?.state.history.length ?? 0)
      : 0,
  );

  // Auto-selecting the first agent when openAgent is null is handled
  // centrally by `useAutoSelectFirstAgent` at the main layout root —
  // no need to duplicate it here.

  // Track drag-over state for visual feedback
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    // Accept Files (from file system), text/uri-list (from web pages - images/links),
    // or workspace file/folder entries dragged from the file tree.
    if (
      e.dataTransfer.types.includes('Files') ||
      e.dataTransfer.types.includes('text/uri-list') ||
      e.dataTransfer.types.includes('application/x-stagewise-file-path') ||
      e.dataTransfer.types.includes('application/x-stagewise-file-paths')
    ) {
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

  // Forward drop events to the active input handler (editing message or main chat)
  // The actual processing (URL→image conversion, etc.) is done by the receiving handler
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      // Forward the raw event to the active handler
      forwardDropEvent(e);
    },
    [forwardDropEvent],
  );

  // Context override: ChatHistory reads openAgent from context, so we provide
  // the deferred value so React can schedule the heavy render as interruptible.
  const deferredContext = useMemo(
    () => ({
      tuple: [deferredAgent, setOpenAgent, removeFromHistory] as [
        string | null,
        (id: string | null) => void,
        (id: string, fallback?: string | null) => void,
      ],
      switcher: noopAgentSwitcher,
    }),
    [deferredAgent, setOpenAgent, removeFromHistory],
  );

  if (!requestedAgent || !openAgentExists)
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        No agent selected
      </div>
    );

  return (
    <div
      className={cn(
        'relative flex size-full flex-col items-stretch justify-center rounded-b-lg bg-transparent transition-colors',
        isDragOver && 'bg-hover-derived!',
      )}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      role="region"
      aria-label="Chat panel drop zone"
    >
      <OpenAgentContext.Provider value={deferredContext}>
        {isTransitioning ? (
          <div className={deferredAgentHistoryLen > 0 ? 'flex-1' : 'h-0'} />
        ) : (
          <ChatHistory flushTop={Boolean(agentId)} />
        )}
        <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col items-stretch">
          <ChatPanelFooter key={requestedAgent} />
        </div>
      </OpenAgentContext.Provider>
    </div>
  );
}
