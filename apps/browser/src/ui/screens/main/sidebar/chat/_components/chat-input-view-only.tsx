import { useMemo, useState } from 'react';
import { cn } from '@ui/utils';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import {
  AttachmentRegistryNodeView,
  ElementAttachmentView,
  TextClipAttachmentView,
} from './rich-text/attachments';
import { MentionNodeView } from './rich-text/mentions';
import type { Content } from '@tiptap/core';

/**
 * TipTap document structure types for parsing JSON content.
 */
interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
}

interface TiptapDoc {
  type: 'doc';
  content?: TiptapNode[];
}

export interface ChatInputViewOnlyProps {
  /** TipTap JSON content */
  tipTapContent?: Content;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Lightweight view-only renderer for TipTap content.
 * Renders the document as static React without initializing a TipTap editor.
 *
 * This component is used in MessageUser when not in edit mode to avoid
 * the performance overhead of creating full TipTap editor instances for
 * every message in the chat history.
 *
 * Attachment data (URLs, content) is looked up from context by the attachment
 * view components using MessageAttachmentsProvider.
 *
 * Includes max-height constraint with fade mask when content overflows.
 */
export function ChatInputViewOnly({
  tipTapContent,
  className,
}: ChatInputViewOnlyProps) {
  // Container ref for overflow fade effect
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const containerRef = useMemo(
    () => ({ current: container }),
    [container],
  ) as React.RefObject<HTMLDivElement>;

  // Scroll fade mask (only bottom fade when content overflows)
  const { maskStyle } = useScrollFadeMask(containerRef, {
    axis: 'vertical',
    fadeDistances: { top: 0, bottom: 16 },
  });

  // If no valid JSON content, render plain text fallback
  if (!tipTapContent) return null;
  else if (typeof tipTapContent === 'string') {
    return (
      <div
        ref={setContainer}
        className={cn(
          'mask-alpha max-h-43.5 w-full overflow-y-hidden',
          className,
        )}
        style={maskStyle}
      >
        <p className="m-0 min-h-[1.5em] leading-relaxed">{tipTapContent}</p>
      </div>
    );
  }

  return (
    <div
      ref={setContainer}
      className={cn(
        // Max height with overflow fade
        'mask-alpha max-h-43.5 overflow-y-hidden',
        // Match ChatInput prose styling
        'h-full w-full text-foreground text-sm',
        'prose prose-sm max-w-none',
        '[&_p]:m-0 [&_p]:leading-relaxed',
        className,
      )}
      style={maskStyle}
    >
      {(tipTapContent as TiptapDoc)?.content?.map((node, index) => (
        <RenderNode key={getNodeKey(node, index)} node={node} />
      ))}
    </div>
  );
}

/**
 * Generates a stable key for a TipTap node.
 * Uses the node's id attribute if available, otherwise falls back to type + index.
 */
function getNodeKey(node: TiptapNode, index: number): string {
  const id = node.attrs?.id;
  if (typeof id === 'string' && id) return `${node.type}-${id}-${index}`;

  return `${node.type}-${index}`;
}

/**
 * Recursively renders a TipTap node as React elements.
 * Attachment views look up their data from context (MessageAttachmentsProvider).
 */
function RenderNode({ node }: { node: TiptapNode }): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p className="m-0 min-h-[1.5em] leading-relaxed">
          {node.content?.map((child, index) => (
            <RenderNode key={getNodeKey(child, index)} node={child} />
          ))}
        </p>
      );

    case 'text':
      return node.text ?? null;

    case 'hardBreak':
      return <br />;

    case 'elementAttachment':
      return (
        <ElementAttachmentView
          viewOnly
          selected={false}
          node={{ attrs: node.attrs ?? {} }}
        />
      );

    case 'attachment':
      return (
        <AttachmentRegistryNodeView
          viewOnly
          selected={false}
          node={{
            attrs: {
              mediaType: 'application/octet-stream',
              ...node.attrs,
            },
          }}
        />
      );

    case 'textClipAttachment':
      return (
        <TextClipAttachmentView
          viewOnly
          selected={false}
          node={{ attrs: node.attrs ?? {} }}
        />
      );

    case 'mention':
      return (
        <MentionNodeView
          viewOnly
          selected={false}
          node={{ attrs: node.attrs ?? {} }}
        />
      );

    default:
      // Unknown node type - try to render children if any
      if (node.content)
        return node.content.map((child, index) => (
          <RenderNode key={getNodeKey(child, index)} node={child} />
        ));

      return null;
  }
}
