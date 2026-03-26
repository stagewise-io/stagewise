// NOTE: This file is vibe-coded:
// To refactor this when the toolparts change, just render a chat-history, let an agent add tracing to the toolparts, and adapt this file to the new toolpart-sizes.
// The agent can iterate over the function until the heights have acceptable accuracy (~10px difference on average)
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type {
  UIMessagePart,
  ToolUIPart,
  ReasoningUIPart,
  UIDataTypes,
  TextUIPart,
} from 'ai';
import type { UIAgentTools } from '@shared/karton-contracts/ui/agent/tools/types';

// =============================================================================
// Height Constants (in pixels)
// =============================================================================

const HEIGHTS = {
  // Tool parts
  TOOL_HEADER: 24, // h-6 - tool part trigger/header
  WRITE_TOOL_EXPANDED: 200, // Average height for expanded write tools
  // Write tools show: header (24px) + content (~150px avg) + footer (24px if present) + border
  // Bumped to 200px to account for larger diffs

  // User message
  USER_PADDING_V: 6, // py-1.5 - user message vertical padding
  USER_MAX_HEIGHT: 174, // max-h-43.5 - user message max content height
  USER_MARGIN_TOP: 8, // mt-2 - user message top margin

  // Assistant message
  ASSISTANT_MARGIN_TOP: 8, // mt-2 - assistant message top margin
  ASSISTANT_MIN_HEIGHT: 32, // min-h-8 - assistant message min height
  ASSISTANT_PADDING_V: 6, // py-1.5 - assistant message wrapper padding
  ASSISTANT_INNER_PADDING_V: 3, // py-1.5 on inner wrapper = 6px total

  // Text rendering
  TEXT_LINE_HEIGHT: 22, // ~14px font * 1.625 line-height
  PARAGRAPH_MARGIN: 16, // my-2 - paragraph margins (8px top + 8px bottom)
  CHARS_PER_LINE: 60, // approximate characters per line at default width

  // Spacing
  GAP_PARTS: 8, // space-y-2 gap between parts

  // Border/padding overhead on tool groups (border-t, padding, etc.)
  TOOL_BORDER_OVERHEAD: 2, // Small overhead for borders on tool containers
};

// =============================================================================
// Type Definitions
// =============================================================================

type MessagePart = UIMessagePart<UIDataTypes, UIAgentTools>;

/** Grouped parts structure - either a single part or a group of read-only parts */
type GroupedPart =
  | { type: 'single'; part: MessagePart }
  | { type: 'exploring-group'; parts: MessagePart[] };

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine if a part is a "read-only" tool that should be grouped into
 * an exploring section. Mirrors the logic in exploring.tsx isReadOnlyToolPart().
 */
function isReadOnlyToolPart(part: MessagePart): boolean {
  return (
    part.type === 'reasoning' ||
    part.type === 'tool-glob' ||
    part.type === 'tool-grepSearch' ||
    part.type === 'tool-read' ||
    part.type === 'tool-ls' ||
    part.type === 'tool-searchInLibraryDocs' ||
    part.type === 'tool-listLibraryDocs' ||
    part.type === 'tool-executeSandboxJs' ||
    part.type === 'tool-readConsoleLogs' ||
    part.type === 'tool-getLintingDiagnostics' ||
    part.type === 'tool-updateWorkspaceMd'
  );
}

/**
 * Check if a part is a tool or reasoning part (for grouping logic).
 * Mirrors the logic in message-utils.ts isToolOrReasoningPart().
 */
function isToolOrReasoningPart(
  part: MessagePart,
): part is ToolUIPart<UIAgentTools> | ReasoningUIPart {
  return (
    part.type === 'dynamic-tool' ||
    part.type.startsWith('tool-') ||
    part.type === 'reasoning'
  );
}

/**
 * Group consecutive read-only tool parts together, mirroring the logic
 * in message-assistant.tsx (lines 92-116).
 *
 * This ensures our height estimation matches how parts are actually rendered.
 */
function groupAssistantParts(parts: MessagePart[]): GroupedPart[] {
  const grouped: GroupedPart[] = [];

  for (const part of parts) {
    // Skip step-start parts - they don't render anything
    if (part.type === 'step-start') continue;

    // Check if this is a read-only tool or reasoning part that should be grouped
    if (isToolOrReasoningPart(part) && isReadOnlyToolPart(part)) {
      const lastGrouped = grouped[grouped.length - 1];

      // Merge into previous exploring group if one exists
      if (lastGrouped && lastGrouped.type === 'exploring-group') {
        lastGrouped.parts.push(part);
      } else {
        // Create a new exploring group
        grouped.push({ type: 'exploring-group', parts: [part] });
      }
    } else {
      // Non-grouped part stays individual
      grouped.push({ type: 'single', part });
    }
  }

  return grouped;
}

// =============================================================================
// Part Height Estimators
// =============================================================================

/**
 * Estimate the height of a text part based on content length.
 * Accounts for markdown rendering, paragraphs, and line wrapping.
 */
function estimateTextPartHeight(text: string, availableWidth: number): number {
  if (!text || text.trim() === '') return 0;

  // Assistant messages have max-w-xl (576px), so constrain width
  const maxTextWidth = Math.min(availableWidth, 576);

  // Estimate characters per line based on available width
  // Assume ~7px per character at 14px font size (slightly tighter for typical text)
  const charsPerLine = Math.max(
    30,
    Math.floor(maxTextWidth / 7) || HEIGHTS.CHARS_PER_LINE,
  );

  // Split into paragraphs (double newline) and single lines
  const paragraphs = text.split(/\n\n+/);
  let totalHeight = 0;
  let isFirstParagraph = true;

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') continue;

    // Also account for single newlines within paragraph
    const lines = paragraph.split('\n');
    let paragraphLines = 0;

    for (const line of lines) {
      // Each line wraps based on character count
      paragraphLines += Math.max(1, Math.ceil(line.length / charsPerLine));
    }

    const paragraphHeight = paragraphLines * HEIGHTS.TEXT_LINE_HEIGHT;

    // Add paragraph margin between paragraphs
    if (!isFirstParagraph) {
      totalHeight += HEIGHTS.PARAGRAPH_MARGIN;
    }
    totalHeight += paragraphHeight;
    isFirstParagraph = false;
  }

  return totalHeight;
}

/**
 * Estimate height for a single read-only tool when rendered individually.
 * These render as single-line summaries (e.g., "Read file.ts").
 */
function estimateSingleReadOnlyToolHeight(_part: MessagePart): number {
  // All read-only tools render as a single h-6 row when shown individually
  return HEIGHTS.TOOL_HEADER;
}

/**
 * Estimate height for a group of read-only tools (ExploringToolParts).
 *
 * - Single part: renders inline as h-6 (24px) + small border overhead
 * - Multiple parts: renders as collapsible group, collapsed by default (h-6) + border
 */
function estimateExploringGroupHeight(parts: MessagePart[]): number {
  if (parts.length === 0) return 0;

  // Single part renders inline without collapsible wrapper
  if (parts.length === 1) {
    return (
      estimateSingleReadOnlyToolHeight(parts[0]!) + HEIGHTS.TOOL_BORDER_OVERHEAD
    );
  }

  // Multiple parts render as a collapsible group, collapsed by default (h-6)
  return HEIGHTS.TOOL_HEADER + HEIGHTS.TOOL_BORDER_OVERHEAD;
}

/**
 * Estimate height for reasoning/thinking parts.
 * Collapsed by default, showing just the trigger row.
 */
function estimateReasoningPartHeight(_part: ReasoningUIPart): number {
  // Reasoning parts are collapsed by default (unless streaming, but we estimate initial state)
  return HEIGHTS.TOOL_HEADER;
}

/**
 * Estimate height for write tools (multi-edit, overwrite, delete).
 * These render EXPANDED by default showing the file diff/content.
 */
function estimateWriteToolHeight(_part: ToolUIPart<UIAgentTools>): number {
  // Write tools show expanded diff content (header + diff preview + footer)
  // They are NOT collapsed by default - they show the actual changes
  // Include border overhead for the tool container
  return HEIGHTS.WRITE_TOOL_EXPANDED + HEIGHTS.TOOL_BORDER_OVERHEAD;
}

/**
 * Estimate height for unknown/unrecognized tool parts.
 * Fallback to standard tool header height.
 */
function estimateUnknownToolHeight(_part: MessagePart): number {
  return HEIGHTS.TOOL_HEADER;
}

// =============================================================================
// Message Height Estimators
// =============================================================================

/**
 * Estimate the total height of an assistant message.
 * Groups parts according to the rendering logic and sums their heights.
 */
function estimateAssistantMessageHeight(
  message: AgentMessage & { role: 'assistant' },
  availableWidth: number,
): number {
  const groupedParts = groupAssistantParts(message.parts);

  if (groupedParts.length === 0) return 0;

  // Start with top margin + inner wrapper padding (py-1.5 = 6px total)
  let totalHeight =
    HEIGHTS.ASSISTANT_MARGIN_TOP + HEIGHTS.ASSISTANT_INNER_PADDING_V * 2;
  let isFirstVisiblePart = true;

  for (const grouped of groupedParts) {
    let partHeight = 0;

    if (grouped.type === 'exploring-group') {
      // Grouped read-only tools
      partHeight = estimateExploringGroupHeight(grouped.parts);
    } else {
      // Single part - dispatch based on type
      const part = grouped.part;

      switch (part.type) {
        case 'text': {
          const textPart = part as TextUIPart;
          if (textPart.text.trim() === '') continue;
          partHeight = estimateTextPartHeight(textPart.text, availableWidth);
          break;
        }

        case 'reasoning': {
          const reasoningPart = part as ReasoningUIPart;
          if (reasoningPart.text.trim() === '') continue;
          partHeight = estimateReasoningPartHeight(reasoningPart);
          break;
        }

        case 'tool-multiEdit':
        case 'tool-write':
        case 'tool-copy':
        case 'tool-delete': {
          partHeight = estimateWriteToolHeight(
            part as ToolUIPart<UIAgentTools>,
          );
          break;
        }

        case 'file': {
          // File parts have a fixed preview height
          partHeight = HEIGHTS.TOOL_HEADER;
          break;
        }

        default: {
          // Unknown tool or other part type
          if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
            partHeight = estimateUnknownToolHeight(part);
          }
          break;
        }
      }
    }

    if (partHeight > 0) {
      // Add gap between parts (except before first)
      if (!isFirstVisiblePart) {
        totalHeight += HEIGHTS.GAP_PARTS;
      }
      totalHeight += partHeight;
      isFirstVisiblePart = false;
    }
  }

  // Ensure minimum height
  return Math.max(totalHeight, HEIGHTS.ASSISTANT_MIN_HEIGHT);
}

/**
 * Estimate the total height of a user message.
 * User messages have a max-height cap and consistent padding.
 */
function estimateUserMessageHeight(
  message: AgentMessage & { role: 'user' },
  availableWidth: number,
): number {
  // Extract text content from user message parts
  const textContent = message.parts
    .filter((p): p is TextUIPart => p.type === 'text')
    .map((p) => p.text)
    .join('\n');

  // Estimate text height
  const textHeight = estimateTextPartHeight(textContent, availableWidth);

  // Apply max-height cap (user messages are capped at 174px content height)
  const cappedTextHeight = Math.min(textHeight, HEIGHTS.USER_MAX_HEIGHT);

  // Add padding and margins
  return (
    HEIGHTS.USER_MARGIN_TOP + cappedTextHeight + HEIGHTS.USER_PADDING_V * 2
  );
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Calculate estimated heights for all chat messages.
 *
 * This function is designed to work with Virtuoso's height estimation.
 * It mirrors the rendering logic in chat-history.tsx and message-assistant.tsx
 * to provide accurate initial height estimates.
 *
 * @param messages - Array of messages (already merged by chat-history.tsx)
 * @param chatPanelWidth - Width of the chat panel in pixels
 * @returns Array of estimated heights in pixels, one per message
 */
export function calculateChatItemHeights(
  messages: AgentMessage[],
  chatPanelWidth: number,
): number[] {
  // Calculate available width for content (subtract padding)
  const availableWidth = chatPanelWidth - 40; // pl-4 (16px) + pr (18px or 5px) ≈ 40px

  return messages.map((message) => {
    if (message.role === 'user') {
      return estimateUserMessageHeight(
        message as AgentMessage & { role: 'user' },
        availableWidth,
      );
    }

    if (message.role === 'assistant') {
      return estimateAssistantMessageHeight(
        message as AgentMessage & { role: 'assistant' },
        availableWidth,
      );
    }

    // Fallback for any other message type
    return 100;
  });
}
