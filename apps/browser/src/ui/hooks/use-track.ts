import type { TrackUIEvent } from '@shared/karton-contracts/ui';
import { useKartonProcedure } from './use-karton';

export function useTrack(): TrackUIEvent {
  return useKartonProcedure(
    (p) => p.telemetry.capture,
  ) as unknown as TrackUIEvent;
}
