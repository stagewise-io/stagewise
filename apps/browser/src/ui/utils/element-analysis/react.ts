import type { ReactSelectedElementInfo } from '@shared/karton-contracts/ui';

export const getSelectedElementReactInfo = (
  element: HTMLElement,
): ReactSelectedElementInfo => {
  const getDebugOwner = (fiber: any): any | null => {
    return (fiber && (fiber._debugOwner || fiber.debugOwner)) || null;
  };
  const isRSCFiber = (fiber: any): boolean => {
    const owner = getDebugOwner(fiber);
    const env = owner?.env;
    if (typeof env === 'string') {
      return env.toLowerCase() === 'server';
    }
    return false;
  };
  const getInternalFiberFromNode = (node: Element): any | null => {
    // Try modern React DOM keys first
    const propNames = Object.getOwnPropertyNames(node);
    for (const key of propNames) {
      if (key.startsWith('__reactFiber$')) {
        return (node as any)[key] ?? null;
      }
      if (key.startsWith('__reactInternalInstance$')) {
        return (node as any)[key] ?? null;
      }
    }
    // Try root container
    const maybeRoot = (node as any)._reactRootContainer;
    if (maybeRoot?._internalRoot?.current) {
      return maybeRoot._internalRoot.current;
    }
    return null;
  };

  const getFiberFromDevtools = (node: Element): any | null => {
    const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook || !hook.renderers) return null;
    try {
      // hook.renderers is a Map-like of rendererId -> rendererInterface
      const renderers: Map<number, any> = hook.renderers;
      for (const [, renderer] of Array.from(renderers.entries())) {
        if (typeof renderer?.findFiberByHostInstance === 'function') {
          const fiber = renderer.findFiberByHostInstance(node);
          if (fiber) return fiber;
        }
      }
    } catch {
      // Ignore errors from different React versions
    }
    return null;
  };

  const findNearestFiber = (start: Element): any | null => {
    let current: Element | null = start;
    while (current) {
      const fiber = getInternalFiberFromNode(current);
      if (fiber) return fiber;
      current = current.parentElement;
    }
    // Fallback to DevTools if available
    return getFiberFromDevtools(start);
  };

  const isComponentFiber = (fiber: any): boolean => {
    if (!fiber) return false;
    // Treat RSC fibers (Server Components) as components even if no element type
    if (isRSCFiber(fiber) && getDebugOwner(fiber)?.name) {
      return true;
    }
    const t = fiber.type;
    // Host root and host components are not React components we want to list
    if (t == null) return false; // HostRoot or special internal nodes
    if (typeof t === 'string') return false; // HostComponent like 'div'
    return typeof t === 'function' || typeof t === 'object';
  };

  const getDisplayNameForFiber = (fiber: any): string => {
    // Prefer RSC naming via _debugOwner.name when identified as Server
    if (isRSCFiber(fiber)) {
      const ownerName = getDebugOwner(fiber)?.name;
      if (typeof ownerName === 'string' && ownerName.length > 0) {
        return ownerName;
      }
    }
    const t = fiber?.type;
    if (!t) return 'Anonymous';
    if (typeof t === 'string') return t;
    // Function or class components
    if (typeof t === 'function') {
      return t.displayName || t.name || 'Anonymous';
    }
    // ForwardRef, Memo, etc.
    if (typeof t === 'object') {
      const displayName =
        (t as any).displayName ||
        (t as any)?.render?.displayName ||
        (t as any)?.render?.name ||
        (fiber as any)?.elementType?.displayName ||
        (fiber as any)?.elementType?.name;
      return displayName || 'Anonymous';
    }
    return 'Anonymous';
  };

  const isPrimitiveWrapperName = (name: string | undefined): boolean => {
    if (!name) return false;
    const lower = String(name).toLowerCase();
    return lower.startsWith('primitive.');
  };

  const startingFiber = findNearestFiber(element);
  if (!startingFiber) return null;

  const components: Array<{
    name: string;
    prototype?: string;
    isRSC: boolean;
  }> = [];
  // Track seen RSC component names to avoid duplicates in the tree
  const seenRSCNames = new Set<string>();
  const visited = new Set<any>();
  let fiber: any | null = startingFiber;

  // Walk up fiber.return chain, collecting up to 20 component fibers
  while (fiber && components.length < 20) {
    if (visited.has(fiber)) break;
    visited.add(fiber);
    if (isComponentFiber(fiber)) {
      const displayName = getDisplayNameForFiber(fiber);
      if (!isPrimitiveWrapperName(displayName)) {
        const isRSC = isRSCFiber(fiber);
        // Ensure we only show unique RSC components by name
        if (isRSC && seenRSCNames.has(displayName)) {
          // Skip duplicate RSC component name
        } else {
          components.push({
            name: displayName,
            isRSC,
          });
          if (isRSC) {
            seenRSCNames.add(displayName);
          }
        }
      }
    }
    fiber = fiber.return || null;
  }

  if (components.length === 0) return null;

  // Build nested hierarchy with nearest component at the top-level
  let hierarchy: ReactSelectedElementInfo = null;
  for (let i = components.length - 1; i >= 0; i--) {
    const comp = components[i];
    if (!comp) continue;
    // When adding a component parent, avoid same-name adjacency if both are RSC
    if (
      hierarchy &&
      comp.isRSC &&
      hierarchy.isRSC &&
      comp.name === hierarchy.componentName
    ) {
      continue;
    }
    hierarchy = {
      componentName: comp.name,
      serializedProps: {},
      isRSC: comp.isRSC,
      parent: hierarchy,
    };
  }
  return hierarchy;
};
