import type { JSONContent } from '@tiptap/core';
import type { AttachmentMetadata } from '@shared/karton-contracts/ui/agent/metadata';

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
// extension's markdownTokenizer. The patterns are trivial.

/**
 * Regex matching attachment link syntax: [optional label](protocol:id)
 * Protocols: path, slash
 * The label in brackets is optional — empty brackets [] are fine.
 * For path:att/ sub-paths, the id may contain query params.
 * For path: protocol, the id is the path remainder (att/<id>, or mount/file, or mount).
 * For tab: protocol, the id is the tab identifier.
 * For mention: legacy protocol, the id contains providerType:id (e.g. mention:file:src/foo.ts).
 */
const ATTACHMENT_LINK_RE =
  /\[([^\]]*)\]\((path|tab|mention|slash):((?:[^()]|\([^()]*\))+)\)/g;

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

    if (protocol === 'slash') {
      const id = rawId;
      const label = bracketLabel || `/${id}`;
      nodes.push({
        type: 'slash',
        attrs: { id, label },
      });
    } else if (protocol === 'path') {
      const qIdx = rawId!.indexOf('?');
      const cleanId = qIdx >= 0 ? rawId!.slice(0, qIdx) : rawId!;

      if (cleanId.startsWith('att/')) {
        // att/ sub-paths are attachment or elementAttachment nodes.
        const label = cleanId.split('/').pop() ?? cleanId;
        if (cleanId.endsWith('.swdomelement')) {
          nodes.push({
            type: 'elementAttachment',
            attrs: { id: cleanId, label, blobPath: cleanId },
          });
        } else {
          nodes.push({ type: 'attachment', attrs: { id: cleanId, label } });
        }
      } else {
        // Non-att path: workspace file or workspace root — mention node.
        // Determine providerType: paths with `/` are file mentions,
        // bare prefixes (no `/`) are workspace mentions.
        const providerType = cleanId.includes('/') ? 'file' : 'workspace';
        nodes.push({
          type: 'mention',
          attrs: { id: cleanId, label: cleanId, providerType },
        });
      }
    } else if (protocol === 'tab') {
      // tab: protocol — tab mention node.
      nodes.push({
        type: 'mention',
        attrs: { id: rawId, label: rawId, providerType: 'tab' },
      });
    } else if (protocol === 'mention') {
      // Legacy mention:providerType:id — parse providerType from id.
      const colonIdx = rawId!.indexOf(':');
      if (colonIdx > 0) {
        const providerType = rawId!.slice(0, colonIdx);
        const id = rawId!.slice(colonIdx + 1);
        nodes.push({
          type: 'mention',
          attrs: { id, label: id, providerType },
        });
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
    attachments?: AttachmentMetadata[];
  },
): JSONContent {
  const fileMap = new Map((metadata.attachments ?? []).map((f) => [f.path, f]));

  function walk(node: JSONContent): JSONContent {
    const id = node.attrs?.id as string | undefined;

    if (node.type === 'attachment' && id) {
      const file = fileMap.get(id);
      if (file) {
        const displayName =
          file.originalFileName ??
          file.path.split('/').pop() ??
          node.attrs?.label;
        return {
          ...node,
          attrs: {
            ...node.attrs,
            label: displayName,
          },
        };
      }
    }

    if (node.type === 'elementAttachment' && id) {
      const file = fileMap.get(id);
      if (file) {
        // Extract tag name from originalFileName (e.g. "div_header.swdomelement" → "div")
        const baseName = (file.originalFileName ?? '').replace(
          /\.swdomelement$/,
          '',
        );
        const tagName = baseName.split('_')[0] || undefined;
        return {
          ...node,
          attrs: {
            ...node.attrs,
            tagName: node.attrs?.tagName ?? tagName,
            label:
              node.attrs?.label !== id.split('/').pop()
                ? node.attrs?.label
                : tagName
                  ? `<${tagName}>`
                  : node.attrs?.label,
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
