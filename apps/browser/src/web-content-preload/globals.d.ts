// We simply use global variable shere in order to avoid any unnecessary overhead. We're in an isolated context anyway.
export declare global {
  interface Window {
    __CTX_SELECTION_UPDATE__:
      | ((
          element: Element,
          type: 'hover' | 'selected',
          active: boolean,
        ) => void)
      | undefined;
    __CTX_EXTRACT_INFO__:
      | ((element: Element, backendNodeId: number) => TrackedElement)
      | undefined;
  }
}
