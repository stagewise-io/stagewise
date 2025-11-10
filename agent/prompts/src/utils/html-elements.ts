import type {
  ReactSelectedElementInfo,
  SelectedElement,
} from '@stagewise/karton-contract';

type ElementRole = 'parent' | 'selected-element' | 'sibling' | 'child';

interface CollectedElement {
  element: SelectedElement;
  role: ElementRole;
  depth: number;
}

/**
 * Collects parent elements up to maxDepth levels
 */
function collectParents(
  element: SelectedElement,
  maxDepth: number,
): CollectedElement[] {
  const parents: CollectedElement[] = [];
  let current = element.parent;
  let depth = -1;

  while (current && parents.length < maxDepth) {
    parents.unshift({
      element: current,
      role: 'parent',
      depth: depth--,
    });
    current = current.parent;
  }

  return parents;
}

/**
 * Recursively collects children up to maxDepth levels
 */
function collectChildren(
  element: SelectedElement,
  maxDepth: number,
  currentDepth = 1,
): CollectedElement[] {
  if (currentDepth > maxDepth || !element.children?.length) {
    return [];
  }

  const collected: CollectedElement[] = [];

  for (const child of element.children) {
    collected.push({
      element: child,
      role: 'child',
      depth: currentDepth,
    });

    // Recursively collect deeper children
    collected.push(...collectChildren(child, maxDepth, currentDepth + 1));
  }

  return collected;
}

/**
 * Gets siblings of the selected element from its parent
 */
function getSiblings(element: SelectedElement): SelectedElement[] {
  if (!element.parent?.children) {
    return [];
  }

  return element.parent.children.filter(
    (child) => child.stagewiseId !== element.stagewiseId,
  );
}

/**
 * Serializes a single element with role and depth metadata
 */
function serializeElement(
  element: SelectedElement,
  role: ElementRole,
  depth: number,
  codeMetadata: SelectedElement['codeMetadata'],
  reactInfo?: ReactSelectedElementInfo,
  isSelected = false,
): string {
  const elementType = element.nodeType.toLowerCase();
  let selector: string | undefined;

  // Construct selector from attributes if available
  if (element.attributes.id) {
    selector = `#${element.attributes.id}`;
  } else if (element.attributes.class) {
    selector = `.${element.attributes.class.split(' ').join('.')}`;
  }

  // Construct HTML representation
  let htmlString = `<${elementType}`;

  // Add attributes
  Object.entries(element.attributes).forEach(([key, value]) => {
    htmlString += ` ${key}="${value}"`;
  });

  htmlString += '>';

  // Add text content if present
  if (element.textContent) {
    htmlString += element.textContent;
  }

  htmlString += `</${elementType}>`;

  // Build opening tag with metadata
  let openingTag = '<html-element';

  if (elementType) {
    openingTag += ` type="${elementType}"`;
  }

  openingTag += ` role="${role}"`;

  if (isSelected) {
    openingTag += ' selected="true"';
  }

  openingTag += ` depth="${depth}"`;

  if (selector) {
    openingTag += ` selector="${selector}"`;
  }

  openingTag += ` xpath="${element.xpath}"`;
  openingTag += '>';

  const reactInfoTag = reactInfo
    ? `<react-info>\n<component-tree>${serializeComponentTree(reactInfo)}</component-tree>\n</react-info>\n`
    : '';

  const relatedFilesTag =
    codeMetadata.length > 0
      ? `<related-files>\n${serializeRelatedFiles(codeMetadata)}\n</related-files>\n`
      : '';

  return `${openingTag}\n${htmlString.trim()}\n${reactInfoTag}${relatedFilesTag}</html-element>`;
}

const serializeComponentTree = (
  reactInfo: ReactSelectedElementInfo,
  maxDepth = 5,
): string => {
  const names: string[] = [];
  let curr = reactInfo;
  let depth = 0;
  while (curr?.componentName && depth < maxDepth) {
    names.push(curr.componentName);
    curr = curr.parent || null;
    depth++;
  }
  return `<component-tree>\n${names.join(' < ')}\n</component-tree>\n`;
};

const serializeRelatedFiles = (
  codeMetadata: SelectedElement['codeMetadata'],
): string => {
  return codeMetadata
    .map(
      (file) =>
        `<file path="${file.relativePath}" relation="${file.relation}" />`,
    )
    .join('\n');
};

/**
 * Converts a list of DOM elements to an LLM-readable string with DOM element context.
 *
 * @param elements - List of DOM elements to convert
 * @returns Formatted string with DOM element context that the LLM can parse
 */
export function htmlElementToContextSnippet(
  elements: SelectedElement[],
): string {
  const hasCodeMetadata = elements.some((element) => element?.codeMetadata);
  const result = `
  <dom-elements>
    <description> These are the elements that the user has selected before making the request: </description>
    <content>
      ${elements.map((element) => htmlElementsToContextSnippet(element)).join('\n\n')}
    </content>
  </dom-elements>

  ${
    hasCodeMetadata
      ? `
  <code-metadata>
    <description>
    These are the code snippets that belong to the HTML elements that the user has selected before making the request.
    </description>
    <content>
      ${codeMetadataToContextSnippet(elements.flatMap((element) => element.codeMetadata).reduce<SelectedElement['codeMetadata']>((acc, curr) => (acc.find((m) => m.relativePath === curr.relativePath) ? acc : acc.concat(curr)), []))}
    </content>
  </code-metadata>
  `
      : ''
  }
  `;
  return result;
}

function codeMetadataToContextSnippet(
  codeMetadata: {
    relativePath: string;
    startLine?: number;
    endLine?: number;
    content?: string;
    relation?: string;
  }[],
): string {
  return codeMetadata
    .map(
      (m) =>
        `<relative-path>${m.relativePath}</relative-path>\n${m.startLine ? `<start-line>${m.startLine}</start-line>\n` : ''}${m.endLine ? `<end-line>${m.endLine}</end-line>\n` : ''}${m.content ? `<content>${m.content}</content>` : ''}`,
    )
    .join('\n\n');
}

/**
 * Converts a DOM element to an LLM-readable context snippet.
 * Includes up to 2 parent levels, siblings, and up to 4 child levels.
 *
 * @param element - The DOM element to convert
 * @param maxCharacterAmount - Optional maximum number of characters to include
 * @returns Formatted XML-style string that the LLM can parse
 */
export function htmlElementsToContextSnippet(
  element: SelectedElement,
  maxCharacterAmount = 2000,
): string {
  if (!element) {
    throw new Error('Element cannot be null or undefined');
  }

  try {
    // Collect all elements in the hierarchy
    const parents = collectParents(element, 2);
    const siblings = getSiblings(element);
    const children = collectChildren(element, 4);

    // Build the full hierarchy as a flat list
    const allElements: CollectedElement[] = [
      ...parents,
      { element, role: 'selected-element', depth: 0 },
      ...siblings.map((sibling) => ({
        element: sibling,
        role: 'sibling' as ElementRole,
        depth: 0,
      })),
      ...children,
    ];

    // Serialize all elements
    let serializedElements = allElements.map((item) =>
      serializeElement(
        item.element,
        item.role,
        item.depth,
        item.element.codeMetadata,
        item.element.frameworkInfo?.react,
        item.role === 'selected-element',
      ),
    );

    // Apply character limit by truncating from deepest children upward
    let result = serializedElements.join('\n\n');

    if (maxCharacterAmount && result.length > maxCharacterAmount) {
      // Start removing deepest children first
      let currentMaxDepth = 4;

      while (result.length > maxCharacterAmount && currentMaxDepth > 0) {
        // Filter out elements at the current max depth
        serializedElements = allElements
          .filter((item) => {
            // Keep everything except children at or beyond current max depth
            if (item.role === 'child') {
              return item.depth < currentMaxDepth;
            }
            return true;
          })
          .map((item) =>
            serializeElement(
              item.element,
              item.role,
              item.depth,
              item.element.codeMetadata,
              item.element.frameworkInfo?.react,
              item.role === 'selected-element',
            ),
          );

        result = serializedElements.join('\n\n');
        currentMaxDepth--;
      }

      // If still too long, start removing siblings
      if (result.length > maxCharacterAmount) {
        serializedElements = allElements
          .filter(
            (item) =>
              item.role !== 'sibling' &&
              (item.role !== 'child' || item.depth < currentMaxDepth),
          )
          .map((item) =>
            serializeElement(
              item.element,
              item.role,
              item.depth,
              item.element.codeMetadata,
              item.element.frameworkInfo?.react,
              item.role === 'selected-element',
            ),
          );

        result = serializedElements.join('\n\n');
      }

      // If still too long, start removing parents from oldest
      if (result.length > maxCharacterAmount) {
        serializedElements = allElements
          .filter(
            (item) =>
              (item.role === 'parent' && item.depth > -2) ||
              item.role === 'selected-element' ||
              (item.role === 'child' && item.depth < currentMaxDepth),
          )
          .map((item) =>
            serializeElement(
              item.element,
              item.role,
              item.depth,
              item.element.codeMetadata,
              item.element.frameworkInfo?.react,
              item.role === 'selected-element',
            ),
          );

        result = serializedElements.join('\n\n');
      }

      // Final truncation if still over limit (truncate selected element content)
      if (result.length > maxCharacterAmount) {
        result = result.substring(0, maxCharacterAmount);
      }
    }

    return result;
  } catch (error) {
    throw new Error(
      `Error processing HTML element: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
