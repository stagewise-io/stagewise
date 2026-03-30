import { useMessageEditState } from '@ui/hooks/use-message-edit-state';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
} from 'react';
import { ChatHistory } from './chat-history';
import { ChatPanelFooter } from './panel-footer';
import { InternalAppFrame } from './internal-app-frame';
import { UsageWarningBadge } from './usage-warning-badge';
import { useKartonState } from '@ui/hooks/use-karton';
import { cn } from '@ui/utils';
import { useOpenAgent, OpenAgentContext } from '@ui/hooks/use-open-chat';

export function ChatPanel() {
  const { forwardDropEvent } = useMessageEditState();
  const [openAgent, setOpenAgent, removeFromHistory] = useOpenAgent();
  const agents = useKartonState((s) => s.agents.instances);

  // Defer heavy chat rendering so the sidebar updates instantly while the
  // chat area stays empty during the transition.
  const deferredAgent = useDeferredValue(openAgent);
  const isTransitioning = openAgent !== deferredAgent;

  useEffect(() => {
    if (openAgent === null && Object.keys(agents).length > 0) {
      const firstAgent = Object.keys(agents)[0]!;
      setOpenAgent(firstAgent);
    }
  }, [agents, openAgent]);

  // Track drag-over state for visual feedback
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    // Accept Files (from file system) OR text/uri-list (from web pages - images/links)
    if (
      e.dataTransfer.types.includes('Files') ||
      e.dataTransfer.types.includes('text/uri-list')
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
  const deferredContext: [
    string | null,
    (id: string | null) => void,
    (id: string) => void,
  ] = useMemo(
    () => [deferredAgent, setOpenAgent, removeFromHistory],
    [deferredAgent, setOpenAgent, removeFromHistory],
  );

  if (openAgent === null || openAgent === undefined || !agents[openAgent])
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
          <div
            className={
              agents[deferredAgent ?? '']?.state.history?.length
                ? 'flex-1'
                : 'h-0'
            }
          />
        ) : (
          <ChatHistory />
        )}
      </OpenAgentContext.Provider>
      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col items-stretch">
        <InternalAppFrame />
        <UsageWarningBadge />
        <ChatPanelFooter key={openAgent} />
      </div>
    </div>
  );
}
