export type TabState = {
  isInForeground: boolean; // If true, the tab content is in front of the UI. Has impact on interactivity of the overlays.
};

/**
 * Serializable representation of a KeyboardEvent for RPC transport.
 * Contains only the serializable properties needed from a DOM KeyboardEvent.
 */
export type SerializableKeyboardEvent = {
  key: string;
  code: string;
  keyCode: number;
  which: number;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  location: number;
};

export type TabKartonContract = {
  state: TabState;
  serverProcedures: {
    movePanelToForeground: (
      panel: 'stagewise-ui' | 'tab-content',
    ) => Promise<void>; // Moves the panel to foreground (in front of UI) and is triggered if some placeholder in the tab overlay is interacted with.
    handleKeyDown: (keyDownEvent: SerializableKeyboardEvent) => Promise<void>; // Handles a key down event.
  };
};

export const defaultState: TabState = {
  isInForeground: false,
};
