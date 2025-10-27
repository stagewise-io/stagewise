import type { SelectedElement } from '@stagewise/karton-contract';

type ElementRole = 'selected-element';

/**
 * Serializes a single element with role and depth metadata
 */
function serializeElement(
  element: SelectedElement,
  role: ElementRole,
  depth: number,
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

  return `${openingTag}\n${htmlString.trim()}\n</html-element>`;
}

/**
 * Converts a list of DOM elements to an LLM-readable string with DOM element context.
 *
 * @param elements - List of DOM elements to convert
 * @returns Formatted string with DOM element context that the LLM can parse
 */
export function htmlElementToContextSnippet(
  elements: SelectedElement[],
): string {
  const result = `
  <dom-elements>
    <description> These are the elements that the user has selected before making the request: </description>
    <content>
      ${elements.map((element) => htmlElementsToContextSnippet(element)).join('\n\n')}
    </content>
  </dom-elements>`;
  return result;
}

/**
 * Converts a DOM element to an LLM-readable context snippet.
 *
 * @param element - The DOM element to convert
 * @param maxCharacterAmount - Optional maximum number of characters to include
 * @returns Formatted XML-style string that the LLM can parse
 */
export function htmlElementsToContextSnippet(
  element: SelectedElement,
  maxCharacterAmount = 10000,
): string {
  if (!element) {
    throw new Error('Element cannot be null or undefined');
  }

  try {
    // Serialize the element
    let result = serializeElement(element, 'selected-element', 0, true);

    // Apply character limit if needed
    if (maxCharacterAmount && result.length > maxCharacterAmount) {
      result = result.substring(0, maxCharacterAmount);
    }

    return result;
  } catch (error) {
    throw new Error(
      `Error processing HTML element: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
