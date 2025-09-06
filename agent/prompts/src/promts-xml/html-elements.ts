import type { SelectedElement } from '@stagewise/karton-contract';

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
 * This is a convenience function for browser environments.
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

  let htmlString: string;
  let elementType: string;
  let selector: string | undefined;

  // Extract element type from nodeType
  elementType = element.nodeType.toLowerCase();

  // Construct selector from attributes if available
  if (element.attributes.id) {
    selector = `#${element.attributes.id}`;
  } else if (element.attributes.class) {
    selector = `.${element.attributes.class.split(' ').join('.')}`;
  }

  // Construct a simple HTML representation
  htmlString = `<${elementType}`;

  // Add attributes
  Object.entries(element.attributes).forEach(([key, value]) => {
    htmlString += ` ${key}="${value}"`;
  });

  // Close opening tag
  htmlString += '>';

  // Add text content if present
  if (element.textContent) {
    htmlString += element.textContent;
  }

  // Add closing tag
  htmlString += `</${elementType}>`;

  if (!htmlString || htmlString.trim() === '') {
    throw new Error('HTML string cannot be empty');
  }

  try {
    // Clean the HTML string
    const cleanedHtml = htmlString.trim();

    // Create XML-like tags with element metadata
    let openingTag = '<html-element';

    if (elementType) {
      openingTag += ` type="${elementType}"`;
    }

    if (selector) {
      openingTag += ` selector="${selector}"`;
    }

    // Add xpath information
    openingTag += ` xpath="${element.xpath}"`;
    openingTag += '>';

    let result = `${openingTag}\n${cleanedHtml}\n</html-element>`;

    // Apply character limit if specified
    if (maxCharacterAmount && result.length > maxCharacterAmount) {
      // Build the truncated opening tag first to know its length
      let truncatedOpeningTag = '<html-element';

      if (elementType) {
        truncatedOpeningTag += ` type="${elementType}"`;
      }

      if (selector) {
        truncatedOpeningTag += ` selector="${selector}"`;
      }

      // Add xpath information
      truncatedOpeningTag += ` xpath="${element.xpath}"`;
      truncatedOpeningTag += ' truncated="true">';

      const truncatedOpeningTagWithNewline = `${truncatedOpeningTag}\n`;
      const closingTagWithNewline = '\n</html-element>';
      const availableChars =
        maxCharacterAmount -
        truncatedOpeningTagWithNewline.length -
        closingTagWithNewline.length;

      if (availableChars > 0) {
        // Truncate the HTML content to fit
        const truncatedContent = cleanedHtml.substring(0, availableChars);
        result = `${truncatedOpeningTag}\n${truncatedContent}\n</html-element>`;
      } else {
        // If even the tags are too long, just truncate it
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
