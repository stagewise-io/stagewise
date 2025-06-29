/**
 * Type definition for the selected element structure
 */
export interface SelectedElement {
  nodeType: string;
  xpath: string;
  attributes: Record<string, string>;
  textContent: string;
  ownProperties: Record<string, any>;
  boundingClientRect: {
    top: number;
    left: number;
    height: number;
    width: number;
  };
}

/**
 * Extracts and prioritizes attributes from the provided attributes object.
 * Prioritizes identifying attributes and separates data attributes.
 */
function processElementAttributes(attributes: Record<string, string>): {
  priorityAttrs: Record<string, string>;
  dataAttrs: Record<string, string>;
  otherAttrs: Record<string, string>;
} {
  const priorityAttrs: Record<string, string> = {};
  const dataAttrs: Record<string, string> = {};
  const otherAttrs: Record<string, string> = {};

  const priorityAttrNames = [
    'id',
    'class',
    'name',
    'type',
    'href',
    'src',
    'alt',
    'for',
    'placeholder',
  ];

  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith('data-')) {
      dataAttrs[key] = value;
    } else if (priorityAttrNames.includes(key.toLowerCase())) {
      priorityAttrs[key] = value;
    } else if (key.toLowerCase() !== 'style') {
      otherAttrs[key] = value;
    }
  }

  return { priorityAttrs, dataAttrs, otherAttrs };
}

/**
 * Generates a detailed context string for a selected element.
 */
export function generateElementContext(
  element: SelectedElement,
  index: number,
): string {
  let context = `<element index="${index + 1}">\n`;
  context += `  <tag>${element.nodeType.toLowerCase()}</tag>\n`;
  context += `  <xpath>${element.xpath}</xpath>\n`;

  const id = element.attributes.id;
  if (id) {
    context += `  <id>${id}</id>\n`;
  }

  const classAttr = element.attributes.class;
  if (classAttr) {
    const classes = classAttr
      .split(' ')
      .filter((cls) => cls.trim())
      .join(', ');
    if (classes) {
      context += `  <classes>${classes}</classes>\n`;
    }
  }

  const { priorityAttrs, dataAttrs, otherAttrs } = processElementAttributes(
    element.attributes,
  );
  const allAttrs = { ...priorityAttrs, ...otherAttrs, ...dataAttrs };

  if (Object.keys(allAttrs).length > 0) {
    context += `  <attributes>\n`;
    for (const [key, value] of Object.entries(allAttrs)) {
      // Skip class since it's already handled above
      if (key.toLowerCase() !== 'class') {
        context += `    <${key}>${value}</${key}>\n`;
      }
    }
    context += `  </attributes>\n`;
  }

  const text = element.textContent?.trim();
  if (text) {
    const maxLength = 100;
    context += `  <text>${text.length > maxLength ? `${text.substring(0, maxLength)}...` : text}</text>\n`;
  }

  // Add bounding client rect information
  const rect = element.boundingClientRect;
  context += `  <position>\n`;
  context += `    <top>${rect.top}</top>\n`;
  context += `    <left>${rect.left}</left>\n`;
  context += `    <width>${rect.width}</width>\n`;
  context += `    <height>${rect.height}</height>\n`;
  context += `  </position>\n`;

  // Add own properties if they exist
  if (Object.keys(element.ownProperties).length > 0) {
    context += `  <properties>\n`;
    for (const [key, value] of Object.entries(element.ownProperties)) {
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value);
      context += `    <${key}>${stringValue}</${key}>\n`;
    }
    context += `  </properties>\n`;
  }

  context += `</element>\n`;
  return context;
}
