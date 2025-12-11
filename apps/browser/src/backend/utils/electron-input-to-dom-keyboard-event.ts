import type { Input } from 'electron';

export function electronInputToDomKeyboardEvent(
  inputEvent: Input,
): KeyboardEvent {
  return {
    key: inputEvent.key,
    code: inputEvent.code,
    altKey: inputEvent.modifiers?.includes('alt'),
    ctrlKey: inputEvent.modifiers?.includes('control'),
    shiftKey: inputEvent.modifiers?.includes('shift'),
    metaKey: inputEvent.modifiers?.includes('meta'),
    isComposing: inputEvent.isComposing,
    location: inputEvent.location,
  } as KeyboardEvent;
}
