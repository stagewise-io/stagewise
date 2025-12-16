import type { SerializableWheelEvent } from '@shared/karton-contracts/web-contents-preload';
import { useKartonProcedure } from './karton';
import { useEffect } from 'react';

export const WheelTunnel = () => {
  const handleWheelZoom = useKartonProcedure((p) => p.handleWheelZoom);

  useEffect(() => {
    window.tunnelWheel = (wheelEvent) => {
      // Serialize the WheelEvent to a plain object for RPC transport
      const serializedEvent: SerializableWheelEvent = {
        deltaY: wheelEvent.deltaY,
        deltaX: wheelEvent.deltaX,
        deltaMode: wheelEvent.deltaMode,
        ctrlKey: wheelEvent.ctrlKey,
        metaKey: wheelEvent.metaKey,
        shiftKey: wheelEvent.shiftKey,
        altKey: wheelEvent.altKey,
      };
      handleWheelZoom(serializedEvent);
    };

    return () => {
      window.tunnelWheel = undefined;
    };
  }, [handleWheelZoom]);

  return null;
};
