import type { SelectedElement } from '@stagewise/toolbar';

interface FiberNode {
  displayName?: string;
  name?: string;
  tag: number; // Identifies the type of fiber
  type: any; // For HostComponent, it's a string (e.g., 'div'). For Class/Function components, it's the class/function.
  return: FiberNode | null; // Parent fiber in the tree
  _debugOwner?: {
    name: string;
    env: string;
  };
  // Other properties like stateNode, key, memoizedProps exist but are not used here.
}

// Approximate Fiber Tags (numeric values can be checked in React source or DevTools)
// These constants help in identifying the type of a Fiber node.
const FunctionComponent = 0;
const ClassComponent = 1;
const HostComponent = 5;

export interface ComponentInfo {
  name: string;
  type: 'regular' | 'rsc';
}

function getOwnProperties(element: HTMLElement) {
  // get all non-standard properties from the element
  const ownProperties = {};
  for (const key of Object.getOwnPropertyNames(element)) {
    if (
      !key.startsWith('__reactFiber$') &&
      !key.startsWith('__reactInternalInstance$')
    ) {
      ownProperties[key] = (element as any)[key];
    }
  }
  return ownProperties;
}

export function getReactComponentHierarchyFromElement(element: HTMLElement) {
  const ownProperties = getOwnProperties(element);
  return getReactComponentHierarchy(ownProperties);
}

export function getReactComponentHierarchyFromSelectedElement(
  element: SelectedElement,
) {
  return getReactComponentHierarchy(element.ownProperties);
}

/**
 * Attempts to find the hierarchy of React components (up to 3) that an HTMLElement belongs to.
 * It returns an array of objects, each containing the component's name, type ('client' or 'server'),
 * and the source file path if available. The array is ordered from the closest component to the furthest.
 *
 * IMPORTANT: This function relies on React's internal Fiber architecture,
 * which is not a public API and can change between React versions.
 * It is most reliable in development environments.
 *
 * @param element The HTMLElement to inspect.
 * @returns An array of ComponentInfo objects, or null if no components are found or the element is not React-managed.
 */
export function getReactComponentHierarchy(
  ownProperties: Record<string, any>,
): ComponentInfo[] | null {
  if (!ownProperties) {
    return null;
  }

  const components: ComponentInfo[] = [];
  const maxComponents = 3;

  // 1. Find the internal React Fiber node key.
  // React attaches a Fiber node reference to the DOM element.
  // The key usually starts with '__reactFiber$' or '__reactInternalInstance$'.
  const fiberKey = Object.keys(ownProperties).find(
    (key) =>
      key.startsWith('__reactFiber$') ||
      key.startsWith('__reactInternalInstance$'),
  );

  if (!fiberKey) {
    return null;
  }

  let currentFiber: FiberNode | null = ownProperties[fiberKey];

  if (!currentFiber) {
    return null;
  }

  // 2. Traverse up the Fiber tree.
  while (currentFiber && components.length < maxComponents) {
    let componentData: ComponentInfo | null = null;

    // Case 1: Current fiber is a user-defined Function or Class component
    if (
      currentFiber.tag === ClassComponent ||
      currentFiber.tag === FunctionComponent
    ) {
      const componentDefinition = currentFiber.type;
      if (componentDefinition) {
        const name =
          componentDefinition.displayName ||
          componentDefinition.name ||
          currentFiber._debugOwner?.name || // Check direct name on fiber
          'AnonymousComponent';
        // Default to 'client' for components found directly in the hierarchy
        componentData = { name, type: 'regular' };
      }
    }
    // Case 2: Current fiber is a HostComponent (DOM element), check its _debugOwner
    // This is a heuristic for identifying components that might be Server Components (RSC).
    else if (
      currentFiber.tag === HostComponent &&
      currentFiber._debugOwner &&
      currentFiber._debugOwner.env?.toLowerCase().includes('server')
    ) {
      componentData = { name: currentFiber._debugOwner.name, type: 'rsc' };
    }

    if (componentData) {
      // Avoid adding the exact same component info if encountered through different means
      const alreadyExists = components.some(
        (c) => c.name === componentData!.name && c.type === componentData!.type,
      );
      if (!alreadyExists) {
        components.push(componentData);
      }
    }
    currentFiber = currentFiber.return;
  }

  return components.length > 0 ? components : null;
}

export function getSelectedElementAnnotation(element: HTMLElement) {
  const hierarchy = getReactComponentHierarchy(element);
  if (hierarchy?.[0]) {
    return {
      annotation: `${hierarchy[0].name}${hierarchy[0].type === 'rsc' ? ' (RSC)' : ''}`,
    };
  }
  return { annotation: null };
}

export function getSelectedElementsPrompt(elements: SelectedElement[]) {
  const selectedComponentHierarchies = elements.map((e) =>
    getReactComponentHierarchyFromSelectedElement(e),
  );

  if (selectedComponentHierarchies.some((h) => h && h.length > 0)) {
    const content = `This is additional information on the elements that the user selected. Use this information to find the correct element in the codebase.

  ${selectedComponentHierarchies.map((h, index) => {
    return `
<element index="${index + 1}">
  ${h.length === 0 ? 'No React component as parent detected' : `React component tree (from closest to farthest, 3 closest elements): ${h.map((c) => `{name: ${c.name}, type: ${c.type}}`).join(' child of ')}`}
</element>
    `;
  })}
  `;

    return content;
  }

  return null;
}
