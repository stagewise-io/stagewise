import type { ContextElement } from '@shared/context-elements';

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

const serializeElementRecursive = (
  element: Element,
  mode: 'originalElement' | 'children' | 'parents' | 'siblings',
  depth: number,
  backendNodeId?: number | undefined,
): ContextElement => {
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

  let children: ContextElement[] = [];
  let parent: ContextElement | null = null;
  let siblings: ContextElement[] = [];

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
    textContent: truncateString(element.textContent || '', 512) ?? 'unknown',
    parent,
    siblings,
    children,
  };
};

export const serializeElement = (
  element: Element,
  backendNodeId: number,
): ContextElement => {
  return serializeElementRecursive(
    element,
    'originalElement',
    0,
    backendNodeId,
  );
};
