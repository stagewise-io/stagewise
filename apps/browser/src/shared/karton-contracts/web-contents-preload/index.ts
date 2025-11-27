export type SelectedElement = {
  id: string;
  tagName: string;
  attributes: Record<string, string>;
  ownProperties: Record<string, unknown>;
  boundingClientRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  xpath: string;
  textContent: string;
  parent: SelectedElement | null;
  siblings: SelectedElement[];
  children: SelectedElement[];
};

export type TabState = {
  selectedElementIds: string[]; // Communicated from main process to client. If an element get's removed from the selected element IDs, the tab removes it from it's presentation as well.
};

export type TabKartonContract = {
  state: TabState;
  clientProcedures: {
    startElementSelection: () => Promise<void>; // Starts the element selection
    stopElementSelection: () => Promise<void>; // Stops element selection. Doesn't clear selected elements
    getLastElementInformation: (
      selectedElementId: string,
    ) => Promise<SelectedElement>; // Returns the last known information about an element. Can be used to get the most up-to-date information about an element. Also returns information about elements that may not be selected anymore.
  };
  serverProcedures: {
    addElement: (element: SelectedElement) => Promise<void>; // Adds an element to the selected elements. Is triggered when the user removes an element through the canvas itself.
    removeElement: (elementId: SelectedElement) => Promise<void>; // Removes an element from the selected elements. Is triggered when user adds an element through the canvas itself.
  };
};

export const defaultState: TabState = {
  selectedElementIds: [],
};
