import type { ReactSelectedElementInfo } from '@shared/context-elements/react';
import type { ContextElement } from '@shared/context-elements';
import xml from 'xml';
import specialTokens from '../special-tokens.js';

/**
 * Gets siblings of the selected element from its parent
 */
function getSiblings(element: ContextElement): ContextElement[] {
  if (!element.parent?.children) {
    return [];
  }

  return element.parent.children.filter(
    (child: ContextElement) => child.stagewiseId !== element.stagewiseId,
  );
}

const serializeReactComponentTree = (
  reactInfo: ReactSelectedElementInfo,
  maxDepth = 5,
): string => {
  const names: string[] = [];
  let curr = reactInfo;
  let depth = 0;
  while (curr?.componentName && depth < maxDepth) {
    names.push(
      `[${curr.componentName}${depth === 0 ? ' (containing selected element)' : ''}${curr.isRSC ? ' (RSC)' : ''}]`,
    );
    curr = curr.parent || null;
    depth++;
  }
  return `${names.join(' child of ')}`;
};

export function relevantCodebaseFilesToContextSnippet(
  selectedElements: ContextElement[],
  maxFileCount = 20,
  maxFilesPerSelectedElement = 2,
): string {
  // We don't simply flatten the code metadata for every element because that would overly focus the files of the first selected elements.
  // Instead, we interleave and then deduplicate to can as many relevant files as possible.
  const interleavedCodeMetadata: NonNullable<ContextElement['codeMetadata']> =
    [];
  for (let index = 0; index < maxFilesPerSelectedElement; index++) {
    for (const element of selectedElements) {
      const metadata = element.codeMetadata?.[index];
      if (metadata) {
        interleavedCodeMetadata.push(metadata);
      }
    }
  }

  const combinedDedupedCodeMetadata = interleavedCodeMetadata
    .reduce<NonNullable<ContextElement['codeMetadata']>>((acc, curr) => {
      if (!acc) return [curr];
      return acc.find((m) => m.relativePath === curr.relativePath)
        ? acc
        : acc.concat(curr);
    }, [])
    .slice(0, maxFileCount);

  if (combinedDedupedCodeMetadata.length === 0) {
    return '';
  }

  return xml(
    combinedDedupedCodeMetadata.map((file) => ({
      [specialTokens.userMsgAttachmentXmlTag]: {
        _attr: {
          type: 'codebase-file',
          path: file.relativePath,
        },
        _cdata: file.content,
      },
    })),
  );
}

/**
 * Converts a DOM element to an LLM-readable context snippet.
 * Includes up to 2 parent levels, siblings, and up to 4 child levels.
 *
 * @param element - The DOM element to convert
 * @param maxCharacterAmount - Optional maximum number of characters to include
 * @returns Formatted XML-style string that the LLM can parse
 */
export function selectedElementToContextSnippet(
  element: ContextElement,
): string {
  if (!element) {
    throw new Error('Element cannot be null or undefined');
  }

  const xmlResult = xml({
    [specialTokens.userMsgAttachmentXmlTag]: [
      {
        _attr: {
          type: 'selected-dom-element',
        },
      },
      serializeSelectedElementPart(element),
    ],
  });

  return xmlResult;
}

const minSerializationDepth = -1; // level of parents that are included
const maxSerializationDepth = 2; // level of children that are included
const minUntruncatedDepth = -1; // parent level where we start truncating to minimize size
const maxUntruncatedDepth = 1; // child level where we start truncating to minimize size

const importantAttributes: Set<string> = new Set([
  'class',
  'id',
  'style',
  'name',
  'role',
  'href',
  'for',
]);

function serializeSelectedElementPart(
  element: ContextElement,
  depth = 0,
): xml.XmlObject {
  const truncateParent = depth < minSerializationDepth;
  const truncateChildren = depth > maxSerializationDepth;
  const minimizeContent =
    depth > maxUntruncatedDepth || depth < minUntruncatedDepth;

  // Create all different types of child nodes
  const attributeChildNode = {
    _attr: {},
  };
  const xpathChildNode = depth === 0 ? { xpath: element.xpath } : {}; // only relevant for the reference element, everything is redundant

  const positionChildNode = {
    position: {
      _attr: {
        x: `${Math.round(element.boundingClientRect.left)}px`,
        y: `${Math.round(element.boundingClientRect.top)}px`,
        width: `${Math.round(element.boundingClientRect.width)}px`,
        height: `${Math.round(element.boundingClientRect.height)}px`,
      },
    },
  };

  const attributesChildNodes: xml.XmlObject[] = Object.entries(
    element.attributes,
  )
    .filter(([key]) => !minimizeContent || importantAttributes.has(key))
    .sort((a, _) => (importantAttributes.has(a[0]) ? -1 : 1)) // We should make sure that important attributes are never cut off
    .slice(0, 12)
    .map(([key, value]) => ({
      attr: {
        _attr: { name: key },
        _cdata: truncateTextContent(
          JSON.stringify(value),
          importantAttributes.has(key) ? 128 : 64,
        ),
      },
    }));

  const computedStylesChildNode: xml.XmlObject =
    !minimizeContent && element.computedStyles
      ? {
          computedStyles: {
            _cdata: truncateTextContent(
              JSON.stringify(element.computedStyles ?? {}),
              200,
            ),
          },
        }
      : {};

  const ownPropertiesChildNodes: xml.XmlObject[] = !minimizeContent
    ? Object.entries(element.ownProperties)
        .slice(0, 10)
        .map(([key, value]) => ({
          'own-prop': {
            _attr: { name: key },
            _cdata: truncateTextContent(JSON.stringify(value), 24),
          },
        }))
    : [];

  const textContentChildNode: xml.XmlObject =
    element.textContent &&
    depth >= 0 &&
    !element.children?.some(
      (child) => child.textContent && child.textContent.length > 0, // We only show text content if no children have text content
    )
      ? {
          textContent: {
            _cdata: truncateTextContent(
              element.textContent,
              minimizeContent ? 32 : 128,
            ),
          },
        }
      : {};

  const parentChildNode: xml.XmlObject =
    !truncateParent && depth <= 0 && element.parent
      ? {
          parent: [serializeSelectedElementPart(element.parent, depth - 1)],
        }
      : {};

  const siblingChildNodes: xml.XmlObject[] =
    depth === 0
      ? getSiblings(element).map((sibling) => ({
          sibling: serializeSelectedElementPart(sibling, maxSerializationDepth),
        }))
      : [];

  const childrenChildNodes: xml.XmlObject[] =
    !truncateChildren && depth >= 0 && element.children
      ? element.children.slice(0, 3).map((child) => ({
          child: [serializeSelectedElementPart(child, depth + 1)],
        }))
      : [];

  const relatedFileChildNodes: xml.XmlObject[] = !minimizeContent
    ? (element.codeMetadata || []).map((file) => ({
        'file-ref': {
          _attr: {
            path: file.relativePath,
            relation: file.relation.length > 0 ? file.relation : undefined,
            startLine: file.startLine !== 0 ? file.startLine : undefined,
          },
        },
      }))
    : [];

  const reactComponentTreeChildNode: xml.XmlObject =
    element.frameworkInfo?.react && depth === 0
      ? {
          'react-component-tree': {
            _cdata: serializeReactComponentTree(element.frameworkInfo.react),
          },
        }
      : {};

  return {
    [(element.nodeType || element.tagName).toLowerCase()]: [
      attributeChildNode,
      xpathChildNode,
      positionChildNode,
      computedStylesChildNode,
      ...ownPropertiesChildNodes,
      ...attributesChildNodes,
      textContentChildNode,
      parentChildNode,
      ...siblingChildNodes,
      ...childrenChildNodes,
      ...relatedFileChildNodes,
      reactComponentTreeChildNode,
    ],
  };
}

function truncateTextContent(textContent: string, maxLength: number): string {
  return textContent.length > maxLength
    ? `${textContent.slice(0, maxLength)}...${specialTokens.truncated(textContent.length - maxLength, 'char')}`
    : textContent;
}
