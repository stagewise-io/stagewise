import type { JSONContent } from '@tiptap/core';
import type {
  FileAttachment,
  TextClipAttachment,
} from '@shared/karton-contracts/ui/agent/metadata';
import type { SelectedElement } from '@shared/selected-elements';

// Why a custom parser instead of TipTap's MarkdownManager?
//
// MarkdownManager uses `marked` internally, which parses standard markdown
// (lists, headings, bold, etc.) into structured tokens. Since user messages
// are plain text, this caused content loss — e.g. "1. item" became a list
// token with no matching TipTap extension, so the text was silently dropped.
//
// We could configure marked to disable its built-in rules while keeping our
// custom attachment tokenizers, but that means fighting the library: overriding
// tokenizers for lists, headings, blockquotes, emphasis, etc. and hoping
// future marked/@tiptap/markdown updates don't change the internals.
//
// This custom parser is ~30 lines that does exactly one thing: split text
// into paragraphs/hard breaks and extract [](protocol:id) attachment links.
// No third-party markdown library, no risk of standard rules leaking through.
//
// Trade-off: the attachment link regex is duplicated here and in each
// extension's markdownTokenizer. The patterns are trivial, and PROTOCOL_TO_NODE
// makes it obvious where to update if a new protocol is added.

/**
 * Regex matching attachment link syntax: [optional label](protocol:id)
 * Protocols: att, element, text-clip, mention, slash
 * The label in brackets is optional — empty brackets [] are fine.
 * For att: protocol, the id may contain query params (e.g. att:id?display=expanded).
 * For mention: protocol, the id contains providerType:id (e.g. mention:file:src/foo.ts).
 */
const ATTACHMENT_LINK_RE =
  /\[([^\]]*)\]\((att|element|text-clip|mention|slash):((?:[^()]|\([^()]*\))+)\)/g;

/** Maps attachment link protocol to TipTap node type */
const PROTOCOL_TO_NODE: Record<string, string> = {
  att: 'attachment',
  element: 'elementAttachment',
  'text-clip': 'textClipAttachment',
  mention: 'mention',
  slash: 'slash',
};

/**
 * Parses a single line of text into TipTap inline content nodes.
 * Attachment links ([label](protocol:id)) become attachment nodes;
 * everything else becomes plain text nodes.
 */
function parseLineToInlineContent(line: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let lastIndex = 0;

  const re = new RegExp(ATTACHMENT_LINK_RE.source, 'g');
  for (let match = re.exec(line); match !== null; match = re.exec(line)) {
    // Text before the attachment link
    if (match.index > lastIndex) {
      nodes.push({
        type: 'text',
        text: line.slice(lastIndex, match.index),
      });
    }

    const [, bracketLabel, protocol, rawId] = match;
    const nodeType = PROTOCOL_TO_NODE[protocol!];
    if (nodeType) {
      if (nodeType === 'slash') {
        const id = rawId;
        const label = bracketLabel || `/${id}`;
        nodes.push({
          type: nodeType,
          attrs: { id, label },
        });
      } else if (nodeType === 'mention') {
        const colonIdx = rawId!.indexOf(':');
        const providerType = colonIdx >= 0 ? rawId!.slice(0, colonIdx) : 'file';
        const id = colonIdx >= 0 ? rawId!.slice(colonIdx + 1) : rawId;
        const label = bracketLabel || id;
        nodes.push({
          type: nodeType,
          attrs: { id, label, providerType },
        });
      } else {
        const qIdx = rawId!.indexOf('?');
        const id = qIdx >= 0 ? rawId!.slice(0, qIdx) : rawId;
        nodes.push({ type: nodeType, attrs: { id, label: id } });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after the last attachment link
  if (lastIndex < line.length) {
    nodes.push({ type: 'text', text: line.slice(lastIndex) });
  }

  return nodes;
}

/**
 * Converts plain text (with attachment links) to TipTap JSON content.
 *
 * Text is treated as plain text — no markdown formatting is applied.
 * Only attachment link syntax ([](protocol:id)) is parsed into
 * attachment nodes. This preserves characters like `1.`, `-`, `*`,
 * `#`, etc. as literal text.
 *
 * Paragraph boundaries follow TipTap's getText() convention:
 * - `\n\n` separates paragraphs
 * - `\n` within a paragraph becomes a hard break
 *
 * @param text - The plain text with optional attachment links
 * @returns TipTap JSON content with attachment nodes (IDs only)
 */
export function markdownToTipTapContent(text: string): JSONContent {
  if (!text) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  // Split by double newlines for paragraph boundaries
  const paragraphs = text.split('\n\n');

  const content: JSONContent[] = paragraphs.map((paragraph) => {
    // Split by single newlines for hard breaks within a paragraph
    const lines = paragraph.split('\n');
    const inlineContent: JSONContent[] = [];

    for (let i = 0; i < lines.length; i++) {
      // Parse attachment links within this line
      const lineNodes = parseLineToInlineContent(lines[i]!);
      inlineContent.push(...lineNodes);

      // Add hard break between lines (not after the last line)
      if (i < lines.length - 1) {
        inlineContent.push({ type: 'hardBreak' });
      }
    }

    return {
      type: 'paragraph',
      content: inlineContent.length > 0 ? inlineContent : undefined,
    };
  });

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

/**
 * Injects attachment data from message metadata into TipTap JSON node attrs.
 *
 * markdownToTipTapContent produces attachment nodes with only IDs (the markdown
 * doesn't carry inline data like URLs or text clip content). This function
 * walks the tree and patches each attachment node with the full data from the
 * original message metadata, making the result identical to what the editor
 * produces during fresh composition.
 */
export function enrichTipTapContent(
  content: JSONContent,
  metadata: {
    fileAttachments?: FileAttachment[];
    textClipAttachments?: TextClipAttachment[];
    selectedPreviewElements?: SelectedElement[];
  },
): JSONContent {
  const fileMap = new Map(
    (metadata.fileAttachments ?? []).map((f) => [f.id, f]),
  );
  const clipMap = new Map(
    (metadata.textClipAttachments ?? []).map((c) => [c.id, c]),
  );
  const elementMap = new Map(
    (metadata.selectedPreviewElements ?? []).map((e) => [e.stagewiseId, e]),
  );

  function walk(node: JSONContent): JSONContent {
    const id = node.attrs?.id as string | undefined;

    if (node.type === 'attachment' && id) {
      const file = fileMap.get(id);
      if (file) {
        return {
          ...node,
          attrs: {
            ...node.attrs,
            label: file.fileName ?? node.attrs?.label,
            mediaType: file.mediaType,
          },
        };
      }
    }

    if (node.type === 'textClipAttachment' && id) {
      const clip = clipMap.get(id);
      if (clip) {
        return {
          ...node,
          attrs: {
            ...node.attrs,
            label: clip.label,
            content: clip.content,
          },
        };
      }
    }

    if (node.type === 'elementAttachment' && id) {
      const el = elementMap.get(id);
      if (el) {
        const tagName = (el.nodeType || el.tagName).toLowerCase();
        const domId = el.attributes?.id ? `#${el.attributes.id}` : '';
        return {
          ...node,
          attrs: {
            ...node.attrs,
            label: `${tagName}${domId}`,
          },
        };
      }
    }

    if (node.content) {
      return { ...node, content: node.content.map(walk) };
    }

    return node;
  }

  return walk(content);
}
