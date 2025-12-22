import type { SelectedElement } from '@shared/selected-elements';
import type { ReactSelectedElementInfo } from '@shared/karton-contracts/ui';

// Properties that should be excluded to prevent prototype pollution and reduce noise
const excludedProperties = new Set([
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  'toLocaleString',
]);

export const copyObject = (obj: unknown, depth = 0, maxDepth = 3): unknown => {
  // Handle primitive values first
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle non-object types
  if (typeof obj !== 'object') {
    return typeof obj === 'function' ? undefined : obj;
  }

  // Stop recursion if we've reached max depth
  if (depth >= maxDepth) {
    // Return empty containers for complex types, primitives as-is
    if (Array.isArray(obj)) {
      return [];
    }
    return {};
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj
      .map((item) => copyObject(item, depth + 1, maxDepth))
      .filter((item) => item !== undefined);
  }

  // Handle objects
  const result: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(obj)) {
    // Skip excluded properties
    if (excludedProperties.has(key)) {
      continue;
    }

    try {
      const value = (obj as Record<string, unknown>)[key];

      // Skip functions
      if (typeof value === 'function') {
        continue;
      }

      // Recursively copy the value
      const copiedValue = copyObject(value, depth + 1, maxDepth);

      // Only include the property if it's not undefined
      if (copiedValue !== undefined) {
        result[key] = copiedValue;
      }
    } catch {
      // Skip properties that throw errors when accessed
      continue;
    }
  }

  return result;
};

// Truncation utilities to ensure data conforms to schema limits
const truncateString = <T extends string | null | undefined>(
  str: T,
  maxLength: number,
): T => {
  if (!str) return str;
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...` as T;
};

const truncateAttributes = (
  attributes: Record<string, string>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  const entries = Object.entries(attributes);

  // Limit to 100 entries max
  const limitedEntries = entries.slice(0, 100);

  for (const [key, value] of limitedEntries) {
    if (value === null || value === undefined) continue;

    // Special handling for important attributes with 4096 char limit
    const importantAttributes = new Set([
      'class',
      'id',
      'style',
      'name',
      'role',
      'href',
      'for',
      'placeholder',
      'alt',
      'title',
      'ariaLabel',
      'ariaRole',
      'ariaDescription',
    ]);

    if (importantAttributes.has(key)) {
      result[key] = truncateString(value, 4096)!;
    } else {
      // Custom attributes have 256 char limit
      result[key] = truncateString(value, 256)!;
    }
  }

  return result;
};

const truncateOwnProperties = (
  _properties: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  // const entries = Object.entries(properties);
  const entries: [string, unknown][] = []; // disable for now - the amount of data might have caused abort errors

  // Limit to 500 entries max
  const limitedEntries = entries.slice(0, 500);

  for (const [key, value] of limitedEntries) {
    // Apply deep truncation to nested objects/arrays
    result[key] = truncateValue(value, 0, 2); // Keep original depth limits
  }

  return result;
};

const truncateValue = (
  value: unknown,
  currentDepth: number,
  maxDepth: number,
): unknown => {
  if (value === null || value === undefined) return value;

  if (currentDepth >= maxDepth) {
    if (Array.isArray(value)) return [];
    if (typeof value === 'object') return {};
    return value;
  }

  if (typeof value === 'string') {
    // Apply reasonable string truncation for nested values
    return truncateString(value, 1024);
  }

  if (Array.isArray(value)) {
    // Limit array size to prevent excessive data
    return value
      .slice(0, 50)
      .map((item) => truncateValue(item, currentDepth + 1, maxDepth));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value);

    // Limit object entries to prevent excessive data
    const limitedEntries = entries.slice(0, 50);

    for (const [key, val] of limitedEntries) {
      result[key] = truncateValue(val, currentDepth + 1, maxDepth);
    }

    return result;
  }

  return value;
};

/**
 * Extract computed styles from an element.
 * Only extracts styles for the original element (not for children/parents/siblings).
 */
const getComputedStyles = (
  element: Element,
  mode: 'originalElement' | 'children' | 'parents' | 'siblings',
): SelectedElement['computedStyles'] | undefined => {
  // Only extract computed styles for the original element
  if (mode !== 'originalElement') {
    return undefined;
  }

  try {
    const computed = window.getComputedStyle(element);
    const styles: SelectedElement['computedStyles'] = {};

    // Font-family
    const fontFamily = computed.fontFamily;
    if (fontFamily && fontFamily !== 'initial' && fontFamily !== 'inherit') {
      styles.fontFamily = truncateString(fontFamily, 256) ?? undefined;
    }

    // Background-color
    const backgroundColor = computed.backgroundColor;
    styles.backgroundColor = backgroundColor;

    // Background-image (truncated to 500 characters)
    const backgroundImage = computed.backgroundImage;
    if (
      backgroundImage &&
      backgroundImage !== 'initial' &&
      backgroundImage !== 'inherit' &&
      backgroundImage !== 'none'
    ) {
      styles.backgroundImage =
        truncateString(backgroundImage, 500) ?? undefined;
    }

    // Border style (use shorthand to get all border properties)
    const border = computed.border;
    styles.border = border ? truncateString(border, 256) : undefined;

    // Box-shadow
    const boxShadow = computed.boxShadow;
    styles.boxShadow = boxShadow ? truncateString(boxShadow, 256) : undefined;

    // Filter
    const filter = computed.filter;
    styles.filter = filter ? truncateString(filter, 256) : undefined;

    // Transform
    const transform = computed.transform;
    styles.transform = transform ? truncateString(transform, 256) : undefined;

    // Only return if we have at least one style
    return Object.keys(styles).length > 0 ? styles : undefined;
  } catch {
    // Silently fail if computed styles can't be accessed
    return undefined;
  }
};

/**
 * Get text content of an element, excluding content from <style> and <script> tags.
 * This prevents CSS and JavaScript code from appearing in textContent.
 */
const getCleanTextContent = (element: Element): string => {
  // Clone the element to avoid modifying the original
  const clone = element.cloneNode(true) as Element;

  // Remove all <style> and <script> elements from the clone
  const styleAndScriptElements = clone.querySelectorAll('style, script');
  styleAndScriptElements.forEach((el) => el.remove());

  // Get textContent from the cleaned clone
  return clone.textContent || '';
};

const getXPathForElement = (element: Element, useId: boolean) => {
  if (element.id && useId) {
    return `/*[@id="${element.id}"]`;
  }

  let nodeElem: Element | null = element;
  const parts: string[] = [];
  while (nodeElem && Node.ELEMENT_NODE === nodeElem.nodeType) {
    let nbOfPreviousSiblings = 0;
    let hasNextSiblings = false;
    let sibling = nodeElem.previousSibling;
    while (sibling) {
      if (
        sibling.nodeType !== Node.DOCUMENT_TYPE_NODE &&
        sibling.nodeName === nodeElem.nodeName
      ) {
        nbOfPreviousSiblings++;
      }
      sibling = sibling.previousSibling;
    }
    sibling = nodeElem.nextSibling;
    while (sibling) {
      if (sibling.nodeName === nodeElem.nodeName) {
        hasNextSiblings = true;
        break;
      }
      sibling = sibling.nextSibling;
    }
    const prefix = nodeElem.prefix ? `${nodeElem.prefix}:` : '';
    const nth =
      nbOfPreviousSiblings || hasNextSiblings
        ? `[${nbOfPreviousSiblings + 1}]`
        : '';
    parts.push(prefix + nodeElem.localName + nth);
    nodeElem = nodeElem.parentElement;
  }
  return parts.length ? `/${parts.reverse().join('/')}` : '';
};

/**
 * Extract React component information from a DOM element.
 * This function walks up the React fiber tree to collect component hierarchy.
 */
const getReactInfo = (element: Element): ReactSelectedElementInfo => {
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
  if (!startingFiber) {
    return null;
  }

  const components: Array<{
    name: string;
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

  if (components.length === 0) {
    return null;
  }

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

const serializeElementRecursive = (
  element: Element,
  mode: 'originalElement' | 'children' | 'parents' | 'siblings',
  depth: number,
  backendNodeId?: number | undefined,
): SelectedElement => {
  const boundingRect = element.getBoundingClientRect();

  // Collect raw attributes
  const rawAttributes = element.getAttributeNames().reduce(
    (acc, name) => {
      const value = element.getAttribute(name);
      if (value !== null) {
        acc[name] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  // Collect raw own properties
  const rawOwnProperties = Object.getOwnPropertyNames(element)
    .filter((prop) => !excludedProperties.has(prop))
    .reduce(
      (acc, prop) => {
        try {
          const value = element[prop as keyof HTMLElement];
          // Only include serializable values
          if (typeof value !== 'function') {
            acc[prop] = copyObject(value, 0, 2);
          }
        } catch {
          // Skip properties that throw errors when accessed
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

  let children: SelectedElement[] = [];
  let parent: SelectedElement | null = null;
  let siblings: SelectedElement[] = [];

  // Limit recursion depth
  if (depth < 10) {
    if (mode === 'originalElement' || mode === 'children') {
      children = Array.from(element.children)
        .slice(0, 5)
        .map((c) =>
          serializeElementRecursive(c as HTMLElement, 'children', depth + 1),
        );
    }

    if (mode === 'originalElement' || mode === 'parents') {
      if (element.parentElement) {
        parent = serializeElementRecursive(
          element.parentElement,
          'parents',
          depth + 1,
        );
      }
    }

    if (mode === 'originalElement') {
      if (element.parentElement) {
        siblings = Array.from(element.parentElement.children)
          .filter((c) => c !== element)
          .slice(0, 10)
          .map((c) =>
            serializeElementRecursive(c as HTMLElement, 'siblings', depth + 1),
          );
      }
    }
  }

  // Extract React info only for the original element (not for children/parents/siblings)
  const reactInfo =
    mode === 'originalElement' ? getReactInfo(element) : undefined;

  // Extract computed styles only for the original element
  const computedStyles = getComputedStyles(element, mode);

  return {
    id: backendNodeId ? backendNodeId.toString() : undefined,
    tagName: truncateString(element.nodeName, 96) ?? 'unknown',
    xpath:
      truncateString(getXPathForElement(element, false), 1024) ?? 'unknown',
    attributes: truncateAttributes(rawAttributes),
    ownProperties: truncateOwnProperties(rawOwnProperties),
    boundingClientRect: {
      top: boundingRect.top,
      left: boundingRect.left,
      width: boundingRect.width,
      height: boundingRect.height,
    },
    textContent: truncateString(getCleanTextContent(element), 512) ?? 'unknown',
    parent,
    siblings,
    children,
    frameworkInfo:
      reactInfo !== null && reactInfo !== undefined
        ? { react: reactInfo }
        : undefined,
    computedStyles,
  };
};

export const serializeElement = (
  element: Element,
  backendNodeId: number,
): SelectedElement => {
  const result = serializeElementRecursive(
    element,
    'originalElement',
    0,
    backendNodeId,
  );
  return result;
};
