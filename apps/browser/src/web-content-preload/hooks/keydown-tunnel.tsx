import type { SerializableKeyboardEvent } from '@shared/karton-contracts/web-contents-preload';
import { useKartonProcedure } from './karton';
import { useEffect } from 'react';

export const KeydownTunnel = () => {
  const handleKeyDown = useKartonProcedure((p) => p.handleKeyDown);

  useEffect(() => {
    window.tunnelKeyDown = (keyDownEvent) => {
      // Serialize the KeyboardEvent to a plain object for RPC transport
      const serializedEvent: SerializableKeyboardEvent = {
        key: keyDownEvent.key,
        code: keyDownEvent.code,
        keyCode: keyDownEvent.keyCode,
        which: keyDownEvent.which,
        altKey: keyDownEvent.altKey,
        ctrlKey: keyDownEvent.ctrlKey,
        shiftKey: keyDownEvent.shiftKey,
        metaKey: keyDownEvent.metaKey,
        repeat: keyDownEvent.repeat,
        isComposing: keyDownEvent.isComposing,
        location: keyDownEvent.location,
      };
      handleKeyDown(serializedEvent);
    };

    return () => {
      window.tunnelKeyDown = undefined;
    };
  }, [handleKeyDown]);

  return null;
};
