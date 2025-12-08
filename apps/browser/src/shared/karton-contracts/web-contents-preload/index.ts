export type TabState = {
  isInForeground: boolean; // If true, the tab content is in front of the UI. Has impact on interactivity of the overlays.
};

export type TabKartonContract = {
  state: TabState;
  serverProcedures: {
    putIntoBackground: () => Promise<void>; // Puts the tab into background (behind UI) and is triggered if some placeholder in the tab overlay is interacted with.
  };
};

export const defaultState: TabState = {
  isInForeground: false,
};
