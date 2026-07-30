import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { useDebouncedValue } from '@ui/hooks/use-debounced-value';

const STALL_DELAY_MS = 5_000;

export const STALLED_STREAM_MESSAGE = 'Still on it…';

export function MessageStalledStream({
  parts,
}: {
  parts: AgentMessage['parts'];
}) {
  const stalledParts = useDebouncedValue<AgentMessage['parts'] | null>(
    parts,
    STALL_DELAY_MS,
    null,
  );

  if (stalledParts !== parts) return null;

  return (
    <div className="text-muted-foreground text-xs italic">
      {STALLED_STREAM_MESSAGE}
    </div>
  );
}
