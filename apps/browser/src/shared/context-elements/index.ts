export type ContextElement = {
  id?: string;
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
  parent: ContextElement | null;
  siblings: ContextElement[];
  children: ContextElement[];
};
